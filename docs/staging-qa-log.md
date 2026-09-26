# Staging QA routine — log & rotation (source of truth for the "Staging QA" Routine)

Branch: `claude/staging-qa` (this file only). Fix branches: `claude/staging-qa-fix-<n>` → PR into **`staging`** (never `master`, never deploy).

## Rotation (one area per run, in order; wrap around)
1. Engineering Works — backend (`dao/engbill.dao.js`, `routes/engbill.routes.js`, settings backfill)
2. Engineering Works — frontend (`Pages/Engineering/*`, `PrintEngInvoice.ts`, Settings engineering tabs, routing/header gating)
3. Automobile — backend + frontend (`autobill.*`, `Pages/Automobile/*`, `printAutoInvoice`)
4. Salary — backend + frontend (`employee/attendance/salary` DAOs+routes, `Pages/Salary/*`, `PrintPayslip.ts`)
5. Radiator (live in prod) — backend + frontend (`radiator.*`, `Pages/IssueCounter/*`, `printInvoice`), bonus, expenses
6. Cross-cutting — auth/tenant isolation, admin provisioning, settings, audit, migrations

Next area: **2**

## Rules
- At most ONE open QA PR at a time. Fixes are minimal and targeted; no refactors, no new features, no style churn.
- Radiator is live in production: a change there must fix a real, demonstrated bug (with a test that fails before and passes after) and must not change any other behavior.
- Every PR states: bug, repro, fix, tests added, and the verification output.
- Tests live in new files only: backend `Radiator-backend-main/test/*.test.js` (node:test, no DB — extract/test pure logic; mock the db layer if needed), frontend browser checks `Radiator-frontend-main/e2e/*.mjs` (Playwright via the global install, real app on Vite, API mocked with page.route). Adding a `test` script / devDependency to package.json is allowed.
- No live MongoDB is available: say so honestly; never claim DB-level verification.

## Test suite status
_(the routine keeps this list current: what exists, how to run it, last result)_

- Backend (`Radiator-backend-main/test/`, node:test, no `test` npm script wired yet):
  - `test/helpers/fakeDb.js` — in-memory Mongo-collection fake used by the DAO tests (not a test file itself).
  - `test/engbill.dao.test.js` (12 tests) — Engineering Works money math/clamping, payment accumulation/overpayment capping, adjustment logging, required-field validation, `requiresComment` enforcement, per-tenant bill numbering, tenant isolation across create/read/update/delete/list.
  - `test/backfillSettingsShape.test.js` (3 tests) — settings-backfill gated-on-absence, never overwrites existing tenant settings, idempotency, dry-run behavior.
  - Run with: `node --experimental-test-module-mocks --test test/engbill.dao.test.js test/backfillSettingsShape.test.js`
  - Last result (2026-09-26, PR #25 pending merge): 15/15 pass, 0 fail.
  - Note: `node --test test/` (bare, no file args) also picks up `src/scripts/test-isolation.js` via Node's default test-file glob — that script is a manual integration script requiring a live server/Mongo and is unrelated to this suite; run the two test files explicitly as shown above instead.
- Frontend: no Playwright `e2e/*.mjs` checks added yet.

## Run log
_(newest first: date, area, findings, PR, result)_

- **2026-09-26** — Area 1: Engineering Works (backend). Reviewed `engbill.dao.js`, `engbill.routes.js`, `backfillSettingsShape.js` for money math, tenant isolation, validation, and crash bugs. No real bug found (money math, payment accumulation, tenant isolation, validation/crash paths, per-tenant bill numbering, and settings backfill all verified correct via mocked-DB tests). Added 15 new backend tests to lock in current behavior. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/25 (branch `claude/staging-qa-fix-1`) — open, pending review per the QA charter's review-then-merge process.
