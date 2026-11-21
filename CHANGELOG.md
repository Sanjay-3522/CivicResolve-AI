## Hackathon rubric alignment revision (v5, 2026-11-21)

- Explicitly documented challenge vertical (official organizer label still to be confirmed), citizen/admin personas, decision flow, and prototype assumptions.
- Made citizen triage outcomes disclose real Gemini vs rule-based fallback; no longer present every result as a confirmed AI decision.
- Strengthened fallback categorization for common text descriptions when the citizen does not select a category.
- Preserved structural-risk and repeated-report signals after model response validation; map invalid departments to the relevant category's demo department.
- Added API/frontend regression tests and the `SUBMISSION_CHECKLIST.md`, `EVALUATION_EVIDENCE.md`, and offline preflight script.
- Full npm/build, pinned lint/type checks, browser tests, Docker and live Gemini still require a full environment/CI run.

# CivicResolve Changelog

## 2026-11-21 — CI repair and supported Gemini integration

- Explicit Bash invocation for GitHub Actions audit and Playwright launch, eliminating dependency on ZIP/Git executable-mode preservation.
- Upgrade to `google-genai` Python SDK and configurable default `gemini-3.8-flash`; bound call latency and validate JSON output.
- Reject unsupported AI classifications, invalid confidence values, or unverified resolutions; keep fallback visibly reviewable.
- Refresh selected backend dependencies and remove obsolete pip-audit exemptions (future audits must actually pass).
- Harden upload handling with a 24MP pixel limit and full image decoding.
- Fix npm-audit exit-code handling, fail closed on bad reports and add six policy regression checks.
- Add AI and upload regression tests, verified in a local limited environment. See `VERIFICATION.md` for what was and was not run.

---

# Changelog

## v2 — Final submission pass (2026-11-21)

No changes to feature behaviour, API contracts (existing parameters and response bodies), the auth design, the dedup/SLA/triage logic or the desktop UI layout. The full gate (lint, types, tests + coverage, build, E2E, smoke) was re-run after every step. Outputs are in [VERIFICATION.md](VERIFICATION.md).

**Final state:**
- **Backend:** 168 tests (was 129), 98.3% coverage.
- **Frontend:** 60 Jest tests (was 29), 91.0% statements / 82.4% branches.
- **End-to-end:** 5 Playwright tests (new).
- **Static checks:** ruff, mypy, ESLint + jsx-a11y and Prettier are all clean, with CI gates for each.

### Problem Statement Alignment
- **README:** opens with the problem statement verbatim and a **Requirement → Feature → Where in code → Test** table covering every sentence (16 rows). After it comes a 5-step **Judge quick tour** with demo admin login instructions and what to look for at each step. Every cited file and test is verified to exist.
- **Problem-statement wording:**
  - Home subtitle: "Google Gemini AI understands your report, categorizes it, identifies its urgency and recommends the right department".
  - Admin header: "Civic issue management".
  - Route and module docstrings reworded the same way.
- **E2E happy path** (`e2e/happy-path.spec.ts`) proves the submission → tracking → resolution flow end to end.

### Security
- **SECURITY.md:**
  - Assets, actors and a STRIDE table.
  - 19 controls, each with the file that implements it and the test that proves it.
  - Dependency advisories and residual risk.
- **Dependency fixes by patch bump:** `fastapi` 0.115.0 → 0.115.14, which brings in Starlette 0.46.2; `python-multipart` 0.0.12 → 0.0.31, clearing 7 advisories.
- **Pillow attack surface removed:** uploads and AI image loading now call `Image.open(..., formats=["JPEG","PNG","WEBP"])`. The CVE-laden PSD/TIFF/PDF/BMP/GIF/EPS decoders are no longer reachable from user input.
- **Next.js image optimizer disabled** (`images.unoptimized`; the app never used `next/image`). This removes the surface of the critical optimizer RCE advisories. Middleware redirects are now `no-store`.
- **CI dependency audits:** `security/run-pip-audit.sh` and `npm audit` (via `security/check-npm-audit.mjs`) fail on any high/critical advisory that isn't in a reviewed, written-rationale allowlist. Fixes that needed minor or major bumps were not applied (patch-only rule); see SECURITY.md.
- **Generic error responses:** a global handler (`app_security.py`) logs server-side and returns `{"detail", "error_id"}` with no stack trace, path or exception type.
- **New security tests** (`tests/test_upload_security.py`, 21):
  - Upload attacks: non-allowlisted decoders, HTML/JPEG polyglot, SVG with script, valid image with trailing HTML, empty upload.
  - Serving: `/uploads` path traversal (5 encodings), nosniff on served files.
  - Limits and errors: upvote/reopen rate limits with `Retry-After`, generic 500, 404 hygiene, API CSP.

