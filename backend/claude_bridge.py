import asyncio
import json
import os
import signal
from typing import AsyncIterator


class ClaudeBridge:
    """
    Manages a single Claude Code subprocess per session.
    Supports streaming, interrupt, and MCP config.
    """

    def __init__(
        self,
        working_dir: str = None,
        allowed_tools: list[str] = None,
        mcp_config_path: str = None,
        model: str = None,
        system_prompt: str = None,
    ):
        self.working_dir = working_dir or os.path.expanduser("~")
        self.allowed_tools = allowed_tools or ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]
        self.mcp_config_path = mcp_config_path
        self.model = model
        self.system_prompt = system_prompt
        self._process: asyncio.subprocess.Process | None = None
        self._interrupted = False

    def _build_cmd(self) -> list[str]:
        cmd = [
            "claude",
            "-p",
            "--input-format",  "stream-json",
            "--output-format", "stream-json",
            "--verbose",
            "--allowedTools",  ",".join(self.allowed_tools),
        ]
        if self.model:
            cmd += ["--model", self.model]
        if self.system_prompt:
            cmd += ["--system-prompt", self.system_prompt]
        if self.mcp_config_path and os.path.exists(self.mcp_config_path):
            cmd += ["--mcp-config", self.mcp_config_path]
        return cmd

    async def start(self):
        """
        Spawn the Claude Code subprocess.

        Auth priority (handled by Claude Code itself — we do not override):
          1. ANTHROPIC_API_KEY env var  (set in backend/.env — recommended for AgentForge)
          2. CLAUDE_CODE_OAUTH_TOKEN   (long-lived token from `claude setup-token`)
          3. ANTHROPIC_AUTH_TOKEN      (bearer token / LLM gateway proxy)
          4. OAuth via `claude /login` (stored in macOS Keychain / ~/.claude/.credentials.json)
          5. Bedrock / Vertex / Foundry (via CLAUDE_CODE_USE_BEDROCK etc.)

        We pass the full inherited environment so all of the above work.
        We only explicitly set ANTHROPIC_API_KEY if it is already in os.environ
        (i.e. loaded from .env by dotenv) — we never inject an empty string, which
        would shadow a working keychain/OAuth credential.
        """
        cmd  = self._build_cmd()
        env  = dict(os.environ)  # inherit everything — includes any CLAUDE_CODE_* vars

        # Only forward the key if it was actually configured — an empty string
        # overrides OAuth/keychain credentials, which we want to avoid.
        api_key = env.get("ANTHROPIC_API_KEY", "").strip()
        if not api_key:
            env.pop("ANTHROPIC_API_KEY", None)  # let Claude Code fall through to next method

        self._process = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            cwd=self.working_dir,
        )
        self._interrupted = False

    async def send(self, user_message: str, attachments: list[dict] = None):
        """
        Write a user message to stdin.
        attachments: list of {type: 'file'|'image', name: str, content: str, media_type: str}
        """
        if not self._process or self._process.returncode is not None:
            await self.start()

        self._interrupted = False

        # Build content blocks
        content = []

        # Add attachments first
        if attachments:
            for att in attachments:
                if att["type"] == "image":
                    content.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": att["media_type"],
                            "data": att["content"],
                        }
                    })
                elif att["type"] == "file":
                    # Inject file content as text block with filename header
                    content.append({
                        "type": "text",
                        "text": f"[File: {att['name']}]\n```\n{att['content']}\n```"
                    })

        # Add the user text
        content.append({"type": "text", "text": user_message})

        payload = json.dumps({
            "type": "user",
            "message": {
                "role": "user",
                "content": content if len(content) > 1 else user_message
            }
        }) + "\n"

        self._process.stdin.write(payload.encode())
        await self._process.stdin.drain()

    async def stream_response(self) -> AsyncIterator[dict]:
        """
        Yield parsed JSON events from Claude stdout until result/error.

        Guarantees the caller always receives a terminal event so the
        frontend never gets stuck in streaming state.  Terminal events:
          • {"type": "result", ...}  — normal completion
          • {"type": "error",  ...}  — any failure path below

        Failure modes handled:
          1. asyncio.TimeoutError  — no output for 60 s
          2. Process exits / EOF   — stdout returns b""
          3. interrupt()           — _interrupted flag set
          4. JSON decode error     — malformed line from subprocess
        """
        got_terminal = False
        try:
            while not self._interrupted:
                try:
                    line = await asyncio.wait_for(
                        self._process.stdout.readline(),
                        timeout=60.0,
                    )
                except asyncio.TimeoutError:
                    yield {"type": "error", "message": "Response timed out after 60 s"}
                    got_terminal = True
                    return

                # EOF — process died without sending a result event
                if not line:
                    if not got_terminal:
                        yield {
                            "type": "error",
                            "message": "Claude Code process ended unexpectedly (no result received)",
                        }
                        got_terminal = True
                    return

                decoded = line.decode().strip()
                if not decoded:
                    continue

                try:
                    event = json.loads(decoded)
                except json.JSONDecodeError:
                    # Skip malformed lines (e.g. debug output from subprocess)
                    continue

                yield event

                if event.get("type") in ("result", "error"):
                    got_terminal = True
                    return

        finally:
            # If we exit the loop due to interrupt and never sent a terminal
            # event, push one so the frontend can clear its streaming state.
            if not got_terminal:
                yield {
                    "type": "result",
                    "subtype": "interrupted",
                    "cost_usd": None,
                    "is_error": False,
                    "result": "",
                }

    def interrupt(self):
        """Signal Claude to stop the current generation."""
        self._interrupted = True
        if self._process and self._process.returncode is None:
            try:
                self._process.send_signal(signal.SIGINT)
            except ProcessLookupError:
                pass

    async def stop(self):
        """Gracefully shut down the subprocess."""
        if self._process:
            try:
                self._process.stdin.close()
                await asyncio.wait_for(self._process.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                self._process.kill()
