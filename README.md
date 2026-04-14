# ⬡ AgentForge

A full-featured local AI assistant desktop app built on **Claude Code** (headless/Agent SDK mode). Python FastAPI backend, React 18 frontend, optional Electron wrapper.

---

## Quick Start

### One command
```bash
# macOS / Linux
./start.sh

# Windows
start.bat

# Docker
cp backend/.env.example backend/.env   # add ANTHROPIC_API_KEY
docker compose up --build
# App: http://localhost:5173
```

### Manual
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env      # add ANTHROPIC_API_KEY
python main.py             # :9000

# new terminal
cd frontend
npm install
npm run dev                # :5173
```

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | python.org |
| Node.js | 18+ | nodejs.org |
| Claude Code CLI | latest | `npm install -g @anthropic-ai/claude-code` |
| Anthropic API key | — | console.anthropic.com |

> **Docker** bundles all prerequisites including Node.js + Claude CLI inside the container — no local install needed.

---

## Authentication

AgentForge delegates all AI to Claude Code, which handles its own auth. Choose **one** method (priority order):

| Method | How |
|---|---|
| `ANTHROPIC_API_KEY` | Set in `backend/.env` — recommended |
| `claude /login` | OAuth with Claude.ai Pro/Max/Team subscription |
| `CLAUDE_CODE_OAUTH_TOKEN` | Long-lived token via `claude setup-token` |
| `ANTHROPIC_AUTH_TOKEN` | Bearer token for LLM gateway/proxy |
| `CLAUDE_CODE_USE_BEDROCK=1` | AWS Bedrock via standard credential chain |
| `CLAUDE_CODE_USE_VERTEX=1` | Google Cloud Vertex AI |

---

## Port Configuration

All ports live in two `.env` files — change them once, everything follows.

**`backend/.env`**
```bash
ANTHROPIC_API_KEY=sk-ant-...
BACKEND_PORT=9000
FRONTEND_PORT=5173
```

**`frontend/.env`**
```bash
VITE_BACKEND_HOST=localhost
VITE_BACKEND_PORT=9000
VITE_FRONTEND_PORT=5173
```

In Electron, the backend injects `window.__AGENTFORGE_CONFIG__` at runtime so the same Vite build works at any port without rebuilding.

---

## Features

### Core Chat
- Streaming multi-turn conversations powered by Claude Code subprocess
- SQLite persistence — full history survives restarts
- Markdown rendering with syntax highlighting and copy buttons
- Tool call visibility — expandable per-turn blocks showing what Claude did
- Stop / interrupt generation (`Esc`)
- File attachments — drag & drop, images + text files (up to 5 MB)
- Per-message copy button
- WebSocket auto-reconnect with exponential backoff + heartbeat
- Connection status banner on disconnect

### Appearance & Developer Experience
- **Dark / Light mode** toggle — instantly switches the full UI
- **6 accent color themes** — Purple, Blue, Green, Amber, Pink, Red
- **Font size control** — XS / S / M / L / XL scaling via CSS zoom
- All preferences persisted to `localStorage`
- Accessible via **Settings → Appearance**

### Power Features
- **Prompt Library** (`⌘P`) — Alfred-style palette with 10 built-ins, personal prompts, and shared team YAML
- **`/` inline autocomplete** — type `/shortcut` in the input to auto-expand any prompt
- **@file mention** — `@` triggers fuzzy file search in the working directory
- **Artifacts Panel** (`⌘B`) — auto-detects code blocks, diff view, apply-to-file
- **PR Reviewer** (`⌘R`) — paste a diff **or** paste a GitHub PR URL to fetch the diff automatically; 5 expert personas review in parallel with live streaming and verdict badges
- **MCP server config UI** — add/remove servers, syncs to `~/.claude/mcp.json`
- **Token & cost panel** — per-turn cost breakdown, context window gauge
- **Conversation branching** — fork at any user message (hover → Fork button)
- **Voice input** — Web Speech API; `Space` to start/stop; live interim transcript overlay
- **Sidebar search** (`⌘F`), pin conversations ★, backend health indicator
- **Export** (`⌘E`) — `.md` or `.json`, or copy to clipboard
- **Inline rename** (`F2`) with single-click editing
- **Auto-title** — smart 4–6 word title after first exchange, pushed live via WebSocket
- **Team Prompt Library** — shared `prompts.yaml` via git/network path

### Settings
| Section | What you configure |
|---|---|
| Appearance | Theme (dark/light), accent color, font size |
| Authentication | Auth method overview + live status badge |
| Model | Claude model selection |
| System Prompt | Per-session default instruction |
| Working Directory | Root path for file operations |
| Integrations | GitHub personal access token (for PR Reviewer) |
| Team Prompt Library | Path to shared `prompts.yaml` |
| Allowed Tools | Toggle which tools Claude can use |
| MCP Servers | Add / remove Model Context Protocol servers |

---

## Architecture

```
Browser / Electron
      │  WebSocket  ws://localhost:$BACKEND_PORT/ws/{conv_id}
      │  REST       http://localhost:$BACKEND_PORT/...
      ▼
FastAPI (Python)
  ├── ClaudeBridge ──→ claude -p --input-format stream-json
  │                           --output-format stream-json --verbose
  │                    (guaranteed terminal event on all failure paths)
  ├── SQLite ──→ conversations.db
  ├── settings.json
  └── ~/.claude/mcp.json
