# Engineering Works — build tracker (source of truth for the Routines)

Long-lived branch: `claude/engineering-works-expansion` (this file). Phase branches `claude/engineering-works-phase-1|2|3` are cut from latest `staging` and PR'd **into `staging`** (never `master`). Nothing deploys to prod without the user's explicit confirmation.

## Progress checklist

### Phase 1 — Backend (branch `claude/engineering-works-phase-1`, PR: **#22, merged into staging (95a5aac)**)
- [x] `config/defaultSettings.js`: new top-level `engineering` block (starter catalog, blank/0 prices, quickAdd, billStartNumber, invoice)
- [x] `migrations/backfillSettingsShape.js`: add `"engineering"` to `BACKFILLABLE_SETTINGS_KEYS` (additive only)
- [x] `dao/engbill.dao.js` (new): list/filter/paginate, get, create (per-tenant counter honoring billStartNumber), update, delete, recordPayment, lookupVehicle, analytics (billed/received/outstanding, by month, by service type, by mechanic), export query; server-side math
- [x] `routes/engbill.routes.js` (new) at `/engbills`: authenticate + loadActiveTenant + engineering-only guard; auditClient on writes
- [x] `index.js` mount; `ensureIndexes.js` engbills indexes; `client.dao.js` BUSINESS_TYPES + export/offboard cascade; `admin.routes.js` accepts `engineering`
- [x] `node --check` clean + regression-guard diff clean; open PR → `staging`
- [x] Reviewer NO-BLOCKERS → builder merges into `staging`

### Phase 2 — Frontend screens (branch `claude/engineering-works-phase-2`, PR: **#23, open → staging**)
- [x] `Context/SettingsContext.tsx`: `engineering` type + fallback
- [x] `Pages/Engineering/Dashboard/Create.tsx`: service form exactly per mockups
- [x] `Pages/Engineering/Dashboard/Index.tsx`: KPIs + charts (month / service type / mechanic), FY default range
- [x] `Pages/Engineering/Billing/Index.tsx`: one row per bill, filters, record payment, print, edit, delete, Excel export
- [x] `Components/PrintEngInvoice.ts` (new, existing invoice layout style)
- [x] `Pages/Settings/Index.tsx`: engineering-only Service catalog tab (type dropdown → table) + gating of tabs; radiator/automobile branches unchanged
- [x] `npx tsc --noEmit` clean + regression-guard diff clean; open PR → `staging`
- [x] Reviewer NO-BLOCKERS → builder merges into `staging`

### Phase 3 — Nav/routing/gating + regression (branch `claude/engineering-works-phase-3`, PR: —)
- [ ] `App.tsx`: BusinessRoute union + `/engineering/*` routes; login redirect for engineering tenants
- [ ] `Common/Header.tsx`: `isEngineering` → Dashboard, Billing, Settings, Audit only
- [ ] `Pages/Admin/Clients`: "Engineering" business type option
- [ ] Full static verification + regression guard; open PR → `staging`
- [x] Reviewer NO-BLOCKERS → builder merges into `staging`
- [ ] Final: document verification honestly below, disable both "Engineering works" Routines, push-notify user

## Hard rules (blocking)
- **Protected, must be byte-identical vs `staging` base:** `dao/radiator.dao.js`, `dao/autobill.dao.js`, `dao/bonus.dao.js`, `dao/salary.dao.js`, `dao/employee.dao.js`, `dao/attendance.dao.js`, `dao/expense.dao.js`, their routes, `Components/PrintInvoice.ts`, `Components/PrintPayslip.ts`, everything under `Pages/IssueCounter`, `Pages/Automobile`, `Pages/Bonus`, `Pages/Salary`.
- **Allowed shared-file edits are additive only** (no removed/modified lines) and every new behavior is behind `businessType === "engineering"`: defaultSettings.js, backfillSettingsShape.js, ensureIndexes.js, client.dao.js, index.js, admin.routes.js, App.tsx, Header.tsx, Settings/Index.tsx, SettingsContext.tsx, Admin/Clients.
- Regression guard each PR: `git diff origin/staging --stat -- <protected paths>` empty; `git diff origin/staging -- <allowed shared files> | grep '^-[^-]'` empty (or each removed line justified as an unavoidable pure-refactor-free extension, which is blocking unless trivially additive like widening a TS union); `node --check` / `npx tsc --noEmit` clean.

