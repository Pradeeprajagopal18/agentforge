import json
import os
import re
import urllib.request
import urllib.error
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from session import (
    Session, init_db,
    save_conversation, save_message,
    load_conversations, load_messages,
    delete_conversation, get_conversation_stats,
    rename_conversation, branch_conversation,
)
from claude_bridge import ClaudeBridge
from settings_manager import load_settings, save_settings
from file_search import search_files, read_file
from export_utils import export_as_markdown, export_as_json

load_dotenv()
init_db()

app = FastAPI(title="AgentForge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions: dict[str, Session] = {}


# ── Settings ─────────────────────────────────────────────────────

class SettingsPayload(BaseModel):
    model:             str  = ""
    system_prompt:     str  = ""
    working_dir:       str  = "~"
    allowed_tools:     list = []
    mcp_servers:       dict = {}
    team_prompts_path: str  = ""
    github_token:      str  = ""


@app.get("/settings")
async def get_settings():
    return load_settings()


@app.post("/settings")
async def post_settings(payload: SettingsPayload):
    data = payload.dict()
    data["working_dir"] = os.path.expanduser(data["working_dir"])
    return save_settings(data)


# ── File search (@mentions) ───────────────────────────────────────

@app.get("/files/search")
async def files_search(q: str = Query(""), limit: int = Query(8)):
    cfg = load_settings()
    working_dir = os.path.expanduser(cfg.get("working_dir", "~"))
    files = search_files(working_dir, q, limit=limit)
    safe = [{"name": f["name"], "path": f["path"], "size_kb": f["size_kb"], "ext": f["ext"]} for f in files]
    return {"files": safe, "working_dir": working_dir}


@app.get("/files/read")
async def files_read(path: str = Query(...)):
    cfg = load_settings()
    working_dir = os.path.expanduser(cfg.get("working_dir", "~"))
    full_path = os.path.realpath(os.path.join(working_dir, path))
    if not full_path.startswith(os.path.realpath(working_dir)):
        return {"error": "Access denied"}
    content = read_file(full_path)
    if content is None:
        return {"error": "Could not read file"}
    return {"content": content, "path": path}


# ── Health ────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    """Return backend status and which Claude Code auth method is configured."""
    auth_method = "none"
    auth_detail = "No credentials found — run `claude /login` or set ANTHROPIC_API_KEY"

    if os.getenv("ANTHROPIC_API_KEY", "").strip():
        auth_method = "api_key"
        auth_detail = "ANTHROPIC_API_KEY is set"
    elif os.getenv("ANTHROPIC_AUTH_TOKEN", "").strip():
        auth_method = "auth_token"
        auth_detail = "ANTHROPIC_AUTH_TOKEN is set (bearer/proxy)"
    elif os.getenv("CLAUDE_CODE_OAUTH_TOKEN", "").strip():
        auth_method = "oauth_token"
        auth_detail = "CLAUDE_CODE_OAUTH_TOKEN is set"
    elif os.getenv("CLAUDE_CODE_USE_BEDROCK", "").strip():
        auth_method = "bedrock"
        auth_detail = "AWS Bedrock (CLAUDE_CODE_USE_BEDROCK is set)"
    elif os.getenv("CLAUDE_CODE_USE_VERTEX", "").strip():
        auth_method = "vertex"
        auth_detail = "Google Vertex AI (CLAUDE_CODE_USE_VERTEX is set)"
    else:
        # Check for OAuth credentials file (set by `claude /login`)
        cred_paths = [
            os.path.expanduser("~/.claude/.credentials.json"),
            os.path.expanduser("~/.config/claude/.credentials.json"),
        ]
        if any(os.path.exists(p) for p in cred_paths):
            auth_method = "oauth_login"
            auth_detail = "OAuth credentials found (~/.claude/.credentials.json)"

    return {
        "status":      "ok",
        "auth_method": auth_method,
        "auth_detail": auth_detail,
    }


# ── Conversations ─────────────────────────────────────────────────

@app.get("/conversations")
async def get_conversations():
    return load_conversations()


@app.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str):
    return load_messages(conv_id)


