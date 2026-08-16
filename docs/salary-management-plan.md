# Salary Management Module — Plan & Progress

> **For automated sessions**: This is the single source of truth for the cross-session build.
> On every run: read this file, check the open phase PR, address reviewer comments/CI first,
> then continue the next unchecked item. Update the checklist below and push it with your work.
> Phase branches: `claude/salary-management-phase-1|2|3`, each merged into `master` via PR
> before the next phase starts. Keep radiator, automobile, and bonus functionality byte-identical.

## Progress checklist

### Phase 1 — Backend core (branch `claude/salary-management-phase-1`, PR: _not opened yet_)
- [ ] `config/defaultSettings.js`: add `salary` block (payCycle, workingDayRule, weeklyOffDay, payslip.title/footerNote)
- [ ] `dao/employee.dao.js` (new): `listEmployees`, `getEmployee`, `createEmployee`, `updateEmployee`, `deactivateEmployee` (soft delete; hard delete only if zero history references)
- [ ] `dao/attendance.dao.js` (new): `markAttendance` (upsert, rejects marks inside a settled period), `getAttendanceForPeriod`, `computePresentDays` (present=1, half=0.5, absent/leave=0)
- [ ] `advances` collection: insert/list helpers (own small module or inside `salary.dao.js` — builder's call, document the choice)
- [ ] `dao/salary.dao.js` (new): `getWorkingDays`, `previewSettlement`, `settlePeriod` (sweeps unapplied advances, computes net, locks), `addAdjustment` (appends to `adjustments[]`, never mutates original net/gross), `getSettlementHistory`, `getPayslipData`, `getPayrollTotal(clientId, {from,to})`
- [ ] `routes/employee.routes.js` (new): `GET/POST /`, `GET/PUT/DELETE /:id`, `authenticate, loadActiveTenant`, `auditClient()` on writes
- [ ] `routes/salary.routes.js` (new): `GET/POST /attendance`, `GET/POST /advances`, `GET /preview`, `POST /settle`, `POST /:id/adjust`, `GET /history`, `GET /:id/payslip`
- [ ] Mount both route files in `index.js`
- [ ] `config/ensureIndexes.js`: `{clientId:1}` on `employees`/`attendance`/`advances`/`salaryPeriods`; unique `{clientId,employeeId,date}` on `attendance`; unique `{clientId,employeeId,periodKey}` on `salaryPeriods`
- [ ] `dao/client.dao.js`: `exportClientData()` + `offboardClient()` extended for all four new collections
- [ ] `dao/expense.dao.js`: `getExpenseAnalytics()` gains additive `payrollTotal` field via `salary.dao.js`'s `getPayrollTotal()`
- [ ] New `migrations/backfillSettingsShape.js`: idempotent `backfillSettingsShape({dryRun})` — sets `clients.businessType` where missing, `$set`-if-missing any top-level `defaultSettings.js` key (businessType/automobile/salary/future) into existing `settings` docs
- [ ] `index.js` boot sequence: `await backfillSettingsShape();` after `ensureIndexes()`/`seedSuperAdmin()`, wrapped in the existing try/catch
- [ ] `package.json` script `"migrate:backfill"` + `scripts/backfill-settings.js` CLI wrapper (dotenv/connectDB bootstrap, `--dry-run` support, same shape as `scripts/migrate-to-multitenant.js`)
- [ ] Open PR 1 to `master`, verify no radiator/automobile/bonus behavior change (diff review)

### Phase 2 — Frontend screens, payslip, Settings tab (branch `claude/salary-management-phase-2`, PR: _not opened yet_)
- [ ] `Context/SettingsContext.tsx`: `AppSettings`/`FALLBACK_SETTINGS` gain `salary` block (lockstep with backend defaults)
- [ ] `Pages/Salary/Employees/Index.tsx`: CRUD list + modal form (name, role, phone, joinDate, baseSalary, payCycle, bankDetails, active toggle) — template: `Pages/IssueCounter/Expenses/Index.tsx`'s flat list+modal pattern
- [ ] `Pages/Salary/SettlePeriod/Index.tsx`: employee selector + period picker; attendance sub-section (daily present/absent/half/leave marks OR manual present-days override that wins when set); advances sub-section (unapplied list + inline record form); deduction rows (amount+reason, repeatable); live preview via `GET /salary/preview`; "Settle & Pay" → `POST /salary/settle`; settlement history + "View Payslip" + "Add Adjustment" (paid rows only) — template: `Pages/Bonus/MechanicReview.tsx`
- [ ] `Components/PrintPayslip.ts` (new standalone file, NOT touching `PrintInvoice.ts`'s existing exports): `printPayslip(payslipData, settings)`
- [ ] `Pages/Settings/Index.tsx`: new unconditional "Salary" tab (pay-cycle default, working-day-rule select + weekly-off-day picker, payslip title/footer text) added to the existing tabs array — not gated by business type
- [ ] `npx tsc --noEmit` clean
- [ ] Manual QA against Phase 1 API via direct URL navigation (no nav wiring yet)
- [ ] Open PR 2

### Phase 3 — Nav/routing + expense-analytics integration + regression (branch `claude/salary-management-phase-3`, PR: _not opened yet_)
- [ ] `App.tsx`: lazy routes `/salary/employees`, `/salary/settle`, plain `ProtectedRoute` (no `BusinessRoute` — applies to both verticals identically)
- [ ] `Constants/HeaderData.ts`: new `export const Salary: DropdownItem[]` next to `Bonus`
- [ ] `Common/Header.tsx`: new `<AppDropdown name="Salary" data={Salary} />` line next to the existing Bonus dropdown — purely additive
- [ ] Frontend expense-analytics view gets an additive display of the new `payrollTotal` field
- [ ] `npx tsc --noEmit` clean
- [ ] Open PR 3
- [ ] Full regression pass (see verification checklist below) and disable the build/review Routines

## Approved plan

### Context
The app has billing, expenses, and a per-bill bonus system for mechanics/labour, but no way to pay them a base salary. Workers today are plain name-strings in `settings.mechanics`/`settings.labour`, referenced by bills — no employee record, no attendance, no payroll. This adds a fully separate Salary Management module: real employee records, attendance-based monthly salary with a manual-override option, one-time advances, ad-hoc deductions, locked settlements with an audit-safe adjustment path, a printable payslip, a read-only payroll figure surfaced in expense analytics, and a Settings tab for tenant-wide defaults — all without touching radiator/automobile billing, bonus, or `settings.mechanics`/`settings.labour`. Builds on `master` (commit `3e3e00a`, post automobile-billing merge).

User-confirmed decisions:
- **New `employees` collection** with persistent identity; `employee.name` matches the existing `settings.mechanics`/`settings.labour` strings so bonus/bill lookups are completely unaffected — salary is a parallel HR record, not a replacement.
- **Fixed monthly base salary**, prorated by attendance: `net = baseSalary × presentDays/workingDaysInPeriod`, then advances and deductions subtracted.
- **Attendance — both modes**, per employee per period: daily present/absent/half/leave marking (one employee at a time; bulk-grid-for-all-employees explicitly deferred), OR a manual "days present" number that wins over daily marks if set. Working days = all calendar days in the period (no weekly-off concept in the calculation itself — that's a Settings display concern, see below).
- **Advances**: one-time — recorded mid-period, fully swept into the employee's *next* unpaid settlement (not date-scoped, no installment ledger).
- **Deductions**: entered at settlement time, amount + free-text reason only.
- **Settlement locks on payment** — mirrors the bonus pattern (paid entries never mutated); corrections go through a new adjustment entry, preserving audit history.
- **PDF payslip** per settled period, new standalone component.
- **New "Salary" nav dropdown** (Employees + Settle-period screens). No payroll analytics dashboard for v1.
- **Tenant-configurable in Settings**: default pay cycle, a working-day rule (all calendar days, or exclude a configurable weekly-off day), and payslip title/footer text — new unconditional "Salary" Settings tab.
- **Automatic prod migration**: an idempotent backfill runs automatically on every backend boot — explicitly sets `businessType:"radiator"` on any client/settings doc missing it, and `$set`-if-missing any top-level `defaultSettings.js` key (covering `salary`, and retroactively `automobile`/`businessType`) into every existing settings doc. Also exposed as a standalone `npm run migrate:backfill` script for manual/dry-run use.
- **Expense analytics gains a read-only `payrollTotal`** — `expenses` collection itself stays untouched as the source of truth for expenses only.
- Applies identically to radiator and automobile tenants — no `businessType` gating anywhere in this feature.
- Radiator/automobile billing, the existing bonus system, and `settings.mechanics`/`settings.labour` must remain byte-identical.

### Data model
```js
// employees
{ _id, clientId, name, role: "mechanic"|"labour"|"other", phone, joinDate, active,
  baseSalary, payCycle: "monthly", bankDetails: {accountName,accountNumber,ifsc,bankName}|null,
  notes, createdAt, updatedAt }

// attendance — one doc per employee per day
{ _id, clientId, employeeId, date, status: "present"|"absent"|"half"|"leave", markedAt, markedBy }

// advances
{ _id, clientId, employeeId, date, amount, reason, status: "unapplied"|"applied",
  appliedToPeriodId, appliedAt, createdAt }

// salaryPeriods — the settlement record, mirrors `bonuses`
{ _id, clientId, employeeId, employeeName (snapshot),
  periodStart, periodEnd, periodKey ("YYYY-MM"), workingDays,
  presentDaysMode: "daily"|"manual", presentDaysManual, presentDaysComputed, presentDaysUsed (frozen),
  baseSalary (snapshot), grossAmount,
  advancesApplied: [{advanceId,amount,date,reason}], advancesDeducted,
  deductions: [{amount,reason}], deductionsTotal, netAmount,
  status: "pending"|"paid", paidAt, paidNote,
  adjustments: [{at,type,amount,reason,by}], createdAt, updatedAt }
```
Unique indexes: `attendance {clientId,employeeId,date}`; `salaryPeriods {clientId,employeeId,periodKey}` (re-settling the same period is rejected — corrections use the adjustment endpoint). v1 has no "pending draft" salary state: settling is one atomic compute+confirm+pay action.

Settings addition (`config/defaultSettings.js`, additive top-level key): `salary: { payCycle: "monthly", workingDayRule: "allDays"|"excludeWeeklyOff", weeklyOffDay: 0, payslip: { title: "SALARY SLIP", footerNote: "" } }`.

### Key implementation notes
- `dao/bonus.dao.js` is the template for settlement mechanics: period-keyed docs, paid-lock (never touch a paid doc's core fields again), proportional-override payout with rounding-drift correction, `aggregateByBeneficiary`-style per-beneficiary `$group`/`$facet` history. `dao/expense.dao.js` is the template for a plain CRUD+analytics module (see its `getExpenseAnalytics()` around line 79, which the new `payrollTotal` field extends additively).
- `attendance` is a separate collection from `salaryPeriods` (not embedded) so daily marks can be queried/edited independently before any period doc exists — settlement is what freezes `presentDaysUsed` from either the computed daily total or the manual override.
- Advances are swept by employee, not by date range — `settlePeriod()` must query `advances` for `status:"unapplied"` regardless of the advance's own date, per the user's explicit "next unpaid settlement" requirement.
- `addAdjustment()` must NEVER mutate a paid `salaryPeriods` doc's `netAmount`/`grossAmount`/etc. — only append to `adjustments[]` (mirrors how bonus's paid entries are immutable). Decide and document how a corrected total is surfaced to the UI (e.g. a computed `adjustedNetAmount` view, not a stored overwrite).
- The backfill migration (`backfillSettingsShape()`) must only ever `$set` a field that is provably absent (`$exists:false` in the query filter) — never overwrite a tenant's own configured value. Loop over the known top-level `defaultSettings.js` keys so it needs no changes for future additive settings blocks.
- `Pages/Bonus/MechanicReview.tsx` is the frontend template for the settle-period screen shape (selector + date range + fetch + editable settle form + notes + POST + success/reset), extended with attendance/advance/deduction sub-widgets bonus doesn't need.
- `Components/PrintPayslip.ts` must be a NEW file — never edit `printInvoice`/`printAutoInvoice` in `PrintInvoice.ts`.
- No `BusinessRoute` gating anywhere in this feature — salary applies identically regardless of tenant `businessType`.
- Settings tab is unconditional (not `isAutomobile`-gated like the automobile tabs) — every tenant sees it.

### Verification (end of Phase 3)
- Employee whose name matches an existing `settings.mechanics` entry: mechanic bonus screens still resolve it correctly.
- Daily attendance marks for one employee/period; manual override for another — confirm the override (not daily marks) drives computed present days when set.
- Advance recorded mid-period shows `unapplied` and isn't reflected in salary math until settlement.
- `GET /salary/preview` gross matches `baseSalary × presentDaysUsed/workingDays` by hand; settle with one deduction → `netAmount = grossAmount − advancesDeducted − deductionsTotal`; advance flips to `applied`.
- Re-settling the same employee+period rejected; attendance edit inside a settled period rejected.
- `POST /salary/:id/adjust` appends to `adjustments[]` without changing the original net/gross.
- Payslip PDF renders all required fields.
- Expense analytics includes `payrollTotal`; nothing written into `expenses` collection.
- `exportClientData()`/`offboardClient()` cover all four new collections.
- Boot against pre-existing client/settings docs: `businessType`/`automobile`/`salary` backfilled where missing; re-boot is a no-op; `npm run migrate:backfill -- --dry-run` matches the real run.
- New Settings "Salary" tab: change and persist pay-cycle/working-day-rule/payslip text.
- Full regression: radiator + automobile bill create/edit, bonus sync/settle, Settings mechanics/labour tag editors all byte-identical.
