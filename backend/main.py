import asyncio
import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Depends
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
from auth import get_current_user, verify_ws_token
from users import router as auth_router, init_users_db

load_dotenv()
init_db()
init_users_db()

app = FastAPI(title="AgentForge")

# ── CORS — locked to explicit allow-list for enterprise security ──
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Mount auth routes (/auth/register, /auth/login, /auth/refresh, /auth/logout, /auth/me, ...)
app.include_router(auth_router)

# sessions keyed by (user_id, conv_id) to prevent cross-user session hijacking
sessions: dict[tuple[str, str], Session] = {}


# ── Settings ─────────────────────────────────────────────────────

class SettingsPayload(BaseModel):
    model:             str  = ""
    system_prompt:     str  = ""
    working_dir:       str  = "~"
    allowed_tools:     list = []
    mcp_servers:       dict = {}
    team_prompts_path: str  = ""
    github_token:      str  = ""
    anthropic_api_key: str  = ""


@app.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    return load_settings()


@app.post("/settings")
async def post_settings(
    payload: SettingsPayload,
    current_user: dict = Depends(get_current_user),
):
    # Only admins may change global settings
    if not current_user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required to change settings")

    data = payload.dict()
    data["working_dir"] = os.path.expanduser(data["working_dir"])

    api_key = data.get("anthropic_api_key", "").strip()
    if api_key:
        os.environ["ANTHROPIC_API_KEY"] = api_key
    else:
        os.environ.pop("ANTHROPIC_API_KEY", None)

    result = save_settings(data)

    # Reset all active sessions so the new settings take effect immediately
    for key in list(sessions.keys()):
        try:
            await sessions[key].stop()
        except Exception:
            pass
    sessions.clear()

    return result


# ── File search (@mentions) ───────────────────────────────────────

@app.get("/files/search")
async def files_search(
    q: str = Query(""),
    limit: int = Query(8),
    current_user: dict = Depends(get_current_user),
):
    cfg = load_settings()
    working_dir = os.path.expanduser(cfg.get("working_dir", "~"))
    files = search_files(working_dir, q, limit=limit)
    safe  = [
        {"name": f["name"], "path": f["path"], "size_kb": f["size_kb"], "ext": f["ext"]}
        for f in files
    ]
    return {"files": safe, "working_dir": working_dir}


