# Verification of the repaired candidate (2026-11-21)

The historical test outputs for previous versions have been replaced with these scope-limited results. They are **not** a claim of a fully green GitHub Actions run.

| Check | Result | Conditions |
|---|---|---|
| Backend pytest | **181 passed**, 1 SQLAlchemy test teardown warning | Python 3.13.5 sandbox, with SDK and APScheduler imports stubbed locally because the pinned packages could not be downloaded |
| Backend coverage | **97.17%** of route/service code; ≥90% gate passed | Partial environment, measured in the sandbox; GitHub's Python 3.11 run is still required |
| Python compilation | Passed | `python -m compileall -q backend` |
| Offline submission preflight | **Passed** (normal mode); **fails in strict submission mode until real links/vertical are filled** | `python scripts/verify_submission.py [--submission]`; no `.git` folder present in release ZIP |
| Bash syntax | Passed | `bash -n security/run-npm-audit.sh security/run-pip-audit.sh start.sh frontend/e2e/serve.sh` |
| npm audit policy self-test | **6 passed** | `node security/test-npm-audit.mjs` with synthetic reports (no network) |
| Ruff, mypy | **Not run** | Pinned executables unavailable offline |
| Frontend npm CI, lint, Jest, build, Playwright | **Not rerun for v5** | No `node_modules` and package registry access in this environment; previous run does not prove that the updated UI or new frontend test passes |
| Actual `pip-audit` / `npm audit` | **Not run** | Network/package index unavailable; they must pass on GitHub |
| Docker build/smoke | **Not run** | Docker unavailable in this sandbox |
| Real Gemini API | **Not run** | No user's API key; API calls in tests were mocked |

To establish a fully verified release, push this candidate and check **all four green GitHub Actions jobs**. See [CI_REPAIR_GUIDE.md](CI_REPAIR_GUIDE.md) and [TESTING.md](TESTING.md). A green check is evidence that the configured tests passed, **not** evidence of a 99.9% quality or security score.