## Verification outcome
_(filled in by the builder after Phase 3 merges — static only unless a live DB was actually used; say so honestly)_

---

## Approved plan
# Engineering Works (Turbo & Air Compressor Service): 3rd business vertical

## Context
Workshops that repair turbos and air compressors write bills on paper today. The user shared handwritten item lists (Turbo: Holset/Tel, O-ring kit change, lathe work, shaft polish, rings alter, packing set, labour bill; Air Compressor BS3/BS4/BS6: kit, labour, piston, rings, lathe work, block bush change, sleeve fixing), a paper bill, and UI mockups of the entry form. We add a generic **3rd `businessType: "engineering"`**, provisioned by the super-admin the same way `automobile` is. Each tenant fills in its own company details and catalog. Radiator and automobile tenants stay byte-identical.

Engineering tenants see only **Dashboard (KPIs + charts), Billing (bills list + payments), and Settings**. They get no Bonus, Salary, Labour, or Expenses menus.

Branching: create `claude/engineering-works-expansion` from `staging` (== master). Phase branches `claude/engineering-works-phase-1|2|3` open their PRs into **`staging`**, never master. Nothing deploys to prod without the user's explicit confirmation.

## Confirmed decisions
- **Form header:** Create date, Truck number, Lorry address, Mechanic name (select from `settings.mechanics`), Phone number. No BS model in the header.
- **Service cards** ("Add New Service", repeatable). Each card has:
  - a **Service Type** select (Turbo / Air Compressor / Other, from the catalog);
  - a **BS Model** select, set per card;
  - a **Work/Service Items** multi-select with "Select all" and check-boxes, as in the mockup.
  
  Each chosen item becomes a row with **Qty × Rate = Amount**. The rate auto-fills from the catalog price for that card's BS model and can be edited. Rows have a × button. An "Other" item requires a "Describe the work" text. Each card shows a subtotal and a Remove button.
- **Quick-add chips** are the type+item pairs the tenant ticks in Settings. Clicking one adds a card, or adds the item to an existing card of that type.
- **Footer:** a total per service type (Turbo / Air compressor / Other), then Discount → Net total, Amount received, and payment mode (cash/UPI). Status (paid/partial/credit) is derived automatically, as in automobile. Buttons: Clear form, Save service.
- **Autofill:** typing a truck number that has been billed before suggests the lorry address and phone from its last bill.
- **Bills are editable and deletable any time.** Totals and status are recalculated, and every change is audit-logged.
- **Particulars on the printed bill = the catalog label.** Custom items only come through "Other" + its description, which is printed in place of the label.
- **PDF:** reuse the **existing radiator/automobile invoice layout** (`Components/PrintInvoice.ts` style, settings.company + invoice text, English). Build it as a new standalone export in a new file `Components/PrintEngInvoice.ts` so `printInvoice`/`printAutoInvoice` stay untouched. Columns: No, Particulars, Service type/BS, Qty, Rate, Amount. Then totals, discount, net, received, balance.

- **Bill number:** per-tenant plain number (1, 2, 3…). `engineering.billStartNumber` in Settings lets a tenant continue from its paper book (e.g. 802).
- **Validation:**
  - Truck number is required and auto-uppercased.
  - Mechanic is required.
  - At least one service card with at least one item is required.
  - Phone, lorry address, and per-card BS model are optional.