@app.get("/files/read")
async def files_read(
    path: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    cfg = load_settings()
    working_dir = os.path.expanduser(cfg.get("working_dir", "~"))
    full_path   = os.path.realpath(os.path.join(working_dir, path))
    if not full_path.startswith(os.path.realpath(working_dir)):
        return {"error": "Access denied"}
    content = read_file(full_path)
    if content is None:
        return {"error": "Could not read file"}
    return {"content": content, "path": path}


@app.post("/files/write")
async def write_file(
    payload: "FileWritePayload",
    current_user: dict = Depends(get_current_user),
):
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


# ── Health (public — used by Docker healthcheck) ──────────────────

async def _check_claude_auth() -> tuple[str, str]:
    if os.getenv("ANTHROPIC_API_KEY", "").strip():
        return "api_key", "ANTHROPIC_API_KEY is set"
    try:
        cfg = load_settings()
        if cfg.get("anthropic_api_key", "").strip():
            return "api_key", "API key configured in Settings"
    except Exception:
        pass
    if os.getenv("ANTHROPIC_AUTH_TOKEN", "").strip():
        return "auth_token", "ANTHROPIC_AUTH_TOKEN is set (bearer/proxy)"
    if os.getenv("CLAUDE_CODE_OAUTH_TOKEN", "").strip():
        return "oauth_token", "CLAUDE_CODE_OAUTH_TOKEN is set"
    if os.getenv("CLAUDE_CODE_USE_BEDROCK", "").strip():
        return "bedrock", "AWS Bedrock (CLAUDE_CODE_USE_BEDROCK is set)"
    if os.getenv("CLAUDE_CODE_USE_VERTEX", "").strip():
        return "vertex", "Google Vertex AI (CLAUDE_CODE_USE_VERTEX is set)"
    cred_paths = [
        os.path.expanduser("~/.claude/.credentials.json"),
        os.path.expanduser("~/.config/claude/.credentials.json"),
    ]
    if any(os.path.exists(p) for p in cred_paths):
        return "oauth_login", "OAuth credentials found (~/.claude/.credentials.json)"
    try:
        env = dict(os.environ)
        env.pop("ANTHROPIC_API_KEY", None)
        proc = await asyncio.create_subprocess_exec(
            "claude", "auth", "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=8.0)
        output = stdout.decode(errors="replace").strip()
        if proc.returncode == 0 and output:
            try:
                data = json.loads(output)
                if data.get("loggedIn"):
                    method  = data.get("authMethod", "claude.ai")
                    account = data.get("claudeAiAccount", {})
                    email   = account.get("emailAddress", "") if isinstance(account, dict) else ""
                    detail  = f"Logged in via {method}" + (f" ({email})" if email else "")
                    return "local", detail
            except (json.JSONDecodeError, TypeError):
                if "not logged in" not in output.lower():
                    first_line = next((l.strip() for l in output.splitlines() if l.strip()), output[:80])
                    return "local", first_line
    except Exception:
        pass
    return "none", "No credentials found — run `claude auth login` or set ANTHROPIC_API_KEY"


@app.get("/health")
async def health():
    """Public health check — used by Docker and load-balancer probes."""
    auth_method, auth_detail = await _check_claude_auth()
    return {"status": "ok", "auth_method": auth_method, "auth_detail": auth_detail}


# ── Conversations ─────────────────────────────────────────────────

@app.get("/conversations")
async def get_conversations(current_user: dict = Depends(get_current_user)):
    """Return conversations belonging to the authenticated user only."""
    return load_conversations(user_id=current_user["id"])


@app.get("/conversations/{conv_id}/messages")
async def get_messages(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    return load_messages(conv_id, user_id=current_user["id"])


@app.get("/conversations/{conv_id}/stats")
async def get_stats(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    return get_conversation_stats(conv_id, user_id=current_user["id"])


@app.delete("/conversations/{conv_id}")
async def remove_conversation(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    key = (current_user["id"], conv_id)
    if key in sessions:
        await sessions[key].stop()
        del sessions[key]
    delete_conversation(conv_id, user_id=current_user["id"])
    return {"deleted": conv_id}


@app.post("/conversations/{conv_id}/interrupt")
async def interrupt_session(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    key = (current_user["id"], conv_id)
    if key in sessions:
        sessions[key].interrupt()
        return {"interrupted": True}
    return {"interrupted": False}


class RenamePayload(BaseModel):
    title: str


@app.patch("/conversations/{conv_id}")
async def patch_conversation(
    conv_id: str,
    payload: RenamePayload,
    current_user: dict = Depends(get_current_user),
):
    rename_conversation(conv_id, payload.title, user_id=current_user["id"])
    return {"id": conv_id, "title": payload.title}


# ── Branching ────────────────────────────────────────────────────

class BranchPayload(BaseModel):
    branch_at_msg_id: str


@app.post("/conversations/{conv_id}/branch")
async def create_branch_endpoint(
    conv_id: str,
    payload: BranchPayload,
    current_user: dict = Depends(get_current_user),
):
    try:
        new_conv = branch_conversation(
            conv_id, payload.branch_at_msg_id, user_id=current_user["id"]
        )
        return new_conv
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ── Export ────────────────────────────────────────────────────────

@app.get("/conversations/{conv_id}/export/markdown")
async def export_markdown(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    convs    = load_conversations(user_id=current_user["id"])
    conv     = next((c for c in convs if c["id"] == conv_id), None)
    title    = conv["title"] if conv else "Conversation"
    msgs     = load_messages(conv_id, user_id=current_user["id"])
    md       = export_as_markdown(title, msgs)
    filename = title[:40].replace(" ", "_").replace("/", "-") + ".md"
    return PlainTextResponse(
        content=md,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/conversations/{conv_id}/export/json")
async def export_json_endpoint(
    conv_id: str,
    current_user: dict = Depends(get_current_user),
):
    from fastapi.responses import JSONResponse
    convs    = load_conversations(user_id=current_user["id"])
    conv     = next((c for c in convs if c["id"] == conv_id), None)
    title    = conv["title"] if conv else "Conversation"
    msgs     = load_messages(conv_id, user_id=current_user["id"])
    data     = export_as_json(conv_id, title, msgs)
    filename = title[:40].replace(" ", "_").replace("/", "-") + ".json"
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── WebSocket ─────────────────────────────────────────────────────
# JWT is passed as ?token=<access_token> because WebSocket clients
# cannot set Authorization headers during the handshake.

@app.websocket("/ws/{conv_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    conv_id: str,
    token: str = Query(..., description="JWT access token"),
):
    # Authenticate before accepting the socket — reject immediately on bad token
    try:
        current_user = verify_ws_token(token)
    except HTTPException:
        await websocket.close(code=4401)  # Custom close code: Unauthorized
        return

    await websocket.accept()
    user_id = current_user["id"]
    key     = (user_id, conv_id)

    # Clean up stale session if its subprocess has died
    if key in sessions:
        existing = sessions[key]
        proc = existing.bridge._process
        if proc is None or proc.returncode is not None:
            try:
                await existing.stop()
            except Exception:
                pass
            del sessions[key]

    if key not in sessions:
        cfg    = load_settings()
        bridge = ClaudeBridge(
            working_dir   = os.path.expanduser(cfg.get("working_dir", "~")),
            allowed_tools = cfg.get("allowed_tools", ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
            mcp_config_path = os.path.expanduser("~/.claude/mcp.json"),
            model         = cfg.get("model") or None,
            system_prompt = cfg.get("system_prompt") or None,
            api_key       = cfg.get("anthropic_api_key", "").strip() or None,
        )
        session = Session(id=conv_id, bridge=bridge)
        await session.start()
        sessions[key] = session
    else:
        session = sessions[key]

    try:
        while True:
            raw  = await websocket.receive_text()
            data = json.loads(raw)

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

            title = user_text[:60] if user_text else (
                attachments[0]["name"] if attachments else "Untitled"
            )
            save_conversation(conv_id, title, user_id=user_id)
            save_message(
                conv_id, "user", user_text,
                attachments=[{"name": a["name"], "type": a["type"]} for a in attachments],
            )

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
                    try:
                        await websocket.send_text(json.dumps(event))
                    except Exception:
                        break
            except Exception as stream_err:
                print(f"[ws] Stream error for {conv_id}: {stream_err}")
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": f"Streaming error: {stream_err}",
                    }))
                except Exception:
                    pass
            finally:
                if assistant_text or tool_calls:
                    save_message(
                        conv_id, "assistant", "".join(assistant_text),
                        tool_calls=tool_calls, cost_usd=cost_usd,
                    )
                session.streaming = False

            # Auto-title after first exchange
            msgs      = load_messages(conv_id, user_id=user_id)
            user_msgs = [m for m in msgs if m["role"] == "user"]
            asst_msgs = [m for m in msgs if m["role"] == "assistant"]
            if len(user_msgs) == 1 and len(asst_msgs) == 1:
                asyncio.create_task(generate_title_and_push(
                    conv_id, user_msgs[0]["content"], asst_msgs[0]["content"],
                    websocket, user_id=user_id,
                ))

    except WebSocketDisconnect:
        print(f"[ws] {conv_id} disconnected (user={user_id})")
    except Exception as e:
        print(f"[ws] Error {conv_id}: {e}")
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
        except Exception:
            pass


async def generate_title_and_push(
    conv_id: str, user_msg: str, asst_msg: str, websocket, user_id: str = None
):
    title = await generate_title(conv_id, user_msg, asst_msg, user_id=user_id)
    if title:
        try:
            await websocket.send_text(json.dumps({
                "type": "title_update",
                "conv_id": conv_id,
                "title": title,
            }))
        except Exception:
            pass


async def generate_title(
    conv_id: str, first_user_msg: str, first_assistant_msg: str, user_id: str = None
):
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
            rename_conversation(conv_id, title, user_id=user_id)
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
async def list_prompts(current_user: dict = Depends(get_current_user)):
    cfg = load_settings()
    return get_all_prompts(team_path=cfg.get("team_prompts_path"))


@app.post("/prompts")
async def upsert_prompt(
    payload: PromptPayload,
    current_user: dict = Depends(get_current_user),
):
    data = payload.dict()
    data["source"] = "personal"
    return save_personal_prompt(data)


@app.delete("/prompts/{prompt_id}")
async def remove_prompt(
    prompt_id: str,
    current_user: dict = Depends(get_current_user),
):
    ok = delete_personal_prompt(prompt_id)
    return {"deleted": ok}


@app.post("/prompts/sync")
async def sync_prompts(current_user: dict = Depends(get_current_user)):
    cfg = load_settings()
    return sync_team_prompts(cfg.get("team_prompts_path"))


# ── GitHub PR diff ────────────────────────────────────────────────

class GithubPRPayload(BaseModel):
    url: str


@app.post("/github/pr-diff")
async def github_pr_diff(
    payload: GithubPRPayload,
    current_user: dict = Depends(get_current_user),
):
    url = payload.url.strip()
    m   = re.match(r'https?://github\.com/([^/]+)/([^/]+)/pull/(\d+)', url)
    if not m:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub PR URL. Expected: https://github.com/owner/repo/pull/123",
        )
    owner, repo, pr_number = m.group(1), m.group(2), m.group(3)
    cfg   = load_settings()
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
            raise HTTPException(status_code=401, detail="GitHub token invalid or missing.")
        elif e.code == 403:
            raise HTTPException(status_code=403, detail="GitHub API rate limit or access denied.")
        elif e.code == 404:
            raise HTTPException(status_code=404, detail=f"PR not found: {owner}/{repo}#{pr_number}")
        else:
            raise HTTPException(status_code=e.code, detail=f"GitHub API error: {e.reason}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach GitHub API: {e}")
    meta_req = urllib.request.Request(api_url)
    meta_req.add_header("Accept", "application/vnd.github.v3+json")
    meta_req.add_header("User-Agent", "AgentForge/1.0")
    if token:
        meta_req.add_header("Authorization", f"Bearer {token}")
    title = body = base_branch = head_branch = ""
    try:
        with urllib.request.urlopen(meta_req, timeout=10) as resp:
            meta        = json.loads(resp.read())
            title       = meta.get("title", "")
            body        = meta.get("body") or ""
            base_branch = meta.get("base", {}).get("ref", "")
            head_branch = meta.get("head", {}).get("ref", "")
    except Exception:
        pass
    return {
        "diff": diff, "title": title, "body": body,
        "base_branch": base_branch, "head_branch": head_branch,
        "pr_number": int(pr_number), "repo": f"{owner}/{repo}",
    }


# ── Pydantic models (referenced above) ───────────────────────────

class FileWritePayload(BaseModel):
    path:    str
    content: str


# ── Entry point ───────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    backend_port = int(os.getenv("BACKEND_PORT", "9000"))
    host         = os.getenv("BACKEND_HOST", "0.0.0.0")
    uvicorn.run("main:app", host=host, port=backend_port, reload=True)
