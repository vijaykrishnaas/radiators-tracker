# Staging QA routine — log & rotation (source of truth for the "Staging QA" Routine)

Branch: `claude/staging-qa` (this file only). Fix branches: `claude/staging-qa-fix-<n>` → PR into **`staging`** (never `master`, never deploy).

## Rotation (one area per run, in order; wrap around)
1. Engineering Works — backend (`dao/engbill.dao.js`, `routes/engbill.routes.js`, settings backfill)
2. Engineering Works — frontend (`Pages/Engineering/*`, `PrintEngInvoice.ts`, Settings engineering tabs, routing/header gating)
3. Automobile — backend + frontend (`autobill.*`, `Pages/Automobile/*`, `printAutoInvoice`)
4. Salary — backend + frontend (`employee/attendance/salary` DAOs+routes, `Pages/Salary/*`, `PrintPayslip.ts`)
5. Radiator (live in prod) — backend + frontend (`radiator.*`, `Pages/IssueCounter/*`, `printInvoice`), bonus, expenses
6. Cross-cutting — auth/tenant isolation, admin provisioning, settings, audit, migrations

Next area: **3** (sixth lap)

## Rules
- At most ONE open QA PR at a time. Fixes are minimal and targeted; no refactors, no new features, no style churn.
- Radiator is live in production: a change there must fix a real, demonstrated bug (with a test that fails before and passes after) and must not change any other behavior.
- Every PR states: bug, repro, fix, tests added, and the verification output.
- Tests live in new files only: backend `Radiator-backend-main/test/*.test.js` (node:test, no DB — extract/test pure logic; mock the db layer if needed), frontend browser checks `Radiator-frontend-main/e2e/*.mjs` (Playwright via the global install, real app on Vite, API mocked with page.route). Adding a `test` script / devDependency to package.json is allowed.
- No live MongoDB is available: say so honestly; never claim DB-level verification.

## Open follow-ups (to verify with tests before touching live code)
- Radiator discount wipe/replace: CONFIRMED on live radiator, fix in PR #29. Production data may already have lost discounts — flag to user before promotion.
- Salary payslip/preview carried-forward display: fixed in #34 (merged). Remaining: deductions beyond gross are silently waived (not shown/carried).
- Design decision for user: editing a bill below what was received permanently caps receivedAmount (radiator/auto/eng); a corrected edit doesn't restore it.
- Dashboard Pending ignoring discounts: fixed in #30 (merged). Before release, compare Σ enrich().pendingAmount vs totalPending on a staging data snapshot (pipeline never run against real Mongo here).
- Engineering: discount added after full payment caps amountReceived without a matching negative payments[] entry (log sum ≠ amountReceived; not shown in UI) — low priority.
- Radiator discount fix #29 merged — production bills may already have lost discounts; offer a read-only check before promotion.
- Consider making payment discount additive server-side (frontend is the only guard today) and returning the delta for toast/audit.
- Salary: manual present-days above working days pushes gross above base salary (no validation).
- e2e scripts use fixed `waitForTimeout` sleeps; replace with request/condition waits.

## Test suite status
_(the routine keeps this list current: what exists, how to run it, last result)_