- **Qty** defaults to 1 on every new row.
- **Billing page:** one row per bill (Bill no, Date, Truck, Mechanic, type chips, Net, Received, Balance, Status, Actions), with filters and **Excel export**.
- **Dashboard:** defaults to the **current financial year** (Apr–Mar), with a range picker. It shows KPIs (billed/received/outstanding), revenue by month, revenue by service type, and **revenue by mechanic** (chart only, no bonus).
- **Client audit log** (`/audit`) stays visible for engineering tenants.
- **Sharing:** PDF download/print only, no WhatsApp.

- **Service catalog UI in Settings:**
  - A service-type dropdown at the top (Turbo / Air Compressor / Other / + Add type). Picking one shows that type's table: Item | one ₹ column per BS model | Needs description | Quick add | delete, with an "Add item" button.
  - The BS models list is editable (add/rename/remove). Adding a model adds a price column on every item.
  - A **blank price** for a model means "not offered for that model", so the item is hidden from the form's multi-select when a card has that BS model. A price of 0 is still offered.
- **Starter template, taken from the user's notes and mockups** (all prices blank or 0, and the tenant edits them):
  - Turbo (BS-3/4/6): Hold set, Tel, O-ring kit change, Lathe work, Shaft polish, O-rings / rings alteration, Packing set, Labour bill, Other.
  - Air Compressor BS-3/BS-4: Kit, Labour, Piston, Rings, Lathe work, Block bush change, Other.
  - Air Compressor BS-6: Kit, Piston, Lathe work, Rings, Labour, Sleeve fixing, Other. Block bush change is not offered for BS-6; Sleeve fixing is BS-6 only. The note "BS6 water/bold" becomes two starter items under BS-6, "Water type" and "Bold type", which the tenant can rename or delete.
  - Other: Other (needs description).
- **Build mode:** the builder + reviewer Routines (same loop as salary/automobile), using the tracking doc `docs/engineering-works-plan.md` on `claude/engineering-works-expansion`. Phase PRs target **`staging`**. The **builder auto-merges into staging once the reviewer's review has no blocking findings.** Never touch master or prod.

## Zero-impact guarantee for existing tenants (hard rule, blocking in every review)
- **Byte-identical, not touched at all:** every radiator, automobile, bonus, salary, and expense DAO/route, `PrintInvoice.ts`, `PrintPayslip.ts`, and the existing pages under `Pages/IssueCounter`, `Pages/Automobile`, `Pages/Bonus`, and `Pages/Salary`.
- **Shared files are only extended.** The allowed additive edits are listed below. Every new branch is behind `businessType === "engineering"`, so the radiator and automobile code paths execute exactly as before:
  - `defaultSettings.js`: a new key.
  - `backfillSettingsShape.js`: a new list entry. It only ever does `$exists:false` `$set`, so it never overwrites existing values.
  - `ensureIndexes.js`: new indexes.
  - `client.dao.js`: a list entry plus cascade lines.
  - `index.js`: a route mount.
  - `admin.routes.js`: an accepted type.
  - `App.tsx`: routes.
  - `Header.tsx`, `Settings/Index.tsx`, and `SettingsContext.tsx`: new `isEngineering` branches.
  - `Admin/Clients`: an option.
- **Each phase PR must include a regression-guard diff:**
  - `git diff staging --stat` limited to the protected files must be empty;
  - the allowed shared-file diffs must be additions only (no removed or modified lines);
  - `npx tsc --noEmit` and `node --check` must be clean.
- **Reviewer charter:** any behavior change for radiator or automobile tenants is blocking and stops the auto-merge.

## Routine setup (fixing last time's failures)
Last time, the first fired runs got **no repo, no plan file, and no GitHub tools**. The trigger had no `sources`, and its prompt pointed at a local `/root/.claude/plans/...` path that only exists in this container. It "completed with error" silently until you attached the repo by hand. This time the setup follows the steps below.

