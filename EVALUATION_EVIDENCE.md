# CivicResolve — evaluation evidence map

The organizer provided six **focus areas**, along with definitions of High/Medium/Low Impact but **no per-criterion tier assignment**. We therefore list our own order for improvements without claiming these are official weights or a predictable judge score.

| Focus area | Evidence in code | Reproducible proof | Outstanding risk / action |
|---|---|---|---|
| **Problem alignment** | `backend/routes/reports.py`, `backend/services/gemini_triage.py`, `frontend/app/page.tsx`, `/track`, `/admin` | `backend/tests/test_reports_api.py`, `frontend/e2e/happy-path.spec.ts` | Confirm exact official vertical; show flow live |
| **Smart and dynamic assistant** | Context inputs → Gemini classification + risk flags → validation → SLA routing; mock rule fallback explicitly labelled | `backend/tests/test_ai_and_routes.py`, `frontend/__tests__/ReportFlow.test.tsx` | Live AI evidence must use valid key/quota; follow-up conversational questioning is not implemented |
| **Code quality** | Separated routes/services, typed Next.js UI, Pydantic/SQLAlchemy validation | Ruff, mypy, ESLint, Prettier, tsc in `.github/workflows/test.yml` | Exact CI environment must pass |
| **Security** | Session auth, request limits, image validation, HTTP headers | `backend/tests/test_auth.py`, `test_security.py`, `test_file_upload.py`, `test_upload_security.py` | Some npm dependency advisories remain; no claim of being bulletproof |
| **Efficiency** | Pagination, indexed queries, SQL prefilter, response compression, lazy maps | `backend/tests/test_efficiency.py`, `test_performance.py` | No independently audited load test or scaling guarantees |
| **Testing** | Backend pytest coverage gate >=90%, frontend Jest >=80%, browser E2E, Docker smoke check | CI workflow `backend`, `frontend`, `e2e`, `docker` | Green workflow screenshot/link required |
| **Accessibility** | Labeled controls, error focus/summary, keyboard coordinates and tabs, touch targets | `frontend/__tests__/*`, `frontend/e2e/accessibility.spec.ts`, `ACCESSIBILITY.md` | Automated a11y checks cannot certify full WCAG conformance |
| **Practical usability** | Citizen intake, tracking timeline, admin queue, reopen, resolution review | `frontend/e2e/happy-path.spec.ts` | SQLite storage is not persistent across container replacement; municipality integration is simulated |

## Explainable decision-making example

*Illustrative scenario, not a guarantee of a specific model output.*

> Citizen input: "A large pothole near a school gate is causing traffic to swerve." The resident optionally attaches a photo and pins the location.

- The backend analyzes text and image (when provided) and proposes a category, urgency, risk flag and department.
- The model output is validated so unknown departments/categories and malformed scores cannot be accepted as unchecked final data.
- The urgency and category determine a configured SLA deadline; geolocation and embeddings help identify duplicate nearby tickets.
- The citizen sees the classification summary and a tracking link. The result explicitly discloses whether **Gemini** or the **rule-based fallback** made the decision.
- Authorized operators, rather than the model itself, control final operational status and interventions.

## Four things judges should verify personally

1. **Actual context**: compare a low-risk report with one mentioning a school, electrical hazard, or blocked access. Verify that the output is different for a credible reason—not simply a static canned label.
2. **Live-vs-fallback honesty**: submit with no API key and verify the result is labelled *rule-based fallback*; then verify real Gemini requests with a valid key in a deployed environment.
3. **Resilience**: test bad fields, no photo, rate limiting, empty Gemini response and duplicate reports; ensure no crash or falsely verified resolution.
4. **Reproducibility**: clone the public repo on a clean machine, follow README, and ensure CI + smoke test pass.

## Evidence still needed for submission

Public repository URL: **not supplied**. Deployment URL: **not supplied**. Official allowed vertical label: **not supplied**. Full green GitHub Actions run: **not verified**. Live model output: **not verified**. No numeric score estimate should be presented as judge-certified.
