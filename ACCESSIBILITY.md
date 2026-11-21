# Accessibility (WCAG 2.1 AA)

## How it was tested
1. **Automated rules: jest-axe** (axe-core 4.9) with zero violations on every page: report form (empty, with validation errors, and the AI result), track page, public map page and map component, admin login, admin dashboard (all three tabs) and heatmap. See the `has no detectable accessibility violations` tests in `frontend/__tests__/`.
2. **Lint: `eslint-plugin-jsx-a11y` (strict)** runs on every build (`npm run lint`, CI fails on warnings).
3. **Keyboard-only E2E: Playwright** in `frontend/e2e/accessibility.spec.ts`, against the production build. It reaches every control only with Tab, Enter, Space and arrow keys.
4. **Touch targets: Playwright** on a 390×844 touch viewport (`pointer: coarse`) measures every visible non-inline interactive element on all pages (≥ 44×44 px).

## WCAG 2.1 AA checklist

| Criterion | How CivicResolve meets it | Evidence |
|---|---|---|
| 1.1.1 Non-text content | Descriptive `alt` on every photo (“Before repair: …”); decorative emoji `aria-hidden`; risk-flag icons have `role="img"` + label; the heatmap has `role="img"` with a generated description plus a visually hidden hotspot table | `components/track/*`, `components/admin/ReportQueueTable.tsx`, `components/HeatmapPanel.tsx`; `__tests__/Heatmap.test.tsx`, `__tests__/TrackPage.test.tsx` |
| 1.3.1 Info and relationships | Labels tied to every field (`htmlFor`/`aria-label`); the admin queue is a `<table>` with a `<caption>` and `scope="col"` headers; tablist/tab/tabpanel roles; landmarks (`nav`, `main`, `aside`); progress steps are an `<ol>` | `__tests__/AdminDashboard.test.tsx` |
| 1.3.5 Identify input purpose | Admin key field uses `autocomplete="current-password"` | `app/admin/login/page.tsx` |
| 1.4.1 Use of colour | Urgency (“Urgency P4 (High)”), status (“Status: …”), SLA breach (“SLA breached · Nh overdue”) and selected filters (✓ + `aria-pressed`) are never shown by colour alone | `components/admin/ReportQueueTable.tsx`, `components/PublicMapView.tsx` |
| 1.4.3 Contrast (minimum) | Body text ≥ gray-600 on light backgrounds, 700 shades for coloured text, gray-300 on the dark heatmap; axe `color-contrast` passes | jest-axe suites |
| 1.4.4 / 1.4.10 Resize and reflow | Tailwind responsive layout, no fixed-width text containers | manual check at 390 px (touch-target E2E viewport) |
| 2.1.1 Keyboard | Whole flow is keyboard-operable; the map has a typed-coordinate alternative (`LocationPicker`); admin tabs support ←/→/Home/End | `e2e/accessibility.spec.ts` |
| 2.1.2 No keyboard trap | The E2E walks through and back out of every component | `e2e/accessibility.spec.ts` |
| 2.3.3 Animation from interactions | `prefers-reduced-motion` disables animations and transitions | `app/globals.css` |
| 2.4.1 Bypass blocks | “Skip to main content” is the first tab stop and moves focus to `<main>` | `__tests__/Misc.test.tsx`; `e2e/accessibility.spec.ts` |
| 2.4.3 Focus order | After client-side navigation focus moves to `<main>`. After submit, focus moves to the result heading. After a validation error, focus moves to the error summary. | `components/RouteFocus.tsx`, `components/report/SubmissionResult.tsx`, `app/page.tsx`; `__tests__/RouteFocus.test.tsx`, `__tests__/ReportFlow.test.tsx`, E2E |
| 2.4.6 Headings and labels | One `h1` per page; panel headings are `h2` (axe heading-order passes) | jest-axe suites |
| 2.4.7 Focus visible | 3 px `:focus-visible` outline with a white halo on all interactive elements | `app/globals.css` |
| 2.5.5 Target size (AAA, done anyway) | ≥ 44×44 px on touch screens via `@media (pointer: coarse)`; desktop layout unchanged | `e2e/accessibility.spec.ts` → “touch targets on touch screens” |
| 3.1.1 Language of page | `<html lang="en">` | `__tests__/Misc.test.tsx` |
| 3.2.2 On input | Changing a filter only refetches data; it never navigates | admin and map tests |
| 3.3.1 Error identification | Error summary (`role="alert"`, focused) lists each problem as a link to its field; fields get `aria-invalid="true"` | `__tests__/ReportFlow.test.tsx` (“validates fields…”), E2E |
| 3.3.2 Labels or instructions | Required fields marked; length limits stated (“10–2000 characters”) and enforced with `minLength`/`maxLength` | `__tests__/ReportForm.test.tsx` |
| 3.3.3 Error suggestion | Messages say how to fix the problem (“Title must be at least 3 characters”) and are linked through `aria-describedby` | `__tests__/ReportFlow.test.tsx` |
| 4.1.2 Name, role, value | Toggle buttons expose `aria-pressed`; tabs expose `aria-selected`/`aria-controls`; busy regions `aria-busy` | jest-axe + unit tests |
| 4.1.3 Status messages | Polite live regions for loading, bulk-update and SLA-check results, route changes, filter result counts and AI triage progress | `__tests__/AdminDashboard.test.tsx`, `__tests__/RouteFocus.test.tsx`, `__tests__/Misc.test.tsx` |

## Known limitations
- Leaflet's map canvas is a visual aid. Its equivalent text alternatives are the typed-coordinate inputs (report form), the issue list and track pages (public map), and the hotspot table (heatmap).
- Contrast was verified by axe in jsdom. Text over map tiles was not measured, because tiles are third-party imagery.
