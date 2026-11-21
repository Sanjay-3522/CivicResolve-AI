# Testing

| Suite | Runner | Count | Coverage (gate) | Command |
|---|---|---|---|---|
| Backend unit + API | pytest + httpx ASGI | 181 | **≥90%** of `routes/` + `services/` (gate **90%**, `pyproject.toml` + CI `--cov-fail-under=90`) | `cd backend && pytest --cov` |
| Frontend unit + a11y | Jest + Testing Library + jest-axe | 60 | **91.0%** statements · **82.4%** branches · **86.5%** functions · **93.7%** lines (gate **80%** each, `jest.config.js`) | `cd frontend && npm run test:coverage` |
| End-to-end | Playwright (Chromium) against the **production build** | 5 | n/a | `cd frontend && npm run build && npm run test:e2e` |
| Static checks | ruff (lint + format), mypy, ESLint (next + jsx-a11y strict), Prettier, tsc | n/a | must be clean | `make lint typecheck` |
| Dependency audit | pip-audit, npm audit | n/a | no unreviewed high/critical | `make audit` |

Prior frontend figures are historical. The repaired backend candidate was locally run under compatibility shims; see [VERIFICATION.md](VERIFICATION.md) for actual coverage and limitations. CI (`.github/workflows/test.yml`) is configured to run every row and fail on any error or below-threshold coverage; it must still be rerun on GitHub.

## Running

```bash
make install                 # pip install -r backend/requirements-dev.txt && npm ci
make lint typecheck          # ruff check, ruff format --check, mypy, next lint, prettier --check, tsc
make test                    # pytest (≥90%) + jest (≥80%)
make e2e                     # next build, then Playwright starts API + web itself (e2e/serve.sh)
```

The E2E web server (`frontend/e2e/serve.sh`) starts FastAPI on :8000 with a fresh temporary SQLite DB in mock-AI mode, and the Next standalone build on :3100. If Playwright's own browser can't be downloaded, set `PW_CHROMIUM_PATH` to an existing Chromium binary.

## What each suite covers

### Backend (`backend/tests/`)
| File | Covers |
|---|---|
| `test_reports_api.py` | Citizen lifecycle: submit, validation, detail with timeline and corroborations, upvote, 72 h reopen (urgency + SLA tightening), rate limit |
| `test_ai_and_routes.py` | Gemini path with the SDK stubbed (JSON parsing, validation/clamping, image input, fallbacks), model config, prompt formatting regression, mock triage keyword flags |
| `test_report_lifecycle.py` | Resolve (verified / flagged / no photo), status and reopen edge cases, list filters, queue filters, heatmap weights, dedup merge through the API, SLA job error handling |
| `test_geo_dedup.py` | Haversine, cosine similarity, 150 m radius + similarity threshold, corroboration persistence, SLA tightening |
| `test_sla_engine.py` | SLA windows by category × urgency, clamping, breach detection and tier escalation |
| `test_auth.py`, `test_admin_session.py` | Admin auth on every protected route; opaque session tokens, rotation, revocation, expiry, login rate limit |
| `test_security.py` | Input bounds (422), bulk-status validation and ID cap, X-Forwarded-For spoofing, security headers, `ai_mode`, docs disabled in production |
| `test_upload_security.py` | Decoder allowlist, polyglots, SVG, oversized/empty uploads, `/uploads` path traversal, nosniff, upvote/reopen rate limits, generic 500s, API CSP |
| `test_file_upload.py` | JPEG/PNG accepted, HTML/SVG/oversized rejected, extension from verified format |
| `test_efficiency.py` | SQL analytics equal to the old Python loops, SLA-log join, numpy cosine parity, indexes, `utc_now` |
| `test_performance.py` | Pagination + `X-Total-Count` on all 5 list endpoints, bounds, gzip, Cache-Control, ETag/304, immutable uploads |

### Frontend (`frontend/__tests__/`)
| File | Covers |
|---|---|
| `ReportForm.test.tsx`, `ReportFlow.test.tsx`, `validation.test.ts` | Form rendering and labels; submit → AI result (category, urgency, department, SLA); merged result; API error; progress screen; photo preview; validation error summary with focus, `aria-invalid` and `aria-describedby`; axe |
| `TrackPage.test.tsx`, `TrackActions.test.tsx` | Timeline, reopen-window logic, upvote, reopen with reason, cancel, not-found; axe |
| `LoginPage.test.tsx`, `auth.test.ts` | Login success and redirect, error, 4 open-redirect cases; `adminFetch` credentials; logout; axe |
| `AdminDashboard.test.tsx` | Captioned queue table, labels, 401 → logout and redirect, tab keyboard navigation, live announcements for bulk and SLA results; axe on all three tabs |
| `PublicMap.test.tsx`, `Heatmap.test.tsx`, `LocationPicker.test.tsx` | Markers and HTML-escaped popups, filters, heatmap `role="img"` and text-table alternative, canvas drawing, 401 handling, keyboard coordinate entry and validation, map clicks; axe (uses the Leaflet double in `__mocks__/leaflet.ts`) |
| `RouteFocus.test.tsx`, `Misc.test.tsx` | Focus to `<main>` and announcement after navigation; skip link; `escapeHtml`; lazy map pages; axe on the map page |

### End-to-end (`frontend/e2e/`)
| Spec | Covers |
|---|---|
| `happy-path.spec.ts` | Citizen submits → AI result → track page shows the report → admin logs in and changes the status → track page shows the new status |
| `accessibility.spec.ts` | Keyboard-only report flow (skip link, error summary focus, fix and submit, focus after navigation); keyboard-only admin sign-in and tabs; **44×44 px touch targets** on every page on a touch viewport |


## Submission preflight (additional offline guard)

Run `python scripts/verify_submission.py` to check required code/docs and suspicious Git-tracked runtime files. After filling the final public repository URL and demo address, run `python scripts/verify_submission.py --submission`. This cannot establish repository public visibility, live deployment health, or a green GitHub Actions workflow; inspect those separately.
