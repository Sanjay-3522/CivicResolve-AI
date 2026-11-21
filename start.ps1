# CivicResolve — Start Script (PowerShell)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CivicResolve — Full Stack Startup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ── Backend ──────────────────────────────────
Set-Location "$root\backend"

if (-not (Test-Path "venv")) {
    Write-Host "`n[1/3] Creating Python venv..." -ForegroundColor Yellow
    python -m venv venv
}

Write-Host "[2/3] Installing backend dependencies..." -ForegroundColor Yellow
& ".\venv\Scripts\pip.exe" install -r requirements.txt --quiet

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "`n!! Edit backend\.env and set GEMINI_API_KEY (app works in mock mode without it)`n" -ForegroundColor Red
}

Write-Host "[2/3] Starting FastAPI on http://localhost:8000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; .\venv\Scripts\Activate.ps1; uvicorn main:app --reload --host 0.0.0.0 --port 8000"

# ── Frontend ─────────────────────────────────
Set-Location "$root\frontend"

Write-Host "[3/3] Installing npm packages..." -ForegroundColor Yellow
npm install --silent

Write-Host "[3/3] Starting Next.js on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  CivicResolve is starting!" -ForegroundColor Green
Write-Host "  Frontend:  http://localhost:3000" -ForegroundColor White
Write-Host "  Backend:   http://localhost:8000" -ForegroundColor White
Write-Host "  API Docs:  http://localhost:8000/docs" -ForegroundColor White
Write-Host "============================================" -ForegroundColor Cyan