### Code Quality
- **Repo hygiene:**
  - Removed `backend/civicresolve.db`, uploaded photos and the real `backend/.env` from the tree. Demo data is still seeded on startup.
  - Deleted the dead `models.py` (unused Pydantic schemas).
  - Replaced a stray `print` with logging.
- **No source file over 300 lines.** Split by responsibility:
  - `routes/reports.py` → `routes/report_lifecycle.py` (status/resolve/reopen) + `services/uploads.py`
  - `routes/admin.py` → `routes/admin_auth.py`
  - `tests/test_ai_and_routes.py` → `tests/test_report_lifecycle.py`
  - `services/gemini_triage.py` → `services/prompts.py` + `services/mock_ai.py`
  - `seed_data.py` → `seed_fixtures.py`
  - Track page → `components/track/*` (StatusTimeline, CorroborationsList, ReportPhotos, ReopenForm)
  - Report page → `components/report/*` (SubmissionResult, TriageProgress, PhotoField, validation)
  - `HeatmapPanel` → `components/heatmap/*`
  - Admin page → `components/admin/AdminTabs.tsx`
- **One shared module for enums and bounds:** `backend/constants.py`, mirrored on the frontend in `components/report/validation.ts`.
- **SQLAlchemy 2.0 typed models** (`Mapped[...]`, `mapped_column`), with the generated schema verified byte-for-byte identical.
- **Backend tooling:** `ruff format` applied; `mypy` (non-strict, `check_untyped_defs`) is clean. Docstrings on every module, class and public function; full type hints.
- **Frontend tooling:**
  - ESLint uses `next/core-web-vitals` + `plugin:jsx-a11y/strict` + `no-explicit-any`.
  - Prettier config added and applied.
  - Zero `any` anywhere, including tests.
  - Strict TypeScript.
- `backend/requirements-dev.txt` pins the CI tooling (`ruff==0.16.9`, `mypy==2.3.1`, `pip-audit==2.10.1`), so CI runs the exact versions verified locally.
- **Root `Makefile`** with `lint`, `typecheck`, `test`, `e2e`, `audit`, `build`, `docker`; matching npm scripts.

### Testing
- **Coverage gates:** backend `--cov-fail-under=90` (98.3%); frontend Jest `coverageThreshold` of 80% for statements, branches, functions and lines.
- **New Jest suites:**
  - `ReportFlow`, `TrackActions`, `PublicMap`, `Heatmap`, `LocationPicker`, `RouteFocus`, `Misc`, `validation`.
  - A Leaflet test double (`__mocks__/leaflet.ts`) so the map components run in jsdom.
- **Playwright** (`frontend/e2e/`) against the production build, run in CI:
  - The happy path.
  - Two keyboard-only walkthroughs.
  - Touch-target measurements on every page.
- **New backend suites:** `tests/test_upload_security.py`, `tests/test_performance.py`.
- **TESTING.md:** how to run each suite, what it covers, current numbers.
- **CI jobs:**
  - Backend: ruff, mypy, pytest with coverage, pip-audit.
  - Frontend: lint, typecheck, Jest with coverage, build, npm audit.
  - E2E.
  - Docker build + smoke.

