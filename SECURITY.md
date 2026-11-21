# Security

Evidence-based: every control below names the file that implements it and the test that proves it. Paths are relative to `backend/` or `frontend/` unless they start at the repo root.

## Threat model

### Assets
| Asset | Why it matters |
|---|---|
| Admin authority (`ADMIN_API_KEY`, admin session tokens) | Can change any issue's status, trigger escalations and see the full queue |
| Integrity of the civic record (reports, statuses, timeline, SLA-breach log) | The platform's value is a trustworthy public accountability trail |
| Availability of citizen reporting | Residents must be able to report issues at any time |
| Server host (filesystem, process) | Uploaded files are parsed server-side |
| Gemini API key / quota | Cost and abuse |
| Citizen-submitted content shown to others | Must not become a vector for script injection |

### Actors
| Actor | Capabilities |
|---|---|
| Anonymous citizen | Submit reports with photos, upvote, reopen within 72 h, read public pages and APIs |
| Malicious anonymous user | Crafted uploads/inputs, spoofed headers, request floods, XSS payloads in report text |
| Admin | Authenticated via session cookie or `X-Admin-Key` |
| Network attacker | Observes or tampers with traffic; tries to frame the site |

### STRIDE
| Threat | Example against CivicResolve | Controls (see table below) |
|---|---|---|
| **S**poofing | Guessing or forging an admin session; spoofing `X-Forwarded-For` to dodge rate limits | C1, C2, C3, C9 |
| **T**ampering | Non-admin changing an issue's status; invalid statuses via bulk update; path traversal into the server's files | C1, C4, C5, C8 |
| **R**epudiation | Status changes with no record | C12 (every change writes an actor-stamped timeline event) |
| **I**nformation disclosure | Stack traces or paths in errors; API docs exposing the full surface; raw admin key in the browser | C2, C10, C11 |
| **D**enial of service | Report floods; huge uploads; decompression or decoder bombs; very large list requests | C3, C6, C7, C8, C14 |
| **E**levation of privilege | XSS via report titles in map popups; clickjacking; malicious "image" files executed or rendered as HTML | C6, C7, C13, C15 |

## Controls

