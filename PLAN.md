# Sri Velavan Radiators — Final Completion Plan (v2)

Supersedes the earlier draft plan. Incorporates the client's pending-task list, the physical bill / price sheet / table sketch references, and industry-standard practices.

## Confirmed Requirements (from client pending-task list)

1. **Login Token** — token must be generated properly during login → full JWT auth with users collection
2. **Dashboard → Table → Services** — replace "Other" with the user's **Comment** text
3. **Action buttons** — View, Edit, Delete all currently broken → all must work
4. **Default status** — new records start as **"Not Received"** (current code wrongly sets "Received")
5. **Print section** — same "Other" → Comment replacement in the invoice
6. **Payment tracking** — Total / Received / Pending amounts per record (from table sketch); status derived from payments: Not Received → Partial → Received
7. **Invoice QR** — reserve a QR slot in the print layout; UPI ID configurable, finalized later (PhonePe 77080 93151 shown as text meanwhile)
8. **Modern print style** — physical bill is data-field reference only; layouts must be modern

## Architecture Decisions

- **Status model**: store `receivedAmount` (number, default 0) + `status` recalculated server-side: `0 → "Not Received"`, `< total → "Partial"`, `>= total → "Received"`. Legacy records without `receivedAmount`: treat legacy `status: "Received"` as fully paid, otherwise 0.
- **Service type storage**: store option **labels** (matches existing DB data: "Service", "New Radiator", "BS-II"...). Edit form repopulates by label lookup.
- **Auth**: `users` collection, bcrypt-hashed passwords, JWT (24h expiry). Admin user auto-seeded from `.env` on first startup if collection is empty. All `/radiators*` endpoints protected by JWT middleware.
- **API client**: single axios instance in `ApiServices.ts` — baseURL from `VITE_BACKEND_BASE_URL`, request interceptor attaches `Authorization: Bearer`, 401 response → redirect to login.
- **Bill number**: sequential `billNo` per record, max+1 on create.

## ADR-001: Runtime Settings Layer (Data-Driven / White-Label)

**Status:** Accepted · **Date:** 2026-06-10

