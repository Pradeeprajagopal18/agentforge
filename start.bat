@echo off
REM start.bat — launch AgentForge on Windows
setlocal enabledelayedexpansion

echo.
echo   ^| AgentForge
echo   ^| Powered by your choice of LLMs, including Claude 2, Gemini Pro, and more.
echo ─────────────────────────────────

REM ── Load ports from backend/.env ─────────────────────────────────
set BACKEND_PORT=9000
set FRONTEND_PORT=5173
if exist "backend\.env" (
  for /f "usebackq tokens=1,2 delims==" %%A in ("backend\.env") do (
    if "%%A"=="BACKEND_PORT"  set BACKEND_PORT=%%B
    if "%%A"=="FRONTEND_PORT" set FRONTEND_PORT=%%B
  )
)
echo   Backend port:  %BACKEND_PORT%
echo   Frontend port: %FRONTEND_PORT%
echo.

REM ── Check prerequisites ──────────────────────────────────────────
where python >nul 2>&1 || (echo [ERROR] python not found. Install Python 3.11+ && exit /b 1)
where node   >nul 2>&1 || (echo [ERROR] node not found. Install Node.js 18+       && exit /b 1)
where claude >nul 2>&1 || (echo [ERROR] Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code && exit /b 1)

REM ── Check .env ───────────────────────────────────────────────────
if not exist "backend\.env" (
  if exist "backend\.env.example" (
    copy "backend\.env.example" "backend\.env" >nul
    echo [WARN] Created backend\.env — add your ANTHROPIC_API_KEY then re-run.
    pause & exit /b 1
  )
)

REM ── Install backend deps ─────────────────────────────────────────
if not exist "backend\.venv" (
  echo Installing Python dependencies...
  python -m venv backend\.venv
  backend\.venv\Scripts\pip install -q -r backend\requirements.txt
  echo [OK] Python deps installed
)

REM ── Install frontend deps ─────────────────────────────────────────
if not exist "frontend\node_modules" (
  echo Installing Node.js dependencies...
  cd frontend && npm install --silent && cd ..
  echo [OK] Node deps installed
)

REM ── Start backend ────────────────────────────────────────────────
echo Starting backend on :%BACKEND_PORT%...
start "AgentForge Backend" /min cmd /c "cd backend && .venv\Scripts\activate && set BACKEND_PORT=%BACKEND_PORT% && python main.py"
timeout /t 3 /nobreak >nul

REM ── Start frontend ───────────────────────────────────────────────
echo Starting frontend on :%FRONTEND_PORT%...
start "AgentForge Frontend" /min cmd /c "cd frontend && npm run dev"
timeout /t 2 /nobreak >nul

echo.
echo [OK] AgentForge is running!
echo   App: http://localhost:%FRONTEND_PORT%
echo   API: http://localhost:%BACKEND_PORT%
echo.
start http://localhost:%FRONTEND_PORT%
pause