| ID | Control | Implementation | Test(s) that prove it |
|---|---|---|---|
| C1 | All admin routes and mutating actions require an admin session or `X-Admin-Key`. The key is compared in constant time. | `services/auth.py::verify_admin_key`, `check_admin_key`; `dependencies=[Depends(verify_admin_key)]` in `routes/admin.py`, `routes/report_lifecycle.py`, `main.py` | `tests/test_auth.py::test_admin_queue_requires_auth`, `::test_mutating_report_routes_require_admin_auth`, `::test_admin_analytics_and_heatmap_require_auth`, `::test_trigger_sla_check_requires_auth` |
| C2 | Opaque, server-side admin sessions in an `HttpOnly; Secure; SameSite=Lax` cookie (the raw key never reaches the browser). Rotated on login, revoked on logout, 8 h expiry. The app fails fast without a key of 16+ characters. | `services/auth.py` (`AdminSessionStore`, `_load_admin_key`), `routes/admin_auth.py` | `tests/test_admin_session.py::test_login_cookie_is_opaque_token_not_raw_key`, `::test_raw_key_in_cookie_is_rejected`, `::test_forged_token_is_rejected`, `::test_logout_revokes_session`, `::test_relogin_rotates_previous_token`, `::test_expired_session_is_rejected` |
| C3 | Per-IP sliding-window rate limits: reports 10/min, upvotes 30/min, reopens 5/min, admin login 10/min. Responses are 429 with `Retry-After`. | `services/auth.py::InMemoryRateLimiter` | `tests/test_reports_api.py::test_rate_limiter_blocks_excessive_submissions`; `tests/test_upload_security.py::test_upvote_rate_limit`, `::test_reopen_rate_limit_sets_retry_after`; `tests/test_admin_session.py::test_login_is_rate_limited` |
| C4 | Client IP for rate limiting: socket peer by default. `X-Forwarded-For` is honoured only when `TRUST_PROXY=1`, and is walked right-to-left past trusted proxy ranges, so spoofed left-hand entries are ignored. | `services/auth.py::get_client_ip`; `TRUST_PROXY=1` in `Dockerfile`; uvicorn `--no-proxy-headers` in `start.sh` | `tests/test_security.py::test_xff_ignored_without_trust_proxy`, `::test_xff_spoofed_left_entries_are_ignored`, `::test_xff_skips_trusted_proxy_hops`, `::test_xff_private_spoof_cannot_hide_client`, `::test_rotating_spoofed_xff_does_not_bypass_rate_limit`, `::test_rotating_spoofed_prefix_with_trust_proxy_still_limited` |
| C5 | Input bounds on every public field: lat/lon ranges, title 3–120, description 10–2000, address ≤300, notes ≤500, radius 1–50 000, `limit` 1–200, `offset` 0–100 000. Category, status and department are enum-validated. | `constants.py`; `Form`/`Query` constraints in `routes/*.py`; `services/pagination.py` | `tests/test_security.py::test_create_report_rejects_out_of_range_fields`, `::test_create_report_accepts_boundary_values`, `::test_list_reports_rejects_invalid_query`, `::test_admin_list_endpoints_validate_query`, `::test_status_note_and_reopen_reason_length_caps`; `tests/test_performance.py::test_pagination_bounds` |
| C6 | Uploads are capped at 8 MB before decoding. Pillow may use **only** the JPEG/PNG/WebP decoders (`formats=`), then `verify()`. The stored extension comes from the verified format, never the filename. | `services/uploads.py::save_upload`, `constants.py` | `tests/test_upload_security.py::test_oversized_upload_rejected_before_decoding`, `::test_non_allowlisted_decoders_are_never_used`, `::test_html_jpeg_polyglot_is_rejected`, `::test_svg_with_script_is_rejected`, `::test_valid_image_with_trailing_html_is_stored_with_safe_extension`, `::test_empty_upload_rejected`; `tests/test_file_upload.py::test_extension_derived_from_verified_format_not_client_filename` |
| C7 | Uploaded files are served with the right image `Content-Type` plus `nosniff`, so a polyglot can never render as HTML. | `main.py` (`ImmutableStaticFiles` mount), `app_security.py` | `tests/test_upload_security.py::test_uploaded_files_served_with_nosniff` |
| C8 | No path traversal from `/uploads`. Starlette `StaticFiles` resolves paths inside the upload directory only. | `main.py`, `app_performance.py::ImmutableStaticFiles` | `tests/test_upload_security.py::test_path_traversal_on_uploads_is_blocked` (5 encodings) |
| C9 | Bulk status updates validate the status (400 on invalid), cap the request at 200 IDs and use one `IN` query. | `routes/admin.py::bulk_status_update` | `tests/test_security.py::test_bulk_status_rejects_invalid_status`, `::test_bulk_status_caps_number_of_ids`, `::test_bulk_status_rejects_empty_id_list`, `::test_bulk_status_accepts_exactly_the_cap` |
| C10 | Generic error responses: a global handler logs the exception server-side and returns only `{"detail": "...", "error_id": "..."}`, with no stack trace, exception type or path. | `app_security.py::unhandled_exception_handler` | `tests/test_upload_security.py::test_unhandled_errors_return_generic_message`, `::test_not_found_does_not_leak_internals` |
| C11 | `/docs`, `/redoc` and `/openapi.json` are disabled when `ENV=production` (set in the `Dockerfile`). | `main.py` | `tests/test_security.py::test_docs_disabled_in_production`, `::test_docs_available_outside_production` |
| C12 | Every status change writes an actor-stamped (`admin`/`citizen`/`system`/`ai`) public timeline event. | `routes/report_lifecycle.py`, `routes/admin.py`, `services/sla_engine.py` | `tests/test_security.py::test_bulk_status_updates_existing_ids_and_logs_timeline`; `tests/test_sla_engine.py::test_run_sla_check_escalates_breached_reports` |
| C13 | Security headers. API: `default-src 'none'` CSP, `frame-ancestors 'none'`, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, HSTS. Web: CSP allowing only self plus the OSM tiles, unpkg marker icons and Nominatim, with the same companion headers. | `app_security.py`; `frontend/next.config.js` | `tests/test_security.py::test_security_headers_present`; `tests/test_upload_security.py::test_api_csp_blocks_scripts_and_framing`; Next headers verified in `VERIFICATION.md` (curl of the running build) |
| C14 | Admin and auth responses are `Cache-Control: no-store`; middleware redirects are `no-store`. | `app_performance.py::cache_policy`; `frontend/middleware.ts` | `tests/test_performance.py::test_private_and_health_responses_are_not_stored`, `::test_mutations_are_not_stored` |
| C15 | User text is HTML-escaped before it goes into Leaflet popup HTML. React escapes everywhere else. | `frontend/lib/escapeHtml.ts`; `components/PublicMapView.tsx`, `components/HeatmapPanel.tsx` | `__tests__/PublicMap.test.tsx` (“HTML-escaped popups”), `__tests__/Heatmap.test.tsx`, `__tests__/Misc.test.tsx` (`escapeHtml`) |
| C16 | Post-login redirect limited to `/admin` paths (no open redirect). | `frontend/app/admin/login/page.tsx` | `__tests__/LoginPage.test.tsx` (4 open-redirect cases) |
| C17 | Admin fetches are always `credentials: 'same-origin'` and can't be overridden. Logout revokes the server session. | `frontend/lib/auth.ts` | `__tests__/auth.test.ts` |
| C18 | Container hardening: runs as non-root uid 10001, the API is bound to 127.0.0.1, and the image never contains `.env`, the DB or uploads. | `Dockerfile`, `start.sh`, `.dockerignore` | CI `docker` job smoke test (`.github/workflows/test.yml`) |
| C19 | Dependency auditing in CI: any **unreviewed** high/critical advisory fails the build. | `security/run-pip-audit.sh`, `security/check-npm-audit.mjs` | CI `backend` and `frontend` jobs; local output in `VERIFICATION.md` |