1. **Everything the Routine needs is on GitHub, not local.** Before creating any trigger, I push `docs/engineering-works-plan.md`, containing the full approved plan plus a live phase checklist, to `claude/engineering-works-expansion`. The prompts reference only that file and never a `/root/...` path.
2. **Repo attached in the trigger config itself.**
   - Set `sources: [{git_repository: vijaykrishnaas/radiators-tracker}]` and the same `environment_id` used for the working salary triggers.
   - Include the `Claude_Code_Remote` MCP connection, so the builder can disable the triggers at the end.
   - Before firing anything, I verify with `get_trigger` that `sources` is present.
3. **Self-contained prompts with a pre-flight check.**
   - Each tick first checks that the repo is cloned, the plan doc is readable, and the GitHub MCP tools respond.
   - If any check fails, it sends a push notification ("Engineering routine: environment missing X") and stops, instead of silently "completing".
   - Push notifications are on for both triggers.
4. **Two triggers:**
   - **Builder**, every 4h. Steps:
     1. Pre-flight check.
     2. Fix reviewer comments.
     3. If the latest review has no blocking findings and the regression guard is clean, **merge the phase PR into `staging`**.
     4. Otherwise, implement the next unchecked chunk.
     5. Update the checklist.
   - **Reviewer**, every 4h, offset by 2h. Steps:
     1. Pre-flight check.
     2. A fresh subagent reviews against the charter (zero-impact rule, tenant isolation, money math, plan conformance).
     3. It posts one review marked **BLOCKING** or **NO-BLOCKERS** (a COMMENT review, since approving your own PR is blocked).
     4. It never edits code.
5. **Verify before leaving it on cron.**
   - Immediately after creating the triggers, I `fire_trigger` the builder once and check its session (`get_session`/`list_sessions`) until it shows the plan doc was read and a branch or PR was actually pushed.
   - If it fails, I fix the config and re-fire. Only then do I report the setup as working.
6. **Stop condition.** After the Phase 3 merge into staging, the builder runs the static verification, writes the honest results into the plan doc, disables both triggers, and sends a push notification saying staging is ready for your review.

## After the Routine finishes
- All 3 phases land on `staging` only, and the Routines are then disabled.
- The user then runs **multiple manual review sessions on `staging`**, which is when fixes are requested. Master and prod stay untouched until the user explicitly promotes staging → master and confirms deployment.

## Data model
**Settings: new top-level `engineering` block** in `config/defaultSettings.js`. Add `"engineering"` to `BACKFILLABLE_SETTINGS_KEYS` in `migrations/backfillSettingsShape.js` (existing boot + `npm run migrate:backfill` path). The starter template ships with all prices at 0:
```js
engineering: {
  bsModels: [{label:"BS-3",value:"bs3"},{label:"BS-4",value:"bs4"},{label:"BS-6",value:"bs6"}],
  serviceTypes: [
    { label:"Turbo", value:"turbo", items:[ Hold set, Tel, O-ring kit change, Lathe work, Shaft polish,
        O-rings / rings alteration, Packing set, Labour bill, Other(requiresComment) ] },
    { label:"Air Compressor", value:"compressor", items:[ Kit, Labour, Piston, Rings, Lathe work,
        Block bush change, Sleeve fixing, Other(requiresComment) ] },
    { label:"Other", value:"other", items:[ Other(requiresComment) ] },
  ],   // each item: {label, value, prices:{bs3:0,bs4:0,bs6:0}, requiresComment?}
  quickAdd: [],   // [{type, item}] ticked in Settings
  billStartNumber: 1,
  invoice: { billTitle:"CASH / CREDIT BILL", footerNote:"Thank you for your business", showQr:false, showSignature:false },
}
```
**New collection `engbills`** (clientId-scoped):
`{clientId, billNo, billDate, vehicleNo, lorryAddress, mechanic, phone, services:[{type, bsModel, items:[{item, label, comment, qty, rate, amount}], subtotal}], typeTotals:{<type>:amt}, total, discount, netTotal, amountReceived, paymentMode, paymentStatus, payments:[{date,amount,mode}], createdAt, updatedAt}`.
All math is recomputed server-side (amount = qty×rate, subtotal, typeTotals, net = total − discount, received capped at net).