- Backend (`Radiator-backend-main/test/`, node:test, no `test` npm script wired yet):
  - `test/helpers/fakeDb.js` — in-memory Mongo-collection fake used by the DAO tests (not a test file itself).
  - `test/engbill.dao.test.js` (12 tests) — Engineering Works money math/clamping, payment accumulation/overpayment capping, adjustment logging, required-field validation, `requiresComment` enforcement, per-tenant bill numbering, tenant isolation across create/read/update/delete/list.
  - `test/backfillSettingsShape.test.js` (3 tests) — settings-backfill gated-on-absence, never overwrites existing tenant settings, idempotency, dry-run behavior.
  - `test/salary.dao.test.js` (4 tests) — advance split/carry-forward, settle math with deductions, re-settle rejection.
  - Run with: `node --experimental-test-module-mocks --test test/engbill.dao.test.js test/backfillSettingsShape.test.js test/salary.dao.test.js`
  - `test/analytics.pending.test.js` (5 tests) — dashboard Pending net of discounts for radiator + automobile (pipeline shape + KPI math, aggregate stubbed).
  - `test/engbill.more.test.js` (7 tests) — numbering from billStartNumber, payments + discounts, overpayment cap, edit-below-received adjustment, vehicle lookup; fresh FakeDb per test.
  - Run all: `node --experimental-test-module-mocks --test test/*.test.js` is NOT safe (picks up src/scripts); list files explicitly: engbill.more, analytics.pending, salary.dao, engbill.dao, backfillSettingsShape.
  - `test/autobill.bonus.test.js` (5 tests) — automobile totals, bill numbers, flat-% bonus on net, paid-lock, labour edits, tenant isolation.
  - `test/radiator.dao.test.js` (6 tests) — radiator (live) totals, payments/discount, matrix bonus, overpay cap, edit cap, delete keeps paid bonuses, tenant isolation.
  - Last result (2026-09-29 10:37, PR #35 branch): 42/42 pass (files: autobill.bonus, engbill.more, analytics.pending, salary.dao, engbill.dao, backfillSettingsShape).
  - Last result (2026-09-26 06:37, on staging after #25 merge): 15/15 pass, 0 fail.
  - Note: `node --test test/` (bare, no file args) also picks up `src/scripts/test-isolation.js` via Node's default test-file glob — that script is a manual integration script requiring a live server/Mongo and is unrelated to this suite; run the two test files explicitly as shown above instead.
- Frontend (`Radiator-frontend-main/e2e/`, Playwright via global install, real app on Vite, API mocked):
  - `e2e/engineering.e2e.mjs` — 33 checks: engineering redirect/header gating, service form (validation, uppercase truck, autofill, per-BS rates, subtotals, quick-add, BS-6 hiding, save payload), billing list, Record Payment discount, Settings catalog; radiator-tenant regression (header, dashboard, settings tabs, route gating).
  - Run with: `npx vite --port 5173 &` then `node e2e/engineering.e2e.mjs` (exit code 1 on any failure).
  - Now 68 checks (71 after UI PR #47; edit, view-only, print PDF + PDF content, catalog rail/phone layout, billing cards + filters, sticky Save bar). Last result (2026-10-03, staging after #46): 68/68 pass. NOTE: catalog selectors are now `.eng-item` / `.eng-type` (UI redesign PRs #36-#38); Engineering UI is intentionally restyled — do not 'fix' it back.
  - `e2e/automobile.e2e.mjs` — 10 checks: automobile redirect/header, engineering route gating, billing list, Record Payment discount (payment keeps existing discount; extra discount adds), qty × rate, bill-date required, create payload.
  - Run with: `node e2e/automobile.e2e.mjs` (same Vite setup). Last result (2026-09-27): 10/10 pass.
  - `e2e/salary.e2e.mjs` — 6 checks: settle preview advance/carry/net, payslip PDF download + carried-forward text. Run: `node e2e/salary.e2e.mjs`. Last result (2026-09-29 10:37, staging after #34): 6/6 pass.
  - `e2e/radiator.e2e.mjs` — 6 checks: billing list, header, Record Payment discount (keep existing / add extra), engineering route gating. Run: `node e2e/radiator.e2e.mjs`. Last result (2026-09-27, staging after #29): 6/6 pass.

## Run log
_(newest first: date, area, findings, PR, result)_

- **2026-09-29 10:37** — Merged PR #34 (payslip/preview carried-forward) after NO-BLOCKERS review; re-ran backend 36/36, tsc clean, e2e salary 6/6, engineering 39/39, radiator 6/6, automobile 10/10. Second lap, Area 5: Radiator (live) — no new bug. Added `test/radiator.dao.test.js` (6 tests); backend 42/42. Logged design question (edit-below-received permanently caps received). PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/35 (tests only) — open, awaiting review.
- **2026-09-29 02:37** — Merged PR #33 (automobile bill + bonus tests) after NO-BLOCKERS review; re-ran backend 36/36, tsc clean. Second lap, Area 4: Salary. **Real bug found (display):** after #28, the payslip PDF still printed full advance amounts with no carried-forward line (lines didn't reconcile with net), and the settle preview hid the carry. Fixed in `PrintPayslip.ts` + `SettlePeriod/Index.tsx` (add "carried forward" row). Added `e2e/salary.e2e.mjs` (6 checks); 2 fail before, 6/6 after; other e2e suites green. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/34 — open, awaiting review.
- **2026-09-28 18:37** — Merged PR #32 (engineering e2e: edit/view/print) after NO-BLOCKERS review; re-ran backend 31/31, tsc clean, e2e engineering 39/39, radiator 6/6, automobile 10/10. Second lap, Area 3: Automobile — no new bug (reviewed autobill DAO + auto bonus sync). Added `test/autobill.bonus.test.js` (5 tests) and fakeDb upsert/deleteMany/$nin/$inc. Backend 36/36. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/33 (tests only) — open, awaiting review.
- **2026-09-28 10:37** — Merged PR #31 (engineering DAO tests) after NO-BLOCKERS review; re-ran backend 31/31, tsc clean. (06:37 run skipped merge: command classifier outage, retried here.) Second lap, Area 2: Engineering frontend — no new bug. Added 6 e2e checks (edit load/update, view-only, print PDF); engineering 39/39, radiator 6/6, automobile 10/10. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/32 (tests only) — open, awaiting review.
- **2026-09-27 22:37** — Merged PR #30 (dashboard Pending net of discounts) after strict NO-BLOCKERS review; re-ran backend 24/24, tsc clean, e2e radiator 6/6, automobile 10/10, engineering 33/33. Second lap, Area 1: Engineering backend — no new bug. Added `test/engbill.more.test.js` (7 tests; fresh FakeDb per test). Noted low-priority payments[] log mismatch after a post-payment discount. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/31 (tests only) — open, awaiting review.
- **2026-09-27 14:37** — Merged PR #29 (radiator discount fix) after strict NO-BLOCKERS review; re-ran backend 19/19, tsc clean, e2e radiator 6/6, automobile 10/10, engineering 33/33. Area 6: Cross-cutting. **Real bug found:** dashboard Pending KPI (radiator live + automobile) = gross revenue − collected, ignoring discounts (fully paid ₹100-discount bill showed ₹100 pending). Fixed in both analytics DAOs (sum capped discount, pending = revenue − discount − collected ≥ 0; no other KPI changed). Added `test/analytics.pending.test.js`; 4 fail before, 24/24 backend after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/30 — open, awaiting review. Rotation complete; next lap starts at area 1.
- **2026-09-27 06:38** — Merged PR #28 (salary advance carry-forward) after NO-BLOCKERS review; re-ran backend 19/19, tsc clean. Area 5: Radiator (LIVE). **Real bug confirmed:** Record Payment wipes an existing discount when a later payment has no discount and replaces instead of adds a further discount (same as automobile #27), also skewing bonuses. Fixed in `Pages/IssueCounter/Billing/Index.tsx` (always send existing + entered); backend untouched. Added `e2e/radiator.e2e.mjs` (6 checks); both discount checks fail before, pass after; other suites green. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/29 — open, awaiting review. Production data may already be affected.
- **2026-09-26 22:37** — Merged PR #27 (automobile discount fix + 10 e2e checks) after NO-BLOCKERS review; re-ran backend 15/15, tsc clean, e2e automobile 10/10 + engineering 33/33. Area 4: Salary. **Real bug found:** settling a period with advances larger than gross marked all advances applied while net clamped at 0, silently writing off the excess (₹5,000 advance vs ₹3,000 gross lost ₹2,000). Fixed in `dao/salary.dao.js` (cap at gross, carry remainder forward as a new unapplied advance). Added `test/salary.dao.test.js`; fails before (`expected 3000, actual 5000`), 19/19 backend after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/28 — open, awaiting review.
- **2026-09-26 14:37** — Merged PR #26 (engineering payment-discount fix + 33 e2e checks) after NO-BLOCKERS review; re-ran backend 15/15, tsc clean, e2e 33/33. Area 3: Automobile. **Real bug found:** Record Payment wipes an existing discount when a later payment has no discount (route coerces missing → 0), and replaces instead of adds a further discount. Fixed in `Pages/Automobile/Billing/Index.tsx` (always send existing + entered). Added `e2e/automobile.e2e.mjs` (10 checks); both discount checks fail before the fix and pass after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/27 — open, awaiting review. Noted likely same issue in radiator (live) + analytics pending ignoring discounts, for area 5.
- **2026-09-26 06:37** — Merged PR #25 (15 backend tests) into staging after NO-BLOCKERS review; re-ran 15/15 green. Area 2: Engineering Works (frontend). **Real bug found:** Record Payment dialog sent the entered discount as the bill's total discount, dropping any discount set on the service form (₹50 existing + ₹100 entered stored as ₹100). Fixed in `Pages/Engineering/Billing/Index.tsx` (send existing + entered). Added `e2e/engineering.e2e.mjs` (33 checks); the new payment test fails before the fix (`discount: 100`) and passes after. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/26 — open, awaiting review.
- **2026-09-26** — Area 1: Engineering Works (backend). Reviewed `engbill.dao.js`, `engbill.routes.js`, `backfillSettingsShape.js` for money math, tenant isolation, validation, and crash bugs. No real bug found (money math, payment accumulation, tenant isolation, validation/crash paths, per-tenant bill numbering, and settings backfill all verified correct via mocked-DB tests). Added 15 new backend tests to lock in current behavior. PR: https://github.com/vijaykrishnaas/radiators-tracker/pull/25 (branch `claude/staging-qa-fix-1`) — open, pending review per the QA charter's review-then-merge process.

- 2026-09-29 18:37 UTC — Merged #35 (radiator DAO tests; backend 42/42, tsc clean). Area 6 (lap 2): offboard/export cascades cover all 12 tenant collections incl. engbills + counters; audit and settings routes scoped to req.user.clientId. No new bugs.

- 2026-09-29 22:37 UTC — No open QA PR. Area 1 (lap 3, Eng backend): backend 42/42 green. Reviewed list/filter/export, vehicle lookup, analytics facets (month bucketing consistent with other verticals), totals clamping. No bugs; existing tests already cover these paths, so no PR.

- 2026-09-30 02:37 UTC — No open QA PR. Area 2 (lap 3, Eng frontend): tsc clean; engineering e2e green incl. radiator regression checks. No bugs, no PR.

- 2026-09-30 06:37 UTC — No open QA PR. Area 3 (lap 3, Automobile): backend 42/42. Read update/payment/delete/query paths: received capped at net, bonuses re-synced, tenant-scoped, negative amounts rejected at route. Payment route still replaces (not adds to) discount — frontend compensates since #27; stays on the "server-side additive discount" follow-up. No new bugs, no PR.

- 2026-09-30 10:37 UTC — No open QA PR. Area 4 (lap 3, Salary): backend 42/42. Read settle (409 on duplicate period, advances applied + carry-forward insert), adjustments (append-only), payroll total, advances. Notes (not bugs): payroll total excludes adjustments by design; recordAdvance doesn't verify the employee belongs to the tenant (record is still stored under the caller's clientId, so no cross-tenant read/write). No PR.

- 2026-09-30 14:37 UTC — No open QA PR. Area 5 (lap 3, Radiator live): backend 42/42 (incl. radiator DAO tests from #35), radiator e2e 6/6. Payment route validation mirrors automobile (negatives rejected; discount replaced — client sends cumulative since #29). No new bugs, no PR.

- 2026-09-30 18:38 UTC — No open QA PR. Area 6 (lap 3, cross-cutting): backend 42/42. Auth: JWT verified per request; loadActiveTenant re-checks client existence/suspension every request; settings GET/PUT scoped to req.user.clientId and audited. No new bugs, no PR. Third lap complete with zero new findings — suggest reducing cadence (user decision).

- 2026-09-30 22:37 UTC — No open QA PR. staging unchanged since 4b0fedf (#35). Area 1 (lap 4, Eng backend): backend 42/42; re-read update/payment paths — only the already-logged payments[] mismatch after post-payment discount. No new bugs, no PR.

- 2026-10-01 02:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 2 (lap 4, Eng frontend): tsc clean; engineering e2e 39/39 PASS, 0 FAIL. No bugs, no PR.

- 2026-10-01 06:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 3 (lap 4, Automobile): backend 42/42; automobile e2e 10/10 PASS. No bugs, no PR.

- 2026-10-01 10:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 4 (lap 4, Salary): backend 42/42; salary e2e 6/6 PASS. No bugs, no PR.

- 2026-10-01 14:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 5 (lap 4, Radiator live): backend 42/42; radiator e2e 6/6 PASS. No bugs, no PR.

- 2026-10-01 18:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 6 (lap 4, cross-cutting): backend 42/42; auth/tenant/settings code unchanged since lap 3 review. No bugs, no PR. Lap 4 complete, zero findings.

- 2026-10-01 22:38 UTC — No open QA PR. staging unchanged (4b0fedf). Area 1 (lap 5, Eng backend): backend 42/42. No bugs, no PR.

- 2026-10-02 02:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 2 (lap 5, Eng frontend): tsc clean (e2e last green 2026-10-01 on same SHA). No bugs, no PR.

- 2026-10-02 06:37 UTC — No open QA PR. staging unchanged (4b0fedf). Area 3 (lap 5, Automobile): backend 42/42. No bugs, no PR.

- 2026-10-02 — Engineering UI redesign merged to staging by the user's request (not a QA run): #36 catalog (master/detail, phone cards), #37 bill PDF rebuilt to the invoice mockup (standalone PrintEngInvoice.ts + Utils/amountInWords.ts), #38 billing cards on phones + sticky totals bar. Each had an independent NO-BLOCKERS review; engineering e2e 50/50, radiator 6/6, automobile 10/10, salary 6/6, tsc clean. All CSS is `eng-*` scoped (Pages/Engineering/engineering.css). Radiator/automobile untouched.

- 2026-10-02 10:37 UTC — No open QA PR (open #39 is a UI-refine PR, not QA scope). staging now 0c302e6 (UI redesign #36-#38 merged). Area 4 (lap 5, Salary): backend 42/42, tsc clean, salary e2e 6/6. Salary code unchanged since lap 4. No bugs, no PR.

- 2026-10-02 14:38 UTC — No open QA PR (#41 is a UI-refine PR, not QA scope). staging 3e6b46a (UI redesign #36-#40; Engineering-only changes, radiator/automobile/salary/backend files untouched). Area 5 (lap 5, Radiator live): backend 42/42, tsc clean, radiator e2e 6/6. Radiator code unchanged. No bugs, no PR.

- 2026-10-02 18:38 UTC — No open QA PR (#43 is a UI-refine PR, not QA scope). staging eadbadd (UI #36-#42; Engineering-only). Area 6 (lap 5, cross-cutting): backend 42/42, no backend file changed since lap 4, tsc clean, engineering e2e 60/60. Auth/tenant/settings code unchanged. No bugs, no PR. Lap 5 complete, zero findings.

- 2026-10-02 22:38 UTC — No open QA PR (#45 is a UI-refine PR, not QA scope). staging 9d0c355 (UI #36-#44; Engineering frontend only, no backend file changed). Area 1 (lap 6, Eng backend): backend 42/42, tsc clean, engineering e2e 62/62. Engineering DAO/routes unchanged since lap 5. No bugs, no PR.

- 2026-10-03 02:37 UTC — No open QA PR (#47 is a UI-refine PR, not QA scope). staging 4aa1d1c (UI #36-#46; Engineering frontend only). Area 2 (lap 6, Eng frontend): backend 42/42, tsc clean, engineering e2e 68/68 (incl. new empty/loading/filtered-empty checks). Engineering screens reviewed by the UI routine's independent reviewer each merge. No bugs, no PR.
