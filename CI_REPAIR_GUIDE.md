# CivicResolve — CI repair and judge handoff

Updated 2026-11-21. This package is a **working candidate**, not a claim of a guaranteed green GitHub Actions run.

## What the screenshot actually proves

- Frontend GitHub Actions job passed.
- Backend GitHub Actions job failed. The screenshot does **not** show which backend step failed.
- Playwright and Docker jobs were skipped because they depend on both backend and frontend succeeding.
- A Git Bash push or `git clone` by itself does not run or fix Python lint/tests; GitHub Actions does.

## Changes made

1. Run audit scripts and Playwright startup with `bash script.sh`, so a ZIP extracted and committed on Windows cannot break CI by losing executable bits.
2. Upgrade the deprecated `google-generativeai` client to Google's supported `google-genai` client; use configurable `gemini-3.8-flash`, with `gemini-embedding-2` for deduplication.
3. Set a 30-second API request timeout and test SDK calls with a fake client so CI does not require or consume a live API key.
4. Parse and validate AI JSON, clamp scores, reject unknown departments/flags, and **flag unresolved or unverifiable photos** instead of presenting an AI verification as complete.
5. Upgrade FastAPI, Pydantic, python-dotenv, and Pillow; drop legacy pip-audit exemptions that covered older vulnerable versions. A new audit finding now blocks CI rather than silently passing.
6. Reject compressed images that decode to more than 24 million pixels and fully decode allowed uploads before storage.
7. Make npm audit handling explicit: `npm audit` exit code 1 (vulnerabilities found) is evaluated against the existing reviewed advisory allowlist; malformed or failed audit reports block CI.
8. Add tests for malformed AI output, disputed resolution, image pixel limits, and npm-audit policy.

## Windows + Git Bash: publish the corrected ZIP

Unzip the project and enter its **civicresolve** folder (the one containing `.github/`, `backend/`, and `frontend/`).

If this is a **new GitHub repository**, do:

```bash
git init
git branch -M main
git add .
git commit -m "Fix CI, upgrade Gemini SDK and harden API"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

If you **already have a repository**, replace the project files in your existing clone, keeping the `.git` directory intact; then:

```bash
git status
git add .
git commit -m "Repair backend CI and Gemini integration"
git push origin main
```

If Git reports no changes to commit, verify the new files were copied to the right folder. **Do not run `git init` inside an existing clone** or commit `.env` secrets.

For Linux/Mac, the commands below reproduce the checks. On Windows run them in an environment with Python 3.11 and Node 20 available, preferably WSL or a development container:

```bash
python -m pip install -r backend/requirements-dev.txt
cd backend
python -m ruff check .
python -m ruff format --check .
python -m mypy .
python -m pytest -v --cov --cov-fail-under=90
cd ..
bash security/run-pip-audit.sh
cd frontend
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
cd ..
node security/test-npm-audit.mjs
bash security/run-npm-audit.sh
```

## What to inspect in Actions

Open **GitHub → repository → Actions → latest CivicResolve CI run → Backend**, then expand its **first red step**. If that step is:

- **Install**: resolve the exact package/version error or registry failure.
- **Lint**: run `ruff check . --fix` (review changes), then `ruff format .` from `backend/` and recommit.
- **Type check**: inspect the mypy-reported file and line number; do not delete mypy from the workflow.
- **Tests with coverage gate**: inspect the named failing test/traceback and coverage table.
- **Dependency audit**: audit the actual CVE; upgrade the affected dependency or document a justified time-limited exception. **Never suppress all audit failures.**

The skipped jobs should run automatically once backend and frontend pass. Use the Playwright trace artifact if browser tests then fail.

## Real Gemini demonstration

A live AI demo needs a Gemini API key and a model enabled for that project. Add `GEMINI_API_KEY` only to `.env` locally or a cloud secret store; never commit it. The health endpoint's `ai_mode: live` indicates **a key was configured**, not proof that a Gemini call succeeded. Verify the logs of a newly submitted report to make sure no fallback occurred. Without a key, deterministic mock mode remains useful for a feature demo, but must not be presented as a live Gemini run.

## Remaining limitations

- This sandbox could not install the exact pinned Ruff, mypy, Google GenAI SDK, APScheduler, npm packages, or build Docker images. It cannot certify the complete CI workflow or live Gemini calls.
- The current Next.js 14 dependency set includes previously reviewed high/critical audit exemptions. This package **does not resolve those residual risks**; perform a framework upgrade and a fresh security audit before public production use.
- The demo stores SQLite and uploads on ephemeral container storage; cloud restarts can erase data. For persistent production data, move to managed Postgres and object storage.
- The app does not guarantee a particular hackathon score, uptime, or WCAG conformance. Actual judge evaluation and deployment checks are still required.