### Efficiency
- **Pagination on every list endpoint:** `limit`/`offset` with caps, and an `X-Total-Count` header. This covers `/api/reports`, `/api/admin/queue`, `/api/admin/heatmap` (new optional `limit` ≤5000, default 1000) and `/api/admin/sla-log`. Default page sizes are unchanged, so the frontend behaves the same.
- **GZip middleware:** a 200-report list goes from 157 KB to 2.9 KB on the wire.
- **Caching:**
  - Public list: `public, max-age=10`.
  - Report detail: `no-cache` with an ETag, so an unchanged report revalidates as **304 with an empty body**.
  - `/uploads`: `immutable`, 1 year (filenames are random).
  - Admin and mutation responses: `no-store`.
- **Leaflet CSS** now loads only inside the lazily imported map components. Global CSS went from 38.1 KB to 27.5 KB; Leaflet's 10.6 KB loads only with the map chunk.
- **Explicit `width`/`height` + `loading="lazy"`** on photos (no layout shift).
- **README "Performance" section** with measured effects.

### Accessibility
- **jest-axe with zero violations** on every page: report form (empty, with errors, and the AI result), track page, map page and component, admin login, admin dashboard (3 tabs) and heatmap.
- **Accessible form errors:** an error summary (`role="alert"`) receives focus and links each problem to its field. Fields get `aria-invalid` and `aria-describedby`, and length rules mirror the API.
- **Focus management:**
  - After client-side navigation, focus moves to `<main>` and the new page is announced (`components/RouteFocus.tsx`).
  - After a report is submitted, focus moves to the result heading.
- **44×44 px touch targets** on touch screens (`@media (pointer: coarse)`, including Leaflet zoom controls). The desktop layout is unchanged. Measured in Playwright on all pages.
- **jsx-a11y strict fixes:** removed a redundant map tab stop; reworded alts that said "photo".
- **ACCESSIBILITY.md:** WCAG 2.1 AA checklist with evidence and testing method.

---

## v1 — Hardening pass

Grouped by judging criterion. Admin auth (opaque HttpOnly sessions, fail-fast `ADMIN_API_KEY`) and the dedup / SLA / triage logic are unchanged.

**Final state:** 129 backend tests (was 34), 98% coverage on `routes/` + `services/` · 29 Jest tests (was 5) incl. jest-axe · `ruff check`, `next lint`, `tsc` and `next build` all clean.

---

### Problem Statement Alignment

- **Fixed: LIVE AI mode crashed every report submission.** `TRIAGE_PROMPT` had unescaped JSON braces, so `str.format()` raised `KeyError` *outside* the try/except. With a real `GEMINI_API_KEY` every `POST /api/reports` returned 500 and never reached the mock fallback. The braces are now escaped, with a regression test.
- **Replaced shut-down Gemini models.** `gemini-2.0-flash-exp` and `text-embedding-004` are both listed as shut down in Google's docs, so live calls were silently falling back to mock. Models are now env-configurable: `GEMINI_MODEL` (default `gemini-3.6-flash`, Google's listed replacement) and `GEMINI_EMBED_MODEL` (default `gemini-embedding-2`, 768-dim output).
- Startup log states `AI MODE: LIVE (model=…, embeddings=…)` or `AI MODE: MOCK`; `GET /health` returns `"ai_mode": "live" | "mock"`. The mock fallback is kept.
- README: **Problem → Solution** table, mermaid architecture diagram, Cloud Run URL placeholder plus a deploy command, and a 3-step **Judge Quick Tour** (report → dedup/corroboration → admin SLA escalation).
- **Deployable on Cloud Run as one container:**
  - Root multi-stage `Dockerfile`: node:20-slim builds Next `output: 'standalone'`; the runtime is python:3.11-slim plus the Node binary.
  - `start.sh` runs uvicorn on `127.0.0.1:8000` and Next on `0.0.0.0:$PORT` (default 8080) as non-root uid 10001, and exits if either child dies so Cloud Run restarts the container.
  - `/api`, `/uploads` and `/health` are same-origin rewrites.
  - `.dockerignore` and `.gcloudignore` added.
- **Fixed build breakers:** the `HeatmapPanel` import path, and the `useRef<HTMLCanvasElement | null>` type.
- **Fixed: admin login didn't navigate in production builds.** The nav's `/admin` link was prefetched while logged out, and Next cached the middleware's 307. After a successful login, `router.push('/admin')` replayed that cached redirect, so the user stayed on the login page. The link now uses `prefetch={false}`. This was verified in headless Chromium against the production bundle. Dev mode never prefetches, which is why it hadn't shown up.