@app.get("/conversations/{conv_id}/stats")
async def get_stats(conv_id: str):
    return get_conversation_stats(conv_id)


@app.delete("/conversations/{conv_id}")
async def remove_conversation(conv_id: str):
    if conv_id in sessions:
        await sessions[conv_id].stop()
        del sessions[conv_id]
    delete_conversation(conv_id)
    return {"deleted": conv_id}


@app.post("/conversations/{conv_id}/interrupt")
async def interrupt_session(conv_id: str):
    if conv_id in sessions:
        sessions[conv_id].interrupt()
        return {"interrupted": True}
    return {"interrupted": False}


class RenamePayload(BaseModel):
    title: str

@app.patch("/conversations/{conv_id}")
async def patch_conversation(conv_id: str, payload: RenamePayload):
    rename_conversation(conv_id, payload.title)
    return {"id": conv_id, "title": payload.title}


# ── Export ────────────────────────────────────────────────────────

@app.get("/conversations/{conv_id}/export/markdown")
async def export_markdown(conv_id: str):
    convs = load_conversations()
    conv  = next((c for c in convs if c["id"] == conv_id), None)
    title = conv["title"] if conv else "Conversation"
    msgs  = load_messages(conv_id)
    md    = export_as_markdown(title, msgs)
    filename = title[:40].replace(" ", "_").replace("/", "-") + ".md"
    return PlainTextResponse(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/conversations/{conv_id}/export/json")
async def export_json_endpoint(conv_id: str):
    convs = load_conversations()
    conv  = next((c for c in convs if c["id"] == conv_id), None)
    title = conv["title"] if conv else "Conversation"
    msgs  = load_messages(conv_id)
    data  = export_as_json(conv_id, title, msgs)
    filename = title[:40].replace(" ", "_").replace("/", "-") + ".json"
    from fastapi.responses import JSONResponse
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── WebSocket ──────────────────────────────────────────────────────

@app.websocket("/ws/{conv_id}")
async def websocket_endpoint(websocket: WebSocket, conv_id: str):
    await websocket.accept()

    if conv_id not in sessions:
        cfg = load_settings()
        bridge = ClaudeBridge(
            working_dir=os.path.expanduser(cfg.get("working_dir", "~")),
            allowed_tools=cfg.get("allowed_tools", ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
            mcp_config_path=os.path.expanduser("~/.claude/mcp.json"),
            model=cfg.get("model") or None,
            system_prompt=cfg.get("system_prompt") or None,
        )
        session = Session(id=conv_id, bridge=bridge)
        await session.start()
        sessions[conv_id] = session
    else:
        session = sessions[conv_id]

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

            # Ignore heartbeat pings from frontend
            if data.get("type") == "__ping__":
                continue

            if data.get("type") == "interrupt":
                session.interrupt()
                await websocket.send_text(json.dumps({"type": "interrupted", "message": "Generation stopped."}))
                continue

            user_text   = data.get("message", "").strip()
            attachments = data.get("attachments", [])

            if not user_text and not attachments:
                continue

            title = user_text[:60] if user_text else (attachments[0]["name"] if attachments else "Untitled")
            save_conversation(conv_id, title)
            save_message(conv_id, "user", user_text,
                         attachments=[{"name": a["name"], "type": a["type"]} for a in attachments])

            session.streaming = True
            await session.bridge.send(user_text, attachments=attachments)

            assistant_text = []
            tool_calls     = []
            cost_usd       = None

            try:
                async for event in session.bridge.stream_response():
                    etype = event.get("type")
                    if etype == "assistant":
                        for block in event.get("message", {}).get("content", []):
                            if block.get("type") == "text":
                                assistant_text.append(block["text"])
                            elif block.get("type") == "tool_use":
                                tool_calls.append({"name": block.get("name"), "input": block.get("input", {})})
                    elif etype == "result":
                        cost_usd = event.get("cost_usd")
                    # Forward every event — stream_response always ends with result/error
                    try:
                        await websocket.send_text(json.dumps(event))
                    except Exception:
                        break  # client disconnected mid-stream
            except Exception as stream_err:
                # Unexpected error during streaming — push error to frontend
                print(f"[ws] Stream error for {conv_id}: {stream_err}")
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Streaming error: {stream_err}",
                    }))
                except Exception:
                    pass
            finally:
                # Always persist whatever was collected and reset streaming flag
                if assistant_text or tool_calls:
                    save_message(conv_id, "assistant", "".join(assistant_text),
                                 tool_calls=tool_calls, cost_usd=cost_usd)
                session.streaming = False

            # Auto-title after first assistant response
            msgs = load_messages(conv_id)
            user_msgs = [m for m in msgs if m["role"] == "user"]
            asst_msgs = [m for m in msgs if m["role"] == "assistant"]
            if len(user_msgs) == 1 and len(asst_msgs) == 1:
                asyncio.create_task(generate_title_and_push(
                    conv_id,
                    user_msgs[0]["content"],
                    asst_msgs[0]["content"],
                    websocket,
                ))

    except WebSocketDisconnect:
        print(f"[ws] {conv_id} disconnected")
    except Exception as e:
        print(f"[ws] Error {conv_id}: {e}")
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass


