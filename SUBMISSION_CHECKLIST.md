# CivicResolve: hackathon submission checklist

> Based only on the challenge instructions supplied in chat. **The linked organizer Google Doc was not available for direct inspection here.** Confirm any extra fields, eligibility rules, and allowed vertical names on the official submission page.

## Required submission items

- [ ] **Choose an officially allowed vertical.** Match CivicResolve's civic infrastructure/public-services problem statement to the exact label used by the organizer. Do not invent a label.
- [ ] Create **one new public GitHub repository**, with the complete contents of the `civicresolve/` folder at the **repository root**. `.github/workflows/test.yml` must be directly under the root `.github/` directory.
- [ ] Work on **one branch (`main`)**. Avoid additional working branches and use a history of incremental commits; do not force-push/erase work merely to make a clean graph.
- [ ] **Clone the public GitHub repo inside the AI platform**, as required by the event instructions, and make your changes/commits there. Merely uploading a ZIP without this flow may not satisfy the event rules.
- [ ] Push code, tests, docs and `frontend/package-lock.json` together. Never commit `.env`, real admin keys, API keys, user photos or the SQLite database.
- [ ] Make the README explicitly explain chosen vertical, citizen/admin personas, decision-making logic, end-to-end operation and assumptions. This repository includes those sections; confirm the exact vertical label.
- [ ] Run CI until all four GitHub Actions jobs are **green**: backend, frontend, E2E, Docker. A screenshot of an earlier green frontend job alone is not complete verification.
- [ ] Add a real **deployed demo URL** to README, or clearly label deployment unavailable. Confirm `/health`, citizen submit/track, admin login and update, and at least one Gemini-backed report if presenting live AI.
- [ ] For the judges: share the **public repo URL**, demo URL (if allowed), minimal demo instructions, and a short proof of successful tests. Do not expose admin credentials in a public README: provide a temporary demo credential via permitted private submission fields and rotate it afterward.
- [ ] Submit before the official deadline, following the exact URL and form fields in the organizer's guide.

## Recommended clean Git Bash workflow

From a **fresh folder** containing an extracted `civicresolve` project:

```bash
# First create an empty PUBLIC repo on GitHub; do not add a GitHub-generated README.
# Clone it inside the required AI platform rather than submitting the ZIP alone.
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
# Copy contents of civicresolve/ INTO THIS FOLDER, including the hidden .github directory.
git status
git add .
git commit -m "feat: civic issue triage and tracking prototype"
git push -u origin main
```

If you already have a repo, **do not `git init` or clone over it**. Copy project files into the existing repository checkout, keep its `.git` directory intact and commit normally. Before commit, verify `git status` does not include secrets.

To see GitHub Actions failures: repository → Actions → latest workflow → **first red job/step** → copy the precise error. Downstream **skipped** E2E/Docker jobs normally mean the backend or frontend failed first.

## Run reproducible checks (Python 3.11, Node 20)

```bash
python scripts/verify_submission.py
python -m pip install -r backend/requirements-dev.txt
(cd backend && ruff check . && ruff format --check . && mypy . && pytest -v --cov --cov-fail-under=90)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm run test:coverage && npm run build)
bash security/run-pip-audit.sh
bash security/run-npm-audit.sh
# For browser and Docker jobs, run the GitHub Actions workflow / see TESTING.md.
```

After setting the real public URLs and creating the repository, run `python scripts/verify_submission.py --submission` to check the handoff basics. This script is an **offline guard**, not a substitute for GitHub visibility, dependency audits or deployment tests.

## Judge demonstration (4–5 minutes)

1. Citizen reports an issue (text, location, photo if available). Show the source of the decision (`Gemini` vs `rule-based fallback`), category, urgency, department, SLA and track ID.
2. Citizen opens the tracking page, sees status timeline and responsible department.
3. A second nearby report is merged/corroborated; show how this affects the operational view.
4. Authorized admin changes status, triggers overdue review, shows public timeline/audit trail.
5. End with keyboard-only interaction and explain the major safety limit: uncertain AI outcomes require human judgment.

## Known launch blockers that still require verification

- Full GitHub CI and deployed environment have **not** been verified by this offline revision.
- The existing Next.js 14 dependency set has acknowledged residual security advisories. Upgrade and rerun audits before claiming production-grade safety.
- Some live Gemini projects may require different model permissions or quota. A configured API key is not proof that every request used Gemini.
- SQLite and container-local photos are ephemeral on most cloud deployments; this design is explicitly a **hackathon prototype**, not a durable municipal production system.