## Dependency advisories and residual risk

Policy for this release: fix by **patch-version bumps only** (zero-regression constraint).

- **Fixed:**
  - `fastapi` 0.115.0 → 0.115.14, which pulls in `starlette` 0.46.2 and fixes PYSEC-2026-1943.
  - `python-multipart` 0.0.12 → 0.0.31, which fixes 7 advisories (multipart/urlencoded parsing DoS, path traversal).
- **Mitigated, not upgradable by patch:**
  - **Historical (superseded) Pillow 11.0.0:** fixes need 12.x/13.x. Uploads can only reach the JPEG/PNG/WebP decoders (C6), so the PSD/TIFF/PDF/BMP/GIF/EPS/MSP/FITS/JPEG2000/font/ImageCms code paths behind these advisories are unreachable. Proven by `test_non_allowlisted_decoders_are_never_used`.
  - **Next.js 14.2.35** (newest 14.x): fixes need Next 15.5+/16 plus React 19. Image-optimizer RCEs are mitigated by `images.unoptimized: true`. Other advisories target features the app doesn't use: Server Actions, Pages-Router i18n, WebSockets, Windows hosting, and request-derived rewrite hosts. Each one has a written rationale in `security/npm-audit-allowlist.json`.
  - **python-dotenv 1.0.1:** only `set_key`/`unset_key` are affected, and the app only reads `.env`.
- **Residual (accepted for the demo):**
  - Starlette advisories fixed only in ≥0.47, which is outside FastAPI 0.115's supported range. Examples: Host-header URL reconstruction, Range-header CPU use on static files, and `request.form()` limits. Exposure is reduced because the API listens on loopback behind Next.js and form bodies come through size-capped endpoints.
  - In-memory sessions and rate limits are per instance. Deploy with `--max-instances 1`, or move them to Redis to scale out.
- **Recommended next step after judging:** upgrade to Pillow 13, FastAPI ≥ 0.120 / Starlette ≥ 1.3, and Next 15.5+. The full test suite and E2E run are the regression net.

Every ignored ID is listed with its reason in `security/pip-audit-ignore.txt` and `security/npm-audit-allowlist.json` (reviewed 2026-11-21).

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
