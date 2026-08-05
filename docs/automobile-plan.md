# Automobile Business Billing Module — Plan & Progress

> **For automated sessions**: This is the single source of truth for the cross-session build.
> On every run: read this file, check the open phase PR, address reviewer comments/CI first,
> then continue the next unchecked item. Update the checklist below and push it with your work.
> Phase branches: `claude/automobile-billing-phase-1|2|3`, each merged into `master` via PR
> before the next phase starts. Keep radiator functionality byte-identical.

## Progress checklist

### Phase 1 — Backend foundation (branch `claude/automobile-billing-phase-1`, PR: _not opened yet_)
- [ ] `config/defaultSettings.js`: add `businessType: "radiator"` + `automobile` block (units, parts, flat bonus %, labels, invoice)
- [ ] `dao/settings.dao.js`: `seedSettingsForClient(clientId, companyName, businessType)`; strip `businessType` from client `updateSettings`
- [ ] `dao/client.dao.js`: `createClient` stores validated `businessType` (default radiator); `listClients` projection; `exportClientData` + `offboardClient` include `autobills`
- [ ] `routes/admin.routes.js`: `provisionClient` accepts/validates `businessType`, passes to client + settings seed, includes in audit + response
- [ ] `config/ensureIndexes.js`: `autobills` indexes `{clientId:1}`, `{clientId:1, billDate:-1}`
- [ ] `dao/autobill.dao.js` (new): enrich/totals (sum of `items[].amount`), auto-increment `billNo` via `counters` (`findOneAndUpdate` `$inc` upsert on `{_id: clientId}` field `autobill`), create/update/delete/recordPayment (radiator semantics), buildQuery (vehicleNumber/customerName regex, mechName, dates, status), paged list, export, getById, mechanics list (settings ∪ autobills), analytics `$facet` (kpis/byMonth/byStatus only)
- [ ] `dao/bonus.dao.js` (additive only): `computeFlatRoleBonus`, `syncAutoBonusesForRecord` (same doc shape as `syncBonusesForRecord`, percents from `settings.automobile.bonus`), `getAutoReviewData`, `backfillAuto`
- [ ] `routes/autobill.routes.js` (new) + mount `/autobills` in `index.js`; guard: only automobile-type tenants may use it; audit actions `autobill.*`
- [ ] `routes/bonus.routes.js`: `/review` and `/sync` branch by tenant businessType (radiator path unchanged)
- [ ] Open PR 1 to `master`, verify no radiator-file behavior change (diff review)

### Phase 2 — Billing screens (branch `claude/automobile-billing-phase-2`, PR: _not opened yet_)
- [ ] `Context/SettingsContext.tsx`: `AppSettings` + `FALLBACK_SETTINGS` gain `businessType` + `automobile` block (lockstep with backend defaults)
- [ ] Admin console `Pages/Admin/Clients/Index.tsx`: Business Type select in create form, Excel-import mapping, type badge in list
- [ ] `Pages/Automobile/Dashboard/Components/CreateAutoBill.tsx`: bill form — billDate, billNo (readonly, server-assigned), vehicleNumber, optional customerName/phoneNumber, mechanic selector, labour tags; item rows: particulars datalist over `settings.automobile.parts` (auto-fills unit+rate) or free text, numeric qty + unit select, rate, amount = qty×rate with per-row manual-override (touched) flag; running total; create/view/edit modes
- [ ] `Pages/Automobile/Billing/Index.tsx`: list, filters (vehicle/mechanic/date/status), pagination, payment+discount modal, Excel export — pointed at `/autobills`
- [ ] `Components/PrintInvoice.ts`: additive `printAutoInvoice(bill, settings)` — radiator invoice style with S.No | Particulars | Qty | Unit | Rate | Amount, driven by `settings.automobile.invoice`
- [ ] Open PR 2

### Phase 3 — Dashboard, gating & settings (branch `claude/automobile-billing-phase-3`, PR: _not opened yet_)
- [ ] `Pages/Automobile/Dashboard/Index.tsx`: KPIs, monthly trend, status breakdown from `GET /autobills/analytics`
- [ ] `App.tsx`: lazy routes `/automobile/dashboard`, `/automobile/dashboard/create|view/:id|edit/:id`, `/automobile/billing`; `BusinessRoute` wrapper redirecting each tenant type off the other's screens (Loader while settings load)
- [ ] `Common/Header.tsx`: automobile tenants' Dashboard/Bills links point to `/automobile/...`; radiator branch renders existing JSX
- [ ] `Pages/Settings/Index.tsx`: automobile tenants get Parts Catalog / Units / flat Bonus % / automobile Labels & Invoice tabs; radiator tab list untouched
- [ ] Open PR 3
- [ ] Final end-to-end verification (see plan §6) and disable the build Routines

