# AgentForge — TODO

Tasks are worked through one at a time, top to bottom.
Mark `[ ]` → `[x]` when done.

---

## Docker Compose

- [ ] **1. Fix frontend→backend URL**
  - `localhost:9000` is hardcoded in the frontend config; breaks when running via `docker compose up` or accessing from another machine.
  - Fix: read `VITE_BACKEND_HOST` / `VITE_BACKEND_PORT` at build time; default to `window.location.hostname` at runtime so the browser always talks to the right host.

- [ ] **2. Fix `working_dir` default inside container**
  - `settings.json` defaults to `/Users/dhanwin` which doesn't exist inside Docker.
  - Fix: default to `/workspace` inside the container; add a `workspace` volume mount in `docker-compose.yml` so users can point Claude at their code.

- [ ] **3. Fix data-file bind-mount initialisation**
  - If `conversations.db` or `settings.json` don't exist on the host before `docker compose up`, Docker creates them as *directories* instead of files.
  - Fix: add an `init-data` service (or entrypoint script) that `touch`es both files before the backend starts.

- [ ] **4. Add `docker-compose.override.yml` example**
  - Provide a ready-to-use override file that: mounts `~/.claude` for keychain-less auth, sets `ANTHROPIC_API_KEY`, and maps a local code directory to `/workspace`.

- [ ] **5. End-to-end Docker smoke test**
  - `docker compose up` → open browser → send prompt → get response → restart containers → confirm conversation persists.

---

## Multi-Provider Support

- [ ] **6. Create `BaseBridge` abstraction**
  - Extract a common interface (`send`, `stream_response`, `interrupt`, `stop`) that all provider bridges implement.
  - Move `ClaudeBridge` to extend it. No behaviour change — just sets up the pattern.

- [ ] **7. GitHub Copilot bridge**
  - Auth: GitHub personal access token with Copilot scope.
  - API: `https://api.githubcopilot.com` OpenAI-compatible `/v1/chat/completions` with streaming.
  - Normalise events to the same format the frontend already consumes.

- [ ] **8. Cursor / OpenAI-compatible bridge**
  - Configurable `base_url` + `api_key` — covers Cursor, local Ollama, OpenRouter, and any OpenAI-format endpoint.
  - Streaming via SSE `data:` lines → normalised to the same event format.

- [ ] **9. Provider selector in Settings UI**
  - Dropdown: Claude Code / GitHub Copilot / OpenAI-compatible.
  - Show the correct auth fields for the selected provider (API key, base URL, GitHub token, etc.).

- [ ] **10. Wire provider through WebSocket handler**
  - `POST /settings` stores `provider` field.
  - WebSocket endpoint instantiates the correct bridge class based on `settings.provider`.
  - Session reset on settings save already handled — no extra work needed there.

- [ ] **11. Normalise tool-call events across providers**
  - Claude Code: tool calls come from the subprocess event stream.
  - Copilot / OpenAI: tool calls arrive as `function_call` / `tool_calls` JSON in the chat completion delta.
  - Fix: each bridge translates its native format into the shared `{type: "tool_use", name, input}` event shape the frontend already renders.

- [ ] **12. Per-provider model list in Settings**
  - Model dropdown updates based on selected provider.
  - Claude: existing list. Copilot: `gpt-4o`, `o3`, etc. OpenAI-compatible: free-text input (model name varies by endpoint).
