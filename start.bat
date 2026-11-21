@echo off
echo ============================================
echo   CivicResolve — Full Stack Startup
echo ============================================

REM ── Backend ──────────────────────────────────
echo.
echo [1/3] Setting up Python virtual environment...
cd /d "%~dp0backend"

if not exist venv (
    python -m venv venv
    echo Created venv.
)

call venv\Scripts\activate.bat

echo [2/3] Installing backend dependencies...
pip install -r requirements.txt --quiet

REM Copy .env if not exists
if not exist .env (
    copy .env.example .env
    echo.
    echo !! IMPORTANT: Edit backend\.env and set your GEMINI_API_KEY
    echo !! The app works without it (mock AI mode) but Gemini features need a real key.
    echo.
)

echo [2/3] Starting FastAPI backend on http://localhost:8000 ...
start "CivicResolve Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

REM ── Frontend ─────────────────────────────────
cd /d "%~dp0frontend"
echo [3/3] Installing frontend dependencies...
call npm install --silent

echo [3/3] Starting Next.js frontend on http://localhost:3000 ...
start "CivicResolve Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ============================================
echo   CivicResolve is starting up!
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ============================================
echo.
echo   Demo highlights:
echo   - Submit a report at http://localhost:3000
echo   - Admin dashboard: http://localhost:3000/admin
echo   - Heatmap: http://localhost:3000/admin/heatmap
echo   - Public map: http://localhost:3000/map
echo.
pause