## Backend (new files mirror `dao/autobill.dao.js` / `routes/autobill.routes.js`)
- `dao/engbill.dao.js` provides:
  - list with filters (date, vehicle, mechanic, type, BS model, status) and pagination;
  - get, create (bill number from the shared `counters` pattern, `autobill.dao.js:56`), update, delete, recordPayment;
  - `lookupVehicle(vehicleNo)` for the autofill;
  - analytics: billed/received/outstanding, by month, and by service type.
- `routes/engbill.routes.js` at `/engbills`: `authenticate, loadActiveTenant`, plus a guard that rejects non-engineering tenants. Every write calls `auditClient()`.
- Additive edits to existing files only:
  - `client.dao.js`: add `"engineering"` to `BUSINESS_TYPES`, and add `engbills` to export/offboard.
  - `ensureIndexes.js`: `engbills` indexes `{clientId}`, `{clientId,billDate}`, `{clientId,vehicleNo}`.
  - `index.js`: mount the route.
  - `admin.routes.js`: accept the new type.

## Frontend (new `Pages/Engineering/…`, mirroring `Pages/Automobile/…`)
- `Dashboard/Index.tsx`: KPI tiles (billed, received, outstanding), charts (revenue by month, by service type), and a "New service" button.
- `Dashboard/Create.tsx`: the create/view/edit form exactly as in the mockups, with the per-card BS model, Qty × Rate rows, quick-add chips, footer totals, and payment fields.
- `Billing/Index.tsx`: bills table and filters, with view/edit/print/delete and record payment.
- `Components/PrintEngInvoice.ts`: as described above.
- Settings, `Pages/Settings/Index.tsx`, for engineering tenants:
  - show Company/branding/logo, the Mechanics editor (hide the Labour editor), the new **Service catalog** tab, and Invoice text;
  - the Service catalog tab edits BS models; service types → items → a price per BS model plus the "needs description" toggle; and the quick-add ticks;
  - hide the radiator Catalog and Bonus tabs and the Salary tab. Radiator and automobile branches are unchanged.
- `App.tsx` routes:
  - widen `BusinessRoute` to include `"engineering"`;
  - add `/engineering/dashboard`, `/create`, `/view/:id`, `/edit/:id`, and `/engineering/billing`;
  - the login redirect sends engineering tenants to `/engineering/dashboard`.
- `Header.tsx` gets an `isEngineering` branch showing Dashboard, Billing, Settings, and Audit only. `SettingsContext.tsx` gets the `engineering` type + fallback. `Pages/Admin/Clients` gets an "Engineering" option.

## Phases (PRs → `staging`)
1. **Backend:** settings block + backfill key, engbill DAO/routes, indexes, cascade, admin type.
2. **Frontend screens:** form, dashboard, billing, PDF, Settings engineering tabs.
3. **Nav/routing/gating + regression.**

## Verification
- Static checks: `node --check` on backend files; `npx tsc --noEmit` on the frontend.
- Where possible, run the backend and frontend and click through. Otherwise use a Playwright render against a mocked API.
- Manual flow on an engineering tenant:
  1. Add Turbo/BS-3 and Compressor/BS-6 cards and confirm the rates auto-fill from their BS models.
  2. Confirm Qty × Rate, the subtotals, per-type totals, and discount/net add up.
  3. Confirm "Other" requires a description.
  4. Confirm the quick-add chips work.
  5. Save, confirm the bill number increments, and check autofill on the next bill for the same truck.
  6. Print the PDF.
  7. Record a partial payment and confirm the status changes.
  8. Confirm the Bonus/Salary/Expenses/Labour menus are absent.
- Regression: radiator and automobile tenants are unchanged, and `git diff` on the radiator/autobill/bonus/salary DAOs and routes is empty.