async def generate_title_and_push(conv_id: str, user_msg: str, asst_msg: str, websocket):
    """Generate title and push title_update event back to the frontend."""
    title = await generate_title(conv_id, user_msg, asst_msg)
    if title:
        try:
            await websocket.send_text(json.dumps({
                "type": "title_update",
                "conv_id": conv_id,
                "title": title,
            }))
        except Exception:
            pass  # WS may have closed


if __name__ == "__main__":
    import uvicorn
    backend_port = int(os.getenv("BACKEND_PORT", "9000"))
    uvicorn.run("main:app", host="127.0.0.1", port=backend_port, reload=True)



# ── Conversation branching ─────────────────────────────────────────

class BranchPayload(BaseModel):
    branch_at_msg_id: str

@app.post("/conversations/{conv_id}/branch")
async def create_branch(conv_id: str, payload: BranchPayload):
    try:
        new_conv = branch_conversation(conv_id, payload.branch_at_msg_id)
        return new_conv
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=str(e))


# ── Auto-title generation ──────────────────────────────────────────

import asyncio
import subprocess

async def generate_title(conv_id: str, first_user_msg: str, first_assistant_msg: str):
    """Run a quick non-streaming Claude call to generate a smart 5-word title."""
    prompt = (
        f"Generate a concise 4-6 word title for this conversation. "
        f"Return ONLY the title, no quotes, no punctuation at end.\n\n"
        f"User: {first_user_msg[:200]}\n"
        f"Assistant: {first_assistant_msg[:300]}"
    )
    try:
        env = dict(os.environ)
        if not env.get("ANTHROPIC_API_KEY", "").strip():
            env.pop("ANTHROPIC_API_KEY", None)
        proc = await asyncio.create_subprocess_exec(
            "claude", "-p", prompt,
            "--output-format", "text",
            "--max-turns", "1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15.0)
        title = stdout.decode().strip().strip('"').strip("'")
        if title and 3 < len(title) < 80:
            rename_conversation(conv_id, title)
            return title
    except Exception as e:
        print(f"[auto-title] Failed: {e}")
    return None


# ── Prompt Library ────────────────────────────────────────────────

from prompt_library import get_all_prompts, save_personal_prompt, delete_personal_prompt, sync_team_prompts

class PromptPayload(BaseModel):
    id:          str  = ""
    title:       str
    description: str  = ""
    category:    str  = "general"
    shortcut:    str  = ""
    prompt:      str
    tags:        list = []
    source:      str  = "personal"

@app.get("/prompts")
async def list_prompts():
    cfg = load_settings()
    return get_all_prompts(team_path=cfg.get("team_prompts_path"))

@app.post("/prompts")
async def upsert_prompt(payload: PromptPayload):
    data = payload.dict()
    data["source"] = "personal"
    return save_personal_prompt(data)

@app.delete("/prompts/{prompt_id}")
async def remove_prompt(prompt_id: str):
    ok = delete_personal_prompt(prompt_id)
    return {"deleted": ok}

@app.post("/prompts/sync")
async def sync_prompts():
    cfg = load_settings()
    team_path = cfg.get("team_prompts_path")
    return sync_team_prompts(team_path)


# ── GitHub PR diff ────────────────────────────────────────────────

class GithubPRPayload(BaseModel):
    url: str

@app.post("/github/pr-diff")
async def github_pr_diff(payload: GithubPRPayload):
    """Fetch a PR diff from GitHub using the stored token."""
    url = payload.url.strip()

    # Parse owner/repo/number from URL
    # Supports: https://github.com/owner/repo/pull/123
    m = re.match(r'https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)', url)
    if not m:
        raise HTTPException(status_code=400, detail="Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123")

    owner, repo, pr_number = m.group(1), m.group(2), m.group(3)

    # Resolve token: settings > env var (used by GitHub MCP as well)
    cfg = load_settings()
    token = cfg.get("github_token", "").strip() or os.getenv("GITHUB_TOKEN", "").strip()

    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls/{pr_number}"
    req = urllib.request.Request(api_url)
    req.add_header("Accept", "application/vnd.github.v3.diff")
    req.add_header("User-Agent", "AgentForge/1.0")
    if token:
        req.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            diff = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        if e.code == 401:
            raise HTTPException(status_code=401, detail="GitHub token is invalid or missing. Add one in Settings → Integrations.")
        elif e.code == 403:
            raise HTTPException(status_code=403, detail="GitHub API rate limit hit or access denied. Add a GitHub token in Settings → Integrations.")
        elif e.code == 404:
            raise HTTPException(status_code=404, detail=f"PR not found: {owner}/{repo}#{pr_number}. Check the URL and that the repo is accessible.")
        else:
            raise HTTPException(status_code=e.code, detail=f"GitHub API error: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach GitHub API: {e}")

    # Also fetch PR metadata for context
    meta_req = urllib.request.Request(f"{api_url}")
    meta_req.add_header("Accept", "application/vnd.github.v3+json")
    meta_req.add_header("User-Agent", "AgentForge/1.0")
    if token:
        meta_req.add_header("Authorization", f"Bearer {token}")

    title, body, base_branch, head_branch = "", "", "", ""
    try:
        with urllib.request.urlopen(meta_req, timeout=10) as resp:
            meta = json.loads(resp.read())
            title       = meta.get("title", "")
            body        = meta.get("body") or ""
            base_branch = meta.get("base", {}).get("ref", "")
            head_branch = meta.get("head", {}).get("ref", "")
    except Exception:
        pass  # metadata is nice-to-have

    return {
        "diff":        diff,
        "title":       title,
        "body":        body,
        "base_branch": base_branch,
        "head_branch": head_branch,
        "pr_number":   int(pr_number),
        "repo":        f"{owner}/{repo}",
    }


# ── File write (for artifact apply-to-file) ───────────────────────

class FileWritePayload(BaseModel):
    path:    str
    content: str

@app.post("/files/write")
async def write_file(payload: FileWritePayload):
    cfg = load_settings()
    working_dir = os.path.expanduser(cfg.get("working_dir", "~"))
    full_path   = os.path.realpath(os.path.join(working_dir, payload.path))
    if not full_path.startswith(os.path.realpath(working_dir)):
        return {"ok": False, "error": "Access denied — path outside working directory"}
    try:
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "w", encoding="utf-8") as f:
            f.write(payload.content)
        return {"ok": True, "path": payload.path}
    except Exception as e:
        return {"ok": False, "error": str(e)}
