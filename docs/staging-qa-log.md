# Staging QA routine — log & rotation (source of truth for the "Staging QA" Routine)

Branch: `claude/staging-qa` (this file only). Fix branches: `claude/staging-qa-fix-<n>` → PR into **`staging`** (never `master`, never deploy).

## Rotation (one area per run, in order; wrap around)
1. Engineering Works — backend (`dao/engbill.dao.js`, `routes/engbill.routes.js`, settings backfill)
2. Engineering Works — frontend (`Pages/Engineering/*`, `PrintEngInvoice.ts`, Settings engineering tabs, routing/header gating)
3. Automobile — backend + frontend (`autobill.*`, `Pages/Automobile/*`, `printAutoInvoice`)
4. Salary — backend + frontend (`employee/attendance/salary` DAOs+routes, `Pages/Salary/*`, `PrintPayslip.ts`)
5. Radiator (live in prod) — backend + frontend (`radiator.*`, `Pages/IssueCounter/*`, `printInvoice`), bonus, expenses
6. Cross-cutting — auth/tenant isolation, admin provisioning, settings, audit, migrations

Next area: **4**

## Rules
- At most ONE open QA PR at a time. Fixes are minimal and targeted; no refactors, no new features, no style churn.
- Radiator is live in production: a change there must fix a real, demonstrated bug (with a test that fails before and passes after) and must not change any other behavior.
- Every PR states: bug, repro, fix, tests added, and the verification output.
- Tests live in new files only: backend `Radiator-backend-main/test/*.test.js` (node:test, no DB — extract/test pure logic; mock the db layer if needed), frontend browser checks `Radiator-frontend-main/e2e/*.mjs` (Playwright via the global install, real app on Vite, API mocked with page.route). Adding a `test` script / devDependency to package.json is allowed.
- No live MongoDB is available: say so honestly; never claim DB-level verification.

## Open follow-ups (to verify with tests before touching live code)
- Radiator Billing Record Payment likely has the same discount wipe/replace issue as automobile (#27) — check in area 5.
- Radiator + automobile analytics `totalPending = revenue − collected` ignores discounts (overstates pending) — check in area 5/6.
- e2e scripts use fixed `waitForTimeout` sleeps; replace with request/condition waits.

## Test suite status
_(the routine keeps this list current: what exists, how to run it, last result)_

- Backend (`Radiator-backend-main/test/`, node:test, no `test` npm script wired yet):
  - `test/helpers/fakeDb.js` — in-memory Mongo-collection fake used by the DAO tests (not a test file itself).
  - `test/engbill.dao.test.js` (12 tests) — Engineering Works money math/clamping, payment accumulation/overpayment capping, adjustment logging, required-field validation, `requiresComment` enforcement, per-tenant bill numbering, tenant isolation across create/read/update/delete/list.
  - `test/backfillSettingsShape.test.js` (3 tests) — settings-backfill gated-on-absence, never overwrites existing tenant settings, idempotency, dry-run behavior.
  - Run with: `node --experimental-test-module-mocks --test test/engbill.dao.test.js test/backfillSettingsShape.test.js`
  - Last result (2026-09-26 06:37, on staging after #25 merge): 15/15 pass, 0 fail.
  - Note: `node --test test/` (bare, no file args) also picks up `src/scripts/test-isolation.js` via Node's default test-file glob — that script is a manual integration script requiring a live server/Mongo and is unrelated to this suite; run the two test files explicitly as shown above instead.
- Frontend (`Radiator-frontend-main/e2e/`, Playwright via global install, real app on Vite, API mocked):
  - `e2e/engineering.e2e.mjs` — 33 checks: engineering redirect/header gating, service form (validation, uppercase truck, autofill, per-BS rates, subtotals, quick-add, BS-6 hiding, save payload), billing list, Record Payment discount, Settings catalog; radiator-tenant regression (header, dashboard, settings tabs, route gating).
  - Run with: `npx vite --port 5173 &` then `node e2e/engineering.e2e.mjs` (exit code 1 on any failure).
  - Last result (2026-09-26 14:37, staging after #26 + PR #27 branch): 33/33 pass.
  - `e2e/automobile.e2e.mjs` — 10 checks: automobile redirect/header, engineering route gating, billing list, Record Payment discount (payment keeps existing discount; extra discount adds), qty × rate, bill-date required, create payload.
  - Run with: `node e2e/automobile.e2e.mjs` (same Vite setup). Last result (PR #27 branch): 10/10 pass.

## Run log
_(newest first: date, area, findings, PR, result)_

- **2026-09-26 14:37** — Merged PR #26 (engineering payment-discount fix + 33 e2e checks) after NO-BLOCKERS review; re-ran backend 15/15, tsc clean, e2e 33/33. Area 3: Automobile. **Real bug found:** Record Payment wipes an existing discount when a later payment has no discount (route coerces missing → 0), and replaces instead of adds a further discount. Fixed in `Pages/Automobile/Billing/Index.tsx` (always send existing + entered). Added `e2e/automobile.e2e.mjs` (10 checks); both discount checks fail before the fix and pass after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/27 — open, awaiting review. Noted likely same issue in radiator (live) + analytics pending ignoring discounts, for area 5.
- **2026-09-26 06:37** — Merged PR #25 (15 backend tests) into staging after NO-BLOCKERS review; re-ran 15/15 green. Area 2: Engineering Works (frontend). **Real bug found:** Record Payment dialog sent the entered discount as the bill's total discount, dropping any discount set on the service form (₹50 existing + ₹100 entered stored as ₹100). Fixed in `Pages/Engineering/Billing/Index.tsx` (send existing + entered). Added `e2e/engineering.e2e.mjs` (33 checks); the new payment test fails before the fix (`discount: 100`) and passes after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/26 — open, awaiting review.
- **2026-09-26** — Area 1: Engineering Works (backend). Reviewed `engbill.dao.js`, `engbill.routes.js`, `backfillSettingsShape.js` for money math, tenant isolation, validation, and crash bugs. No real bug found (money math, payment accumulation, tenant isolation, validation/crash paths, per-tenant bill numbering, and settings backfill all verified correct via mocked-DB tests). Added 15 new backend tests to lock in current behavior. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/25 (branch `claude/staging-qa-fix-1`) — open, pending review per the QA charter's review-then-merge process.