### Context
The app must be redeployable for any company without code changes. Today company identity (shop name, address, phones, UPI), the price matrix, dropdown catalogs (radiator models, service types), labour names, domain labels ("Truck Number", "Mechanic"), and branding are hardcoded across `PrintInvoice.ts`, `CreateRadiators.tsx`, and the Login/Header components. Price changes are the most frequent edit (the shop's price sheet is living data), so the owner must be able to self-serve changes.

### Options Considered

**A. Build-time config file** — Low complexity, but every change requires a rebuild/redeploy; owner can't self-serve. Rejected.

**B. Full multi-tenant SaaS** — One deployment serving many companies with tenant IDs on every record and per-tenant theming. High complexity, high migration cost; each shop here gets its own deployment + DB anyway. Rejected as overkill.

**C. DB-backed settings + admin UI, seeded from defaults (CHOSEN)** — Single `settings` document (`_id: "app"`) in MongoDB, seeded from `src/config/defaultSettings.js` on first boot. Admin edits via a Settings page. Frontend loads it once after login through a `SettingsContext`. New company onboarding = deploy + fresh DB + fill the settings form.

### Trade-offs
- (+) Owner self-serves price/identity changes; zero-code re-branding; defaults file doubles as documentation of the schema
- (+) Single document = one read, trivially cacheable, no joins
- (−) One more fetch on app start (mitigated: loaded once, kept in context)
- (−) Vocabulary white-labeling (renaming "Radiator"/"Truck") touches every screen — mitigated by routing all such strings through a `labels` map from day one
- (⚠) Revisit if true multi-tenancy is ever needed — the settings shape ports cleanly to per-tenant documents

### Settings Document Shape
```js
{
  _id: "app",
  company: { name, address, phone1, phone2, upiId, upiDisplay, logoUrl },
  branding: { primaryColor: "#12467A", accentColor: "#f47f6b" },
  catalog: {
    productTypes: [ { label: "BS-II", value: "bs2" }, ... ],        // radiator models
    serviceTypes: [ { label: "Service", value: "service" }, ...,
                    { label: "Other", value: "other", requiresComment: true } ],
    priceMatrix: { bs2: { service: 1950, new: 9800, tank: 2500, cover: 800 }, ... }
  },
  labour: ["Dinesh", "Naveen", "Sasi"],
  labels: { vehicleNo: "Truck Number", party: "Lorry Address",
            agent: "Mechanic Name", product: "Radiator Model", worker: "Labour Name" },
  invoice: { billTitle: "CASH / CREDIT BILL", footerNote: "Thank you for your business",
             billNoPrefix: "", showQr: false }   // showQr flips on once UPI ID is finalized
}
```

### Consequences for this plan
- **Backend adds:** `src/config/defaultSettings.js`, `src/dao/settings.dao.js` (`getSettings` seeds-if-missing, `updateSettings`), routes `GET /settings` + `PUT /settings` (JWT-protected)
- **Frontend adds:** `src/Context/SettingsContext.tsx` (provider + `useSettings()` hook, loaded after login), `src/Pages/Settings/Index.tsx` (admin page: Company, Catalog & Prices, Labour, Labels, Invoice sections), route + header link
- **Frontend consumes settings in:** `CreateRadiators` (productTypes, serviceTypes, priceMatrix, labour, labels), `Dashboard` (labels for column headers), `PrintInvoice`/`printReport` (company, branding, invoice config — passed as argument), `Header` (company name/logo)
- The QR placeholder requirement is satisfied by `invoice.showQr` + `company.upiId` — flipping the flag in Settings activates the QR with no code change

---

## Backend (Radiator-backend-main)

| File | Action |
|------|--------|
| `package.json` | add `jsonwebtoken`, `bcryptjs` |
| `.env` | `MONGO_URI`, `PORT`, `JWT_SECRET`, `ADMIN_USER_ID`, `ADMIN_PASSWORD` (already created, extend) |
| `src/config/db.js` | env-based URI (done) |
| `src/middleware/auth.js` | **new** — JWT verify middleware |
| `src/dao/user.dao.js` | **new** — `findUserByUserId`, `seedAdminUser` (bcrypt) |
| `src/dao/radiator.dao.js` | rewrite `createRadiator` for flat payload + `billNo` + default "Not Received" + `receivedAmount: 0`; add `updateRadiator`, `deleteRadiator`, `recordPayment(id, amount)` (recalcs status), `getNextBillNo`; enrich list/get with computed `totalAmount`/`pendingAmount` |
| `src/routes/auth.routes.js` | **new** — `POST /auth/login` → `{ token, user }` |
| `src/config/defaultSettings.js` | **new** — default settings object (Sri Velavan values as the shipped defaults) |
| `src/dao/settings.dao.js` | **new** — `getSettings` (seed-if-missing), `updateSettings` |
| `src/routes/settings.routes.js` | **new** — `GET /settings`, `PUT /settings` (JWT-protected) |
| `src/routes/radiator.routes.js` | **new** — move + fix routes: `GET /radiators`, `GET /radiators/:id`, `POST /radiators/add`, `PUT /radiators/:id`, `DELETE /radiators/:id`, `POST /radiators/:id/payment`, `GET /mechanic`; basic input validation; all JWT-protected |
| `src/index.js` | slim to app setup: dotenv, cors, json, mount routes, global error handler, 404 handler |

## Frontend (Radiator-frontend-main)

| File | Action |
|------|--------|
| `src/Services/ApiServices.ts` | env baseURL, Bearer-token request interceptor, 401 → login redirect |
| `src/Services/Auth.ts` | **new** — token/user storage helpers (`setSession`, `getToken`, `clearSession`, `isLoggedIn`) |
| `src/Context/SettingsContext.tsx` | **new** — provider + `useSettings()` hook; fetches `GET /settings` after login |
| `src/Pages/Settings/Index.tsx` | **new** — admin Settings page: Company, Catalog & Prices, Labour, Labels, Invoice sections |
| `src/Pages/IssueCounter/Login/Index.tsx` | call `POST /auth/login`, store token, error display, then navigate |
| `src/App.tsx` | `ProtectedRoute` wrapper for dashboard routes; add `/issueCounter/dashboard/view/:id` route |
| `src/Common/Header.tsx` | show logged-in user name; working Logout (clear session → login) |
| `src/Pages/.../Dashboard/Index.tsx` | major fix: remove dummy data/dead code; columns per sketch — S.No, Truck, Lorry Address, Radiator Type, Mechanic, Services (Other→Comment), Total, Received, Pending, Phone, Date, Status, Action; working View/Edit/Delete (confirm dialog); **Record Payment modal** (replaces blind status toggle: shows total/received/pending, input amount); toolbar buttons: Excel, PDF, Report; modern `autoTable` API; pagination footer count fixed |
| `src/Pages/.../Dashboard/Components/CreateRadiators.tsx` | fix edit repopulation (label lookup for selectors); read-only View mode; "Lorry Address" label; send labels in payload |
| `src/Components/PrintInvoice.ts` | modern A5 invoice (navy header band, bill meta card, services table with Other→Comment, totals incl. Received/Pending, QR slot — renders QR only when `UPI_ID` constant configured, else PhonePe number text, signature area); `printReport()` A4 summary (totals, revenue received vs pending, by model, by service type, top mechanics) |
| `.env.development` | `VITE_BACKEND_BASE_URL=http://localhost:5000` (exists, verify) |

## Implementation Order

1. Backend: deps → auth (middleware, user dao, auth routes) → **settings layer (defaults, dao, routes)** → radiator dao rewrite → radiator routes → index.js
2. Frontend: ApiServices + Auth service → Login → App routes + ProtectedRoute → **SettingsContext** → Header
3. Dashboard rebuild (columns from labels, actions, payment modal, exports, report)
4. CreateRadiators fixes (edit/view modes, settings-driven options/prices/labels)
5. PrintInvoice rewrite (settings-driven invoice + report, QR behind `showQr` flag)
6. **Settings admin page**
7. Verify end-to-end with both servers running

---

# Phase 2 — Bonus System: Mechanic (yearly) + Labour (daily) (PROPOSED, awaiting confirmation)

## Requirement
Two separate bonus flows, each with its own page (matching the two header menu items):

| | **Mechanic Bonus** | **Labour Bonus** |
|---|---|---|
| Beneficiary | `mechanicName` on the bill (the agent who brought the truck) | each name in `labourName[]` (the workers on the job) |
| Cycle | **Yearly** — settled once per year; the year window is configurable | **Daily** — settled per day |
| Rate | % per product × service (matrix) + default % + per-line override | % per product × service (own matrix) + default %, split among the bill's labour |
| Page | `/bonus/mechanics` — year selector | `/bonus/labour` — day selector |

Bonus values are **materialized into a dedicated `bonuses` collection** — not recomputed from `radiators` on every read. Entries are written/updated automatically whenever a bill is created, edited, paid, or deleted, and carry payout status.

## Calculation Model (CONFIRMED: collected-amount basis + per-line overrides)
Per bill, for each role (mechanic / labour):
```
effectivePercent(line, role) = line.bonusPercent[role]            // per-line override on the bill (optional)
                            ?? bonus[role].matrix[product][service]  // configured matrix
                            ?? bonus[role].defaultPercent            // fallback (covers "Other")

lineBonus     = line.price × effectivePercent(line, role) / 100
accruedBonus  = Σ lineBonus over serviceInfo
payableBonus  = accruedBonus × (receivedAmount / totalAmount)     // COLLECTED-PROPORTIONAL
```
- **Mechanic:** one bonus entry per bill (beneficiary = mechanicName).
- **Labour:** the bill's labour bonus is **split equally** among `labourName[]` → one entry per worker.
- **Collected basis:** unpaid bills earn 0 payable; payments raise payable proportionally. Pages show both *Accrued* and *Payable*.
- **Per-line override:** optional "Bonus %" input per service line on the create/edit form (placeholder shows configured %; empty = use Settings). Stored as `serviceInfo[].bonusPercent` (mechanic) — labour override only if needed later.

## `bonuses` Collection (materialized — single source of truth for bonus pages)
```js
{
  _id, type: "mechanic" | "labour",
  beneficiary: "Ramesh",                  // mechanicName or one labour name
  recordId: ObjectId, billNo, billDate,   // source bill
  period: "2026" | "2026-06-11",          // mechanic: year key (per configurable year start) · labour: day key
  accruedAmount, payableAmount,           // recomputed on bill create/update/payment
  status: "pending" | "paid", paidAt,
  createdAt, updatedAt
}
```
**Sync rules** (`syncBonusesForRecord(record)` called from createRadiator / updateRadiator / recordPayment; deleteRadiator removes entries):
- Upserts one mechanic entry + one entry per labour name for the bill, recomputing amounts from current settings
- Entries already `paid` are **not** retroactively changed by later edits (locked at payout)
- `POST /bonus/sync` backfills entries for existing bills (needed once after deploy)

## Settings Extension (white-label consistent)
```js
bonus: {
  mechanic: {
    matrix: { bs2: { service: 5, ... }, ... },   // % values, product × service
    defaultPercent: 0,
    yearStartMonth: 4,                            // configurable year window (4 = April, Indian FY; 1 = calendar)
  },
  labour: {
    matrix: { ... },                              // own % matrix
    defaultPercent: 0,
  },
}
```
- Settings page gains a **Bonus** card: two % matrix grids (Mechanic / Labour tabs or stacked, same grid UI as the price matrix), default % each, and the year-start month selector.
- Adding/removing products/services keeps all three matrices (price + 2 bonus) in sync.

## Backend
| File | Change |
|------|--------|
| `src/config/defaultSettings.js` | add `bonus` block (mechanic + labour matrices seeded with 0s, defaultPercent 0, yearStartMonth 4) |
| `src/dao/bonus.dao.js` | **new** — `syncBonusesForRecord(record)` (upsert mechanic + labour entries, skip paid); `removeBonusesForRecord(id)`; `getMechanicBonus(year, mechanicName?)` and `getLabourBonus(date, name?)` aggregating the `bonuses` collection per beneficiary; `markPaid(type, period, beneficiary?)`; `backfill(fromDate, toDate)` |
| `src/dao/radiator.dao.js` | store optional `serviceInfo[].bonusPercent`; call `syncBonusesForRecord` from create/update/recordPayment and `removeBonusesForRecord` from delete |
| `src/routes/bonus.routes.js` | **new, JWT-protected** — `GET /bonus/mechanics?year=&mechanicName=` · `GET /bonus/labour?date=&name=` · `POST /bonus/payout {type, period, beneficiary?}` · `POST /bonus/sync {fromDate, toDate}` |
| `src/index.js` | mount `/bonus` routes |

## Frontend
| File | Change |
|------|--------|
| `src/Pages/Bonus/Mechanic.tsx` | **new** `/bonus/mechanics` — dashboard theme pattern (card → table-header band → themed table → repo Pagination): **year selector** (per configured year window) + mechanic `Selector`; columns: Mechanic, Operations, Total Business, Collected, Accrued Bonus, Payable Bonus, Status, Action (View breakdown · **Mark Paid**); totals row; Excel/PDF export |
| `src/Pages/Bonus/Labour.tsx` | **new** `/bonus/labour` — same pattern with **single day picker** (default today); columns: Labour, Jobs, Share Basis, Accrued, Payable, Status, Action (View breakdown · **Mark Paid**); totals row; exports |
| `src/Pages/.../CreateRadiators.tsx` | optional "Bonus %" input per service line (placeholder = effective configured %, empty = use Settings) |
| `src/App.tsx` | protected routes `/bonus/mechanics`, `/bonus/labour` |
| `src/Constants/HeaderData.ts` | Bonus menu → "Mechanic Bonus" → `/bonus/mechanics`; "Labour Bonus" (renames "User Bonus") → `/bonus/labour`; fix "Mechnanic" typo |
| `src/Pages/Settings/Index.tsx` | new **Bonus** card: mechanic % matrix + default %, labour % matrix + default %, year-start month selector |
| `src/Components/PrintInvoice.ts` | `printBonusReport(type, rows, period)` A4 PDF (same layout language as `printReport`) |

## Open Assumptions (flag if wrong)
- **Labour split**: bill's labour bonus divided **equally** among the listed workers
- **Year window**: configurable start month (default April, Indian FY); year key e.g. "2026" = Apr 2026 – Mar 2027
- **Paid is final**: once a period is marked paid, later bill edits/payments create no retroactive changes to paid entries (new payments still accrue as fresh pending amounts)
- "User Bonus" menu item becomes "Labour Bonus" (no separate user-bonus concept)

## Verification
1. Configure mechanic matrix (BS-II Service 5%), labour matrix (BS-II Service 2%), defaults 2%/1%
2. Existing record (₹2,700 billed, ₹1,000 collected, mechanic Bala Murugan, labour Naveen): run `POST /bonus/sync` → mechanic accrued = 1950×5% + 750×2% = ₹112.50, payable ≈ ₹41.67; labour (Naveen, sole worker) accrued = 1950×2% + 750×1% = ₹46.50, payable ≈ ₹17.22
3. Record a payment → both payable amounts rise; full payment → payable = accrued
4. Per-line Bonus % override on a bill takes precedence over the matrix
5. Mechanic page: year selector groups Apr–Mar; Mark Paid sets the year's entries to paid and locks them
6. Labour page: day picker shows that day's entries per worker; Mark Paid works per day
7. Create a new bill → bonus entries appear automatically (no manual sync); delete the bill → pending entries removed
8. Excel/PDF exports on both pages; changing Settings percentages re-prices only future syncs/pending entries

---

## Verification

1. `npm install` then `npm run dev` in backend → port 5000; `npm run dev` in frontend → port 3000
2. Login with admin creds from `.env` → receives JWT, lands on dashboard; wrong password → error shown; direct URL access without token → redirected to login
3. Create record → billNo assigned, status "Not Received", appears in table
4. View (read-only), Edit (pre-populated, saves), Delete (confirm → gone) all work from actions menu
5. Record Payment: pay partial → status "Partial", pending shown; pay rest → "Received"
6. Services column shows comment text for "Other" services
7. Print invoice → modern A5 PDF, comment shown instead of "Other", QR slot present
8. Report button → A4 summary PDF with payment totals and breakdowns
9. Excel/PDF exports contain real data incl. Total/Received/Pending
10. **Settings:** change company name + a price in Settings page → header, create-form price autofill, and printed invoice all reflect the change without code edits; toggling `showQr` with a UPI ID set makes the QR appear on the invoice