## Approved plan

### Context
The app serves radiator workshops (multi-tenant; bills in `radiators` with `serviceInfo[{type,price,comments}]`, price-matrix pricing, payments, expenses, mechanic/labour bonuses, analytics, jsPDF invoices). We are adding support for automobile spare-parts/service businesses whose paper bills have free-form part particulars with Qty × Rate = Amount columns, units (pcs/set/L), a vehicle registration number as customer, and a memo number — while keeping radiator tenants byte-identical.

User-confirmed decisions:
- Business type per tenant, chosen by super-admin at provisioning, **fixed after creation**; default `radiator` for all existing clients (missing field ⇒ radiator).
- Line items: particulars + numeric qty + unit (configurable list) + rate + amount (auto qty×rate, editable).
- Parts catalog in Settings (label/value/unit/rate); picking a part auto-fills; free-text one-off items allowed.
- Customer: vehicle number primary; name/phone optional. Payment semantics identical to radiator (received/partial/pending, discount). No carry-forward balance.
- One bill holds unlimited items; `billNo` auto-increments per tenant.
- Bonuses: flat % of net (post-discount) total — separate mechanic % and labour % in settings; reuse the `bonuses` collection so all existing bonus/settlement screens work unchanged.
- Invoice PDF: same style as radiator, plus Qty/Unit/Rate columns. Dashboard: same KPI set (bills/revenue/collected/pending, monthly trend, status breakdown).

### Data model
`autobills` doc:
```js
{
  _id, clientId, billDate, billNo,           // billNo auto-increment per tenant
  vehicleNumber, customerName, phoneNumber,  // name/phone optional
  mechanicName, labourName: [String],
  items: [{ particulars, partRef, qty, unit, rate, amount }], // amount is totals source of truth
  notes, discount: 0, receivedAmount: 0, status: "Not Received", createdAt,
}
```
`enrich()` mirrors `dao/radiator.dao.js` with `totalAmount = sum(items[].amount)`; same STATUS values.

Settings additions (additive; see Phase 1 checklist): `businessType`, `automobile.{units, parts, bonus{mechanicPercent,labourPercent,yearStartMonth}, labels, invoice}`.

### Key implementation notes
- `dao/radiator.dao.js` is the template for `dao/autobill.dao.js`; `routes/radiator.routes.js` for `routes/autobill.routes.js`.
- Bonus docs written by `syncAutoBonusesForRecord` must be shape-identical to `syncBonusesForRecord` output (type/period/beneficiary/accruedAmount/payableAmount/billAmount/receivedAmount, paid-lock, labour equal split, `$nin` cleanup) — that is what makes existing bonus screens work unchanged. `payable = accrued × min(received/net, 1)`.
- `loadActiveTenant` (`middleware/auth.js`) currently only checks status; the autobill route guard and bonus-route branching need the client's `businessType` (fetch via `getClientById` or extend `getClientStatus` projection — do NOT change its radiator-path behavior).
- Frontend learns businessType from `GET /settings` (SettingsContext shallow-merges `FALLBACK_SETTINGS`); JWT untouched.
- Shared files may only change additively or behind `businessType === "automobile"` conditionals whose default branch is the existing code.
- `Pages/IssueCounter/Billing/Index.tsx`, `CreateRadiators.tsx`, `Dashboard/Index.tsx` are the frontend templates — copy, don't modify.

### Verification (end of Phase 3)
- Radiator regression: existing tenant flows (nav, bill CRUD/payment, bonuses, settings, invoice PDF) identical.
- Provisioning: automobile + radiator clients; omitted businessType defaults to radiator (import path too).
- Automobile flow: parts in Settings → bill create with auto-fill/auto-compute/manual override → filters → partial payment + discount → status/pending → invoice PDF → Excel export.
- Bonuses: flat % of net, labour split, payable follows received, paid-lock on edit, delete removes pending; settle via existing pages.
- Gating/isolation: cross-type route redirects; `/autobills` rejected for radiator tenants; tenant isolation; offboard cleans `autobills`.