### Security

- **XSS fix:** report `title` / `ai_summary` / `status` / `department` were put into Leaflet popup HTML unescaped (`HeatmapPanel`, `PublicMapView`). They now go through `lib/escapeHtml.ts`, and IDs are URL-encoded.
- **bulk-status:**
  - Status is validated via `ReportStatus(...)`; an invalid value returns 400 and nothing changes.
  - IDs are de-duplicated and capped at 200 (400 above the cap or when empty).
  - One `IN` query replaces the per-ID loop; the response is still `{"updated": n}`.
- **Rate limiter IP resolution (`get_client_ip`):**
  - Uses the socket peer by default.
  - `X-Forwarded-For` is honoured only when `TRUST_PROXY=1` (set in the Dockerfile).
  - The header is then walked right-to-left, skipping trusted hops (loopback, private and link-local ranges, Google front-end `35.191.0.0/16` and `130.211.0.0/22`, plus `TRUSTED_PROXY_CIDRS`). The first untrusted address is the client, so spoofed left-hand values can't rotate the bucket.
  - uvicorn runs with `--no-proxy-headers`, so the app does this resolution itself.
- **Input validation (FastAPI `Form` / `Query`):**
  - latitude −90..90 and longitude −180..180
  - title 3–120, description 10–2000, address ≤300
  - status note and reopen reason ≤500
  - radius 1–50 000
  - `limit` 1–200 on `/api/reports`, `/api/admin/queue` and `/api/admin/sla-log`
  - `min_urgency` 1–5
  - category, status and department validated against their enums
  - The frontend form mirrors these limits with `minLength` / `maxLength`.
- **Security headers:**
  - `next.config.js` sets CSP (self plus the OSM tile servers, unpkg marker icons and Nominatim), nosniff, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self)`, and HSTS. `poweredByHeader` is off.
  - FastAPI middleware adds the matching headers, with a locked-down `default-src 'none'` CSP.
- `/docs`, `/redoc` and `/openapi.json` are disabled when `ENV=production` (set in the Dockerfile).
- `raise … from None` on validation errors, so internal exceptions aren't chained into tracebacks.

### Efficiency

- **Indexes:**
  - `reports`: `parent_id`, `status`, `category`, `department`, `urgency`, `created_at`, `sla_deadline`, and a composite `(latitude, longitude)`
  - `timeline_events`: `report_id`
  - `sla_breaches`: `report_id`, `created_at`
  - `init_db()` also creates any missing indexes on existing databases. This was verified against the shipped `civicresolve.db`.
- `/api/admin/analytics`: the three full-table Python loops are replaced by `COUNT` / `SUM(CASE…)` / `AVG(julianday…)` with `GROUP BY`. A test checks the output is identical to the old implementation on 60 seeded rows.
- `/api/admin/sla-log`: one outer join replaces the query per entry; orphaned breaches still show "Unknown".
- `/api/reports?lat&lon`: an SQL bounding-box prefilter (deliberately slightly generous) runs before the exact haversine.
- `cosine_similarity` uses numpy, keeping the original semantics exactly (prefix dot product, full-vector norms). A test checks parity against the old version on 20 random vector pairs, including mismatched lengths.
- One `utc_now()` helper (timezone-aware clock, stored as naive UTC) replaces every `datetime.utcnow()`. Test warnings dropped from 118 to 1.
- `requirements.txt` is runtime-only. `requirements-dev.txt` adds pytest, pytest-asyncio, pytest-cov, httpx and ruff, so the image is smaller.

### Accessibility (WCAG 2.1 AA)

- **Global:**
  - Skip-to-content link (`main#main`).
  - Visible `:focus-visible` rings on all interactive elements.
  - `prefers-reduced-motion` turns off animations and transitions.
- **Contrast:**
  - `text-gray-400` / `text-gray-500` body text becomes `gray-600` on light backgrounds.
  - Low-contrast blue, green, orange and yellow text moves to the 700 shades.
  - Heatmap dark-theme greys become `gray-300`.
  - Timeline step circles get darker fills under the white numbers.