```

### Streaming reliability

The Claude Code bridge guarantees the frontend **always receives a terminal event** (`result` or `error`), preventing the UI from getting stuck.

| Failure mode | Emitted event |
|---|---|
| Timeout (60 s silence) | `{"type":"error","message":"Response timed out..."}` |
| Process exits without result | `{"type":"error","message":"...ended unexpectedly"}` |
| User interrupt | `{"type":"result","subtype":"interrupted",...}` |
| Client disconnect | send error caught, loop exits cleanly |
| Unexpected exception | `try/finally` resets `session.streaming = False` |

---

## Docker

```bash
cp backend/.env.example backend/.env
# Set ANTHROPIC_API_KEY inside backend/.env

docker compose up --build
```

| Service | Published port | Notes |
|---|---|---|
| `backend` | `9000` | Python + Node.js + Claude CLI; healthcheck on `/health` |
| `frontend` | `5173` | Vite dev server; waits for backend healthy |

**OAuth credentials** — the `~/.claude` directory is bind-mounted read-only so credentials from `claude /login` on the host are passed through automatically.

**Remote server** — set `VITE_BACKEND_HOST=your-server-ip` before running compose so the browser knows where to find the backend.

---

## File Structure

```
agentforge/
├── docker-compose.yml
├── start.sh / start.bat           one-command launch
├── backend/
│   ├── Dockerfile
│   ├── .env.example               copy → .env, set API key
│   ├── main.py                    FastAPI server + all REST endpoints
│   ├── claude_bridge.py           subprocess manager (guaranteed terminal events)
│   ├── session.py                 SQLite — conversations, messages, branching
│   ├── settings_manager.py        settings.json + mcp.json sync
│   ├── file_search.py             @mention file walker
│   ├── export_utils.py            MD + JSON export
│   └── prompt_library.py          personal + team + built-in prompts (YAML)
├── frontend/
│   ├── Dockerfile
│   ├── .env                       VITE_BACKEND_PORT, VITE_FRONTEND_PORT
│   └── src/
│       ├── config.js              single source of truth for API/WS URLs + app name
│       ├── theme.js               color palettes, accent colors, font size options
│       ├── ThemeContext.jsx        CSS variable injection + localStorage persistence
│       ├── App.jsx                main app shell
│       ├── hooks/
│       │   ├── useWebSocket.js    auto-reconnect + heartbeat
│       │   ├── useVoiceInput.js   Web Speech API
│       │   └── useElectron.js     IPC bridge
│       ├── utils/
│       │   └── artifactDetector.js
│       └── components/
│           ├── Sidebar.jsx
│           ├── App.jsx (shell)
│           ├── SmartInput.jsx
│           ├── MarkdownRenderer.jsx
│           ├── ToolCallBlock.jsx
│           ├── ArtifactsPanel.jsx
│           ├── CostPanel.jsx
│           ├── PromptLibrary.jsx
│           ├── PRReviewer.jsx
│           ├── SettingsPanel.jsx
│           ├── ExportModal.jsx
│           ├── FileAttachment.jsx
│           ├── ConversationTitle.jsx
│           ├── BranchButton.jsx
│           ├── VoiceButton.jsx
│           ├── ConnectionStatus.jsx
│           ├── UpdateBanner.jsx
│           ├── BackendGate.jsx
│           └── ShortcutsOverlay.jsx
└── electron/
    ├── main.js                    tray, updater, port injection, backend lifecycle
    ├── preload.js                 secure IPC bridge
    └── package.json               electron-builder config
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | New conversation |
| `⌘,` | Settings |
| `⌘/` | Shortcuts overlay |
| `⌘E` | Export |
| `⌘P` | Prompt Library |
| `⌘R` | PR Reviewer |
| `⌘B` | Artifacts Panel |
| `⌘F` | Search conversations |
| `⌘⇧C` | Copy last response |
| `Enter` | Send message |
| `@` | File autocomplete |
| `/` | Prompt autocomplete |
| `Space` | Voice input (when input empty) |
| `F2` | Rename conversation |
| `Esc` | Stop generation / close panel |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check + auth method |
| GET / POST | `/settings` | Load / save settings |
| GET | `/conversations` | List all conversations |
| GET | `/conversations/{id}/messages` | Message history |
| GET | `/conversations/{id}/stats` | Token + cost stats |
| PATCH | `/conversations/{id}` | Rename |
| DELETE | `/conversations/{id}` | Delete |
| POST | `/conversations/{id}/branch` | Fork at a message |
| POST | `/conversations/{id}/interrupt` | Stop generation |
| GET | `/conversations/{id}/export/markdown` | Export `.md` |
| GET | `/conversations/{id}/export/json` | Export `.json` |
| GET | `/files/search?q=` | Search working directory |
| GET | `/files/read?path=` | Read file contents |
| POST | `/files/write` | Write file (artifact apply-to-file) |
| GET | `/prompts` | List all prompts |
| POST | `/prompts` | Create / update prompt |
| DELETE | `/prompts/{id}` | Delete prompt |
| POST | `/prompts/sync` | Sync team prompts from YAML path |
| POST | `/github/pr-diff` | Fetch PR diff + metadata from GitHub |
| WS | `/ws/{conv_id}` | Streaming chat |

---

## Prompt Library YAML Schema

```yaml
# backend/prompts.yaml  (personal)
# or any path set in Settings → Team Prompt Library
prompts:
  - id: my-prompt
    title: "My Custom Prompt"
    description: "What it does"
    category: code        # code | review | docs | general | custom
    shortcut: /myp        # type /myp in the input to auto-expand
    tags: [python, review]
    prompt: |
      Your full prompt text here.
```

---

## MCP Servers

Configure via **Settings → MCP Servers**, or edit `~/.claude/mcp.json` directly:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allow"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

> The GitHub token added in **Settings → Integrations** is also used by the PR Reviewer to fetch diffs directly from GitHub PR URLs.
