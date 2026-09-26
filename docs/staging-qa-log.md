# Staging QA routine — log & rotation (source of truth for the "Staging QA" Routine)

Branch: `claude/staging-qa` (this file only). Fix branches: `claude/staging-qa-fix-<n>` → PR into **`staging`** (never `master`, never deploy).

## Rotation (one area per run, in order; wrap around)
1. Engineering Works — backend (`dao/engbill.dao.js`, `routes/engbill.routes.js`, settings backfill)
2. Engineering Works — frontend (`Pages/Engineering/*`, `PrintEngInvoice.ts`, Settings engineering tabs, routing/header gating)
3. Automobile — backend + frontend (`autobill.*`, `Pages/Automobile/*`, `printAutoInvoice`)
4. Salary — backend + frontend (`employee/attendance/salary` DAOs+routes, `Pages/Salary/*`, `PrintPayslip.ts`)
5. Radiator (live in prod) — backend + frontend (`radiator.*`, `Pages/IssueCounter/*`, `printInvoice`), bonus, expenses
6. Cross-cutting — auth/tenant isolation, admin provisioning, settings, audit, migrations

Next area: **1**

## Rules
- At most ONE open QA PR at a time. Fixes are minimal and targeted; no refactors, no new features, no style churn.
- Radiator is live in production: a change there must fix a real, demonstrated bug (with a test that fails before and passes after) and must not change any other behavior.
- Every PR states: bug, repro, fix, tests added, and the verification output.
- Tests live in new files only: backend `Radiator-backend-main/test/*.test.js` (node:test, no DB — extract/test pure logic; mock the db layer if needed), frontend browser checks `Radiator-frontend-main/e2e/*.mjs` (Playwright via the global install, real app on Vite, API mocked with page.route). Adding a `test` script / devDependency to package.json is allowed.
- No live MongoDB is available: say so honestly; never claim DB-level verification.

## Test suite status
_(the routine keeps this list current: what exists, how to run it, last result)_

## Run log
_(newest first: date, area, findings, PR, result)_