- **Admin dashboard:**
  - Every select, input and checkbox is labelled; row checkboxes read "Select report \<title\>".
  - Tabs use `role=tablist` / `tab` / `tabpanel` with `aria-selected`, roving `tabIndex`, and ←/→/Home/End navigation.
  - The queue is a semantic `<table>` with a `<caption>` and `scope="col"` headers, styled to look like the original cards.
  - An `aria-live="polite"` region announces loading, bulk-update and SLA-check results; loading regions use `aria-busy`.
  - Panel headings fixed from h3 to h2 (axe heading-order).
- **Not by colour alone:** urgency badges add "Urgency P4 (High)" for screen readers; status badges add "Status:"; SLA breach badges say "SLA breached"; risk-flag emoji have `role="img"` labels; selected filter chips show ✓ and `aria-pressed`.
- **Heatmap:**
  - `role="img"` with a dynamic description (count, filter, top hotspot).
  - A visually hidden table lists the top hotspots as a text alternative.
  - Category filters use `aria-pressed`; the sidebar is an `<aside>` landmark.
- **Report form:**
  - Labels are associated via `htmlFor`.
  - Group labelling for the categories.
  - Error banner uses `role="alert"`.
  - The photo input is `sr-only` instead of `hidden`, so it's keyboard-reachable, with a `focus-within` ring.
- **Track page:**
  - Progress steps are an `<ol>` with text state.
  - Labelled reopen textarea.
  - Descriptive `alt` text on all photos.
  - Loading state uses `role="status"` with `aria-busy`.
- Clickable `<a>` elements for internal routes become `<Link>` (heatmap hotspots, login page back link).

### Testing

- **Backend — new test files:**
  - `test_security.py`: validation 422s, bulk-status 400s and cap, XFF spoofing with and without `TRUST_PROXY`, headers, `ai_mode`, docs disabled in production.
  - `test_efficiency.py`: analytics parity with the old loops, SLA-log join, cosine parity, indexes, `utc_now`.
  - `test_ai_and_routes.py`: live Gemini path with the SDK stubbed, mock fallbacks, resolve/reopen/queue/heatmap branches, the dedup merge through the API, and the prompt regression.
- **Backend — tooling:** `pytest-cov` with a 90% gate in `pyproject.toml`; currently 98%.
- **Frontend — new tests:**
  - `LoginPage.test.tsx`: success redirect, error message, 4 open-redirect cases.
  - `auth.test.ts`: `credentials: 'same-origin'` (it can't be overridden), logout POST, network-failure tolerance.
  - `AdminDashboard.test.tsx`: table, caption and labels, 401 → logout and redirect, tab keys, live announcements.
  - `jest-axe` checks with zero violations on the report form, track page, login page, and all three admin tabs.
- **CI:**
  - Backend job: ruff, pytest with coverage, `coverage.xml` artifact.
  - Frontend job: `next lint`, Jest with coverage, `next build`, on Node 20.
  - Docker build job with a `/health` smoke test.

### Code Quality

- `admin/page.tsx` (450 lines) is split into `components/admin/` modules: `FilterBar`, `BulkActionBar`, `ReportQueueTable`, `AnalyticsPanel`, `SlaLogPanel`, plus `constants.ts` and `types.ts` (`QueueReport`, `Analytics`, `SlaLogEntry`, `HeatmapPoint`, `QueueFilters`). The page is now about 290 lines of state and handlers.
- No `any` is left in app or component code: the heatmap, public map, track page and error handlers are typed.
- `ruff` config added (E, F, W, I, B, UP, S, SIM). `ruff check backend` is clean. Long prose strings in the seed data and the LLM prompt are exempt from E501 so their text stays unchanged. `UP042` (StrEnum) is ignored on purpose because it would change `str()` output in API responses.
- `next lint` is clean (`eslint-config-next`); `tsc --noEmit`, including tests, is clean.
- Return-type hints and docstrings on public route and service functions.
- `run_sla_check` now only closes DB sessions it opened. The unused `should_close` flag is honoured instead of always closing the caller's session.
