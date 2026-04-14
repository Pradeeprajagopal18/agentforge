#!/usr/bin/env bash
# start.sh — launch AgentForge (backend + frontend dev server)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# ── Load port config from .env files ────────────────────────────
# Backend port (backend/.env or default)
if [ -f "$BACKEND_DIR/.env" ]; then
  export $(grep -v '^#' "$BACKEND_DIR/.env" | grep -E '^(BACKEND_PORT|FRONTEND_PORT|ANTHROPIC_API_KEY)=' | xargs) 2>/dev/null || true
fi
BACKEND_PORT="${BACKEND_PORT:-9000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

# ── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'; BLUE='\033[0;34m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo -e "${CYAN}"
echo "  ⬡  P O W E R H O U S E"
echo -e "     Powered by Claude Code${NC}"
echo "─────────────────────────────────"

# ── Check prerequisites ──────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
  echo -e "${YELLOW}✗ python3 not found. Install Python 3.11+${NC}"; exit 1
fi
if ! command -v node &>/dev/null; then
  echo -e "${YELLOW}✗ node not found. Install Node.js 18+${NC}"; exit 1
fi
if ! command -v claude &>/dev/null; then
  echo -e "${YELLOW}✗ Claude Code CLI not found.${NC}"
  echo "  Run: npm install -g @anthropic-ai/claude-code"; exit 1
fi

# ── Check .env ───────────────────────────────────────────────────
if [ ! -f "$BACKEND_DIR/.env" ]; then
  if [ -f "$BACKEND_DIR/.env.example" ]; then
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
    echo -e "${YELLOW}⚠  Created backend/.env from example.${NC}"
  fi
fi

# ── Check Claude Code auth ────────────────────────────────────────
# AgentForge needs Claude Code to be authenticated. Check common methods.
CRED_FILE="$HOME/.claude/.credentials.json"
HAS_AUTH=false
[ -n "$ANTHROPIC_API_KEY" ]          && HAS_AUTH=true
[ -n "$ANTHROPIC_AUTH_TOKEN" ]       && HAS_AUTH=true
[ -n "$CLAUDE_CODE_OAUTH_TOKEN" ]    && HAS_AUTH=true
[ -n "$CLAUDE_CODE_USE_BEDROCK" ]    && HAS_AUTH=true
[ -n "$CLAUDE_CODE_USE_VERTEX" ]     && HAS_AUTH=true
[ -f "$CRED_FILE" ]                  && HAS_AUTH=true
# Also check backend/.env
[ -f "$BACKEND_DIR/.env" ] && grep -q "^ANTHROPIC_API_KEY=.\+" "$BACKEND_DIR/.env" 2>/dev/null && HAS_AUTH=true

if [ "$HAS_AUTH" = false ]; then
  echo -e "${YELLOW}⚠  No Claude Code authentication found.${NC}"
  echo ""
  echo "  Choose one of:"
  echo "  1. Add ANTHROPIC_API_KEY to backend/.env  (recommended)"
  echo "     Get a key at: https://console.anthropic.com"
  echo ""
  echo "  2. Run: claude /login"
  echo "     Authenticate with your Claude.ai subscription (Pro/Max/Team)"
  echo ""
  echo "  3. Set ANTHROPIC_AUTH_TOKEN, CLAUDE_CODE_OAUTH_TOKEN,"
  echo "     CLAUDE_CODE_USE_BEDROCK=1, or CLAUDE_CODE_USE_VERTEX=1"
  echo ""
  echo -e "  ${CYAN}Continuing anyway — Claude Code will prompt for auth when first used.${NC}"
  echo ""
fi

# ── Install backend deps ─────────────────────────────────────────
if [ ! -d "$BACKEND_DIR/.venv" ]; then
  echo "Installing Python dependencies..."
  python3 -m venv "$BACKEND_DIR/.venv"
  "$BACKEND_DIR/.venv/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
  echo -e "${GREEN}✓ Python deps installed${NC}"
fi

# ── Install frontend deps ─────────────────────────────────────────
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "Installing Node.js dependencies..."
  cd "$FRONTEND_DIR" && npm install --silent
  echo -e "${GREEN}✓ Node deps installed${NC}"
fi

# ── Start backend ────────────────────────────────────────────────
echo -e "${BLUE}▶ Starting backend on :${BACKEND_PORT}${NC}"
cd "$BACKEND_DIR"
source .venv/bin/activate
python main.py &
BACKEND_PID=$!

# Wait for backend to be ready
echo -n "  Waiting for backend"
for i in $(seq 1 25); do
  sleep 0.6
  if curl -sf "http://localhost:${BACKEND_PORT}/health" >/dev/null 2>&1; then
    echo -e " ${GREEN}✓${NC}"
    break
  fi
  echo -n "."
done

# ── Start frontend ───────────────────────────────────────────────
echo -e "${BLUE}▶ Starting frontend on :${FRONTEND_PORT}${NC}"
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

sleep 1
echo ""
echo -e "${GREEN}✓ AgentForge is running!${NC}"
echo "  App:     http://localhost:${FRONTEND_PORT}"
echo "  API:     http://localhost:${BACKEND_PORT}"
echo "  Health:  http://localhost:${BACKEND_PORT}/health"
echo ""
echo "  Ports:   BACKEND_PORT=${BACKEND_PORT}  FRONTEND_PORT=${FRONTEND_PORT}"
echo "  Config:  backend/.env  |  frontend/.env"
echo ""
echo "Press Ctrl+C to stop all services."
echo "─────────────────────────────────"

# ── Open browser ────────────────────────────────────────────────
sleep 1
if command -v open &>/dev/null; then
  open "http://localhost:${FRONTEND_PORT}"
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://localhost:${FRONTEND_PORT}"
fi

# ── Cleanup ──────────────────────────────────────────────────────
cleanup() {
  echo -e "\n${YELLOW}Shutting down AgentForge...${NC}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM
wait
