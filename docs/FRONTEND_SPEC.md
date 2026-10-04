# Frontend Spec — White-Label Workshop Billing App

> **Purpose of this document:** a complete, design-tool-ready description of the current frontend (as of the `staging` branch, Oct 2026). Feed it to a design assistant to get a **new design spec**. It describes *what exists and must keep working* (information architecture, screens, fields, actions, states, data, constraints). It does **not** describe how it should look next — that's the output you want.
>
> Source of truth: `Radiator-frontend-main/src/`. Every screen, field and label below was read from the code, not inferred.

---

## 0. Suggested prompt to pair with this spec

> You are a senior product designer. Using the spec below, produce a new design spec for this app: design principles, a token system (color, type, spacing, radius, elevation, motion) that supports **tenant-driven brand colors**, a component library (with states), and a layout for every screen listed in §6–§11, covering desktop (≥1280), tablet (768–1279) and phone (≤767). Keep every field, action and business rule in this spec. Resolve the inconsistencies listed in §12. Don't invent features that aren't here; flag anything you would add as a separate "proposals" section.

---

## 1. Product summary

- **What it is:** a multi-tenant, white-label billing and back-office app for small Indian vehicle-service workshops. One codebase serves many client businesses ("tenants"); each tenant has its own login URL, branding, catalog, labels and data.
- **Three business verticals** (fixed per tenant at creation, `settings.businessType`):
  | Vertical | What a "bill" is | Pricing model |
  |---|---|---|
  | **Radiator** (default; e.g. "Sri Velavan Radiators") | A radiator service job on a truck: one *product model* + N *service types* | Price matrix: product model × service type → price |
  | **Automobile** | A general vehicle repair bill: free-form line items (particulars, qty, unit, rate) | Optional parts catalog auto-fills unit + rate |
  | **Engineering Works** (turbo & air-compressor service) | One or more *service cards*, each a service type with multiple items, tied to a "BS model" (emission standard, e.g. BS-IV/BS-VI) | Per item × BS-model price grid; empty = not offered |
- **Also in the product:** expenses, payment tracking (partial payments + discount), mechanic/labour bonus engine, salary management (attendance, advances, settlement, payslips), activity log, and a **Super Admin console** to provision tenants.
- **Users:**
  - *Tenant admin / counter staff* — creates bills at the shop counter, records payments, prints invoices. Often on a **tablet or phone on the shop floor** (code comments say so explicitly). Many are not finance-literate; copy is plain-language on purpose.
  - *Owner* — reads dashboards, pays bonuses and salaries, edits settings.
  - *Super admin* (platform operator) — creates/suspends/deletes tenants, views audit trail.
- **Locale:** India. Currency ₹ with `en-IN` grouping (₹1,23,456.00). Dates shown `dd/mm/yyyy` (`toLocaleDateString("en-IN")`). Financial year usually starts **April** (configurable). Phone numbers are 10 digits.
- **Language:** English only. No i18n.

---

## 2. Tech constraints a design must respect

- React 19 + TypeScript + Vite; **Bootstrap 5** grid/utilities and markup (`.card`, `.modal`, `.btn`, `.form-control`); react-select for dropdowns; react-hook-form; Recharts for charts; framer-motion (one slide-in on bill forms); jsPDF for **all printing and PDF exports** (generated client-side, not HTML print).
- **Tenant branding is runtime CSS variables.** On login, `--primary` and `--accentColor` are set from the tenant's settings (`branding.primaryColor`, `branding.accentColor`); `--login-text-color` too on the login page. Defaults: primary `#2264E5` (login fallback) / `#12467A` (app fallback), accent `#f47f6b`. **Any new design must derive its accent states from these two variables**, not from fixed brand colors, and must stay legible for any color a tenant picks (including very light or very dark ones — nothing currently guards this).
- **Tenant-editable labels.** Many field names and column headers are strings from settings, not fixed copy: `labels.vehicleNo` ("Truck Number"), `labels.party` ("Lorry Address"/"Party Name"), `labels.agent` ("Mechanic Name"), `labels.product` ("Radiator Model"), `labels.worker` ("Labour Name"); automobile has its own set (`vehicleNo`, `customer`, `agent`, `worker`). Designs must tolerate labels of arbitrary length.
- **Tenant-uploaded assets:** logo (header + invoice), payment QR image, signature image, login background image.
- No dark mode exists. The legacy `src/index.css` (Vite template with a dark scheme) is **not imported** — ignore it.

---

## 3. Information architecture & navigation

### 3.1 Routes

| Route | Screen | Who | Vertical gate |
|---|---|---|---|
| `/` | → redirects to `/issueCounter/login` | — | — |
| `/issueCounter/login`, `/t/:code/login` | Tenant login (generic / branded per tenant code) | public | — |
| `/change-password` | Change password (forced on first login) | logged in | — |
| `/issueCounter/dashboard` | Radiator dashboard (analytics) | tenant | radiator |
| `/issueCounter/billing` | Radiator bills list | tenant | radiator |
| `/issueCounter/dashboard/create` · `/view/:id` · `/edit/:id` | Radiator bill form (create / read-only / edit) | tenant | radiator |
| `/automobile/dashboard` | Automobile dashboard | tenant | automobile |
| `/automobile/billing` | Automobile bills list | tenant | automobile |
| `/automobile/dashboard/create` · `/view/:id` · `/edit/:id` | Automobile bill form | tenant | automobile |
| `/engineering/dashboard` | Engineering dashboard | tenant | engineering |
| `/engineering/billing` | Engineering bills list | tenant | engineering |
| `/engineering/dashboard/create` · `/view/:id` · `/edit/:id` | Engineering service form | tenant | engineering |
| `/issueCounter/expenses` | Expenses | tenant | radiator + automobile (hidden in nav for engineering) |
| `/bonus/mechanics`, `/bonus/labour` | Bonus ledger (mechanic / labour) | tenant | all (labour hidden for engineering) |
| `/bonus/mechanics/review`, `/bonus/labour/review` | Per-person performance review + payout | tenant | all |
| `/salary/employees` | Employees | tenant | radiator + automobile (nav hidden for engineering) |
| `/salary/settle` | Settle salary | tenant | radiator + automobile (nav hidden for engineering) |
| `/settings` | Settings (tabbed) | tenant | tabs differ per vertical |
| `/audit` | Activity log | tenant | all |
| `/admin/login` | Super-admin login | public | — |
| `/admin/clients` | Clients (tenants) | super admin | — |
| `/admin/audit` | Platform audit log | super admin | — |

Note: the bill **create/view/edit** forms live *under* `/…/dashboard/…` but belong to **Bills** conceptually; the "Bills" nav item stays highlighted there. A redesign may want to move them under `/…/billing/…`.

### 3.2 Top navigation (tenant app)

Fixed top bar, full width. Left: tenant logo (28px tall, max 120px wide) + company name. Right: nav links + user menu. Collapses to a hamburger below 992px.

| Vertical | Primary nav |
|---|---|
| Radiator / Automobile | Dashboard · Bills · Expenses · Bonus ▾ (Mechanic Bonus, Labour Bonus) · Salary ▾ (Employees, Settle Salary) |
| Engineering | Dashboard · Bills · Bonus |

User menu (name/userId ▾): **Settings · Activity Log · Change Password · Logout**. Logout returns to the tenant's branded login (`/t/<code>/login`).

No footer content (component renders empty). No breadcrumbs. No global search. No notifications.

### 3.3 Super-admin navigation

Separate top bar: shield emblem + "Super Admin / Console", links **Clients · Audit**, user menu (**Change Password · Logout**). Browser tab title "Super Admin Console".

### 3.4 Browser tab title

Tenant company name, else "Radiator Management".

---

## 4. Current visual system (as-built)

Three layers stacked on Bootstrap, imported in this order (later wins): `base-theme.css` → `common.css` → `style.css` (2,700 lines, legacy) → `responsive.css` → `admin.css` → `apple-rebrand.css`. Engineering screens additionally load `engineering.css` with its own `eng-` token set.

### 4.1 Tokens in use ("Apple rebrand" layer — the effective one)

| Group | Tokens |
|---|---|
| Font | `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui…`; Inter woff2 (400/500/600/700) bundled |
| Type scale | 12 / 13 / 15 (base) / 16 / 20 / 26 / 32px; tracking −0.022em headings, −0.012em UI |
| Ink | `--ink-900` #1D1D1F, `--ink-700` #1D1D1F, `--ink-500` #6E6E73, `--ink-400` #8E8E93 |
| Surfaces | `--canvas` #E9E9EE (page), `--surface` #FFF (cards), `--surface-sunken` #F2F2F5 (table head, hover) |
| Lines | `--line` #E1E1E6, `--line-strong` #CFCFD6 |
| Radius | 8 / 12 / 16 / 22 / pill |
| Elevation | `--shadow-xs/sm/md/lg` (neutral, low opacity) |
| Controls | height 44px (36px small), padding-x 14px, tap min 44px |
| Motion | 120ms / 200ms, `cubic-bezier(.4,0,.2,1)` |
| Brand-derived | `--primary-soft` (12% primary on white), `--primary-softer` (6%), `--focus-ring` (3px, 18% primary) |
| Status (legacy) | success #1F8B24 on #E1FCEF · pending/warning #C69E23 on #FEF8F1 · rejected/danger #D12953 on #FAF0F3 · primary-tint badge |
| Glass | nav bar = white 72% + 20px blur + hairline bottom border |

### 4.2 Engineering-only tokens (`.eng-theme`, TailAdmin-style)

Gray 50–900 ramp (#F9FAFB … #101828), success #027A48/#ECFDF3, warning #B54708/#FFFAEB, error #B42318/#FEF3F2, radius 8 (controls) / 16 (cards), 4px focus ring at 12% primary. Engineering controls use **8px radius**, the rest of the app **12px**.

### 4.3 Component inventory (as-built)

- **Page header:** H4 title left, action buttons right (`btn-sm`).
- **Buttons:** `btn-primary` (solid brand), `btn-gradient` (fixed blue→purple gradient `#4974E6 → #8757E8`, **ignores tenant brand**), `btn-cancel` (outlined neutral, used for all secondary actions incl. exports), `btn-danger`, `btn-outline-danger` (row remove), link-buttons. Press = scale .98.
- **Card:** white, 1px hairline, 16px radius, shadow-sm. Tables sit inside a card with a filter header (`table-header`) and a pagination footer.
- **Filter bar:** a row of labelled controls inside the table card: search input, react-select dropdowns (clearable, "-- All --"), From/To native date inputs, a **Clear** button, and on Radiator billing a **Cols** column-visibility dropdown.
- **Search:** text input, debounced 200ms, fires only at ≥3 characters (or when cleared).
- **Table:** Apple-list style — no gridlines, hairline row separators, uppercase grey 0.78em header on sunken background, 12px cell padding, wraps long text; numbers/dates/badges `nowrap`. Footer row (totals) bold on sunken background. Horizontal scroll inside the card when too wide.
- **Row actions:** a "⋯" trigger opening a floating menu (portal, escapes table overflow): items with icons, destructive item in red.
- **Expandable row:** chevron in the first cell reveals a nested mini-table on a sunken background (Expenses, Bonus).
- **Status badge:** capsule pill. Payment status: Received = success, Partial = warning, Not Received = danger.
- **Pagination footer:** "1 – 10 of 245", "Rows per page:" as a **number input with a datalist** (10/20/30/50/100), prev/next arrow buttons with "page / total".
- **Modal:** centered sheet, 22px radius, solid white, header (title + ×), body, footer (Cancel + primary/danger). Sizes: default and `modal-lg`. Rendered conditionally by React (no Bootstrap JS).
- **Alert / toast:** `AlertComponent` — Success / Error / Warning / Info banners with title + message, positioned absolute top-right.
- **Loader:** full-screen dimmed overlay with a centered white tile (scoped to the modal body when a modal is open). Used for *every* fetch — there are no skeletons except on Engineering billing.
- **KPI tile:** Radiator/Automobile: centered icon, value (h6), label below. Engineering: icon chip left (tone: primary/success/danger), uppercase label, large value.
- **Chart card:** title (+ optional subtitle) and Recharts body, "No data for this period" empty state. Chart palette: `var(--primary)`, `var(--accentColor)`, #3EA77B, #E2A53C, #6E63C4, #3CA9C2 — but Radiator/Automobile dashboards also hard-code #36b37e, #6554c0, #f47f6b, grid #f0f0f0.
- **Segmented control:** Settings tabs and Engineering date presets (Today / This month / This FY).
- **Tag input:** type + Enter to add, × to remove, drag to reorder (mechanic/labour lists, login highlight lines).
- **Switch:** iOS-style toggle (invoice options, engineering catalog flags).
- **Chips:** Engineering BS-model chips (inline-editable, × delete, dashed "Add model" chip). Engineering "Quick add" pill buttons on the service form.
- **Section divider:** label + hairline rule ("Services", "Items", "Expenses").
- **Icons:** custom SVG sprite (`Icons.tsx`, names like `receipt-text`, `currencyrupee`, `trendingup`, `clock`, `print`, `edit`, `delete`, `view`, `exporticon`) plus react-icons.

### 4.4 Breakpoints

Bootstrap: 576 / 768 / 992 / 1200 / 1400. Nav collapses <992. Login hides the brand panel <992. Engineering has a dedicated phone layout <768 (tables → cards, sticky totals bar, filter drawer). Other verticals rely on Bootstrap column stacking + horizontal table scroll only.

---

## 5. Shared business rules that drive UI

- **Payment status** is derived, never picked: *Not Received → Partial → Received* from received vs. net total.
- **Record Payment** (all verticals): shows Total/Net, Received so far (green), Pending (red); inputs *Discount (₹, optional — reduces amount owed)* and *Amount received now (₹)* with "Up to ₹X" placeholder; shows "Pending after discount" when a discount is entered. Engineering adds **Payment mode** (Cash/UPI/Card/Bank/Other). Disabled when nothing is pending.
- **"Requires comment" services/items** (e.g. "Other"): the line asks for a description, and the **description replaces the label** everywhere it is shown (tables, exports, invoices).
- **Delete** is always a confirm modal naming the record ("Delete bill for TN01AB1234 dated 04/10/2026? This cannot be undone.").
- **Exports** (Excel via SheetJS, PDF via jsPDF) always export *all records matching the current filters*, not just the visible page. PDF table header uses the tenant primary color.
- **Printing** generates PDFs in-browser:
  - **Invoice (A5 portrait)** per bill — masthead (logo + company + address/phones, bill title/no/date), "BILLED TO" / "DETAILS" blocks, line items, totals, optional **"Scan to pay" QR** (uploaded image or generated from UPI ID) with "PAY VIA" text, optional **signature** above "Authorised signatory", footer note. Variants for radiator, automobile, engineering.
  - **Summary report (A4)** — Radiator only, over filtered bills: revenue, payment position, breakdowns by model / service / mechanic.
  - **Payslip (A5)** — salary settlement.
- **Bonus engine:** every bill accrues bonus for its mechanic (and, radiator/automobile, its labour, split equally). Bonus is *payable in proportion to the amount collected*. Issuing ("Mark paid") locks entries against future bill edits.
- **Salary:** net = base salary × present days ÷ working days − advances − deductions; settling locks the period; later changes are append-only **adjustments**.

---

## 6. Authentication screens

### 6.1 Tenant login — `/issueCounter/login`, `/t/:code/login`
- **Layout:** full-bleed background — tenant's uploaded image with a slow Ken-Burns zoom, or a `primary → accent` 135° gradient when none. Dark left-to-right scrim + brand-tinted overlay.
  - **Left brand panel (≥992px only):** time-of-day eyebrow ("Good morning/afternoon/evening"), huge company name (36–60px, in tenant `loginTextColor`), a **rotating highlight line** that fades every 4.2s (tenant-configured lines, else defaults: "Billing, expenses & bonuses in one place", "Every payment, tracked", "Your workshop, organized").
  - **Right glass card (max 420px):** logo (64px) or initials tile or lock icon, company name, "Sign in to continue".
- **Fields:** Business Code (pre-filled + read-only on `/t/:code/login`), User ID, Password (show/hide eye toggle, min 6). Inline error under each field; general error above the button.
- **Button:** full-width pill "LOGIN" in **accent** color; "Logging in..." while submitting.
- **After login:** forced to `/change-password` if `mustChangePassword`, else dashboard (redirected per vertical).
- Respects `prefers-reduced-motion`.

### 6.2 Change password — `/change-password`
Centered card (max 440px), no app chrome. Title + subtitle ("For security, please set a new password before continuing." when forced). Fields: Current, New (≥6), Confirm. Buttons: Cancel (hidden when forced) + "Change Password".

### 6.3 Super-admin login — `/admin/login`
Centered card: shield emblem, eyebrow "Super Admin", "Console sign-in", "Manage clients & platform access". Fields: User ID, Password (eye toggle). Accent pill button "SIGN IN".

---

## 7. Radiator vertical

### 7.1 Dashboard — `/issueCounter/dashboard`
- **Filters card:** From (default = FY start), To (default today, max today), Mechanic, Product model, Status. Helper: "Mechanic / Product / Status filters apply to billing only. Expense stats always use the date range above."
- **Billing KPIs (6 tiles):** Total Bills · Total Revenue · Collected · Pending (red) · Collection Rate % · Avg Bill Value.
- **Charts:** Monthly Revenue (grouped bars: Revenue vs Collected, 8/12 width) · Payment Status (donut, 4/12) · Service Type Mix (pie, ½) · *{Product}* Mix (horizontal bars, ½) · Top Mechanics by Revenue (horizontal bars, full).
- **"Expenses" section** (divider): 4 KPIs — Total Expenses · Materials · Others · Payroll (read-only from Salary) — then Expense Type Breakdown (pie, 5/12) and Monthly Expenses (area, 7/12).
- Every filter change refetches; no explicit Apply button.

### 7.2 Bills list — `/issueCounter/billing` (page title "Billing")
- **Header actions:** Excel · PDF · **Report** (A4 summary) · **Add New** (primary).
- **Filters:** Search *{vehicleNo}* · Mechanic · *{Product}* · Service Type · Status · From · To · Clear · **Cols** (toggle any of 11 columns).
- **Columns:** SI No · Date · *{vehicleNo}* · *{party}* · *{product}* · Mechanic · Services (comma list) · Total · Received · Pending (red + bold when > 0) · Phone · Status (badge) · Action (⋯ View / Edit / Print / Record Payment / Delete).
- **Empty:** "No Records Found". Paginated (default 10).
- **Modals:** Record Payment (§5), Delete confirm.

### 7.3 Bill form — create / view / edit
- **Header:** small title strip ("Create Bill" / "Edit Bill" / "View Bill"). Content slides in from the right (framer-motion).
- **Fields (2-column ≥1200px):** Create Date* (calendar picker) · *{vehicleNo}** · *{party}** · *{agent}** (select from settings mechanics) · *{product}** (select) · *{worker}** (multi-select labour, ≥1) · Phone Number (optional, 10 digits).
- **"Services" section:** "Add New Service" button; repeating bordered blocks, each: Service Type* (select; already-used types removed from other rows) · Price (₹)* (auto-filled from the price matrix when both product and service are chosen; re-applied if the product changes) · Remove (when >1 row). "Requires comment" types blank the price and show a **Comment*** textarea.
- **Bill total** right-aligned, large.
- **Footer:** Cancel/Back + Save/Update. View mode: everything disabled, only Back.
- On save → back to the bills list with a success toast.

---

## 8. Automobile vertical

### 8.1 Dashboard — `/automobile/dashboard`
Same pattern as radiator, billing only (no product filter, no expenses section): filters From/To/*{agent}*/Status; 6 KPIs; Monthly Revenue + Payment Status; Top *{agent}*s by Revenue.

### 8.2 Bills list — `/automobile/billing`
- **Header:** Excel · Add New (no PDF / Report).
- **Filters:** Search *{vehicleNo}* · *{agent}* · Status · From · To · Clear (no Cols toggle).
- **Columns:** SI No · Date · Bill No · *{vehicleNo}* · *{customer}* · *{agent}* · Items ("Engine oil (4 L), Filter (1 pcs)") · Total · Received · Pending · Status · Action (same 5 actions).

### 8.3 Bill form
- **Fields:** Bill Date* · Bill No (read-only, "auto-assigned") · *{vehicleNo}** · *{customer}* · *{agent}** · *{worker}* (multi) · Phone Number · Notes.
- **"Items" section:** "Add Item"; each block: **Particulars*** = a part picker (from Parts Catalog, fills unit + rate) *plus* a free-text name field below it ("Or type item name freely"; typing clears the picked part) · Qty* · Unit (select from settings units) · Rate (₹)* · Amount (₹)* (qty × rate; editable) · Remove.
- **Bill total** + Cancel/Save as radiator.

---

## 9. Engineering Works vertical (most recently redesigned; has its own polish)

### 9.1 Dashboard — `/engineering/dashboard`
- **Header:** "Dashboard" + **New service** (primary).
- **Range bar card:** segmented presets **Today / This month / This FY** (active state auto-detected from the dates) + From → To date inputs.
- **KPIs (4, icon-left tiles):** Bills · Billed (primary tone) · Received (success) · Outstanding (danger).
- **Grid:** Revenue by month (Billed vs Received bars, caption, compact Indian axis labels 1.5k / 1L / 1.2Cr; 8/12) · By service type (donut + custom legend list with %, amount; caption = total; 4/12) · Revenue by mechanic (horizontal bars, height grows with rows; full).
- **Empty panel:** "No data for this period / Try a wider date range."

### 9.2 Bills list — `/engineering/billing`
- **Header:** Excel · Add New.
- **Filters:** Search *{vehicleNo}* · *{agent}* · Status; phone shows a **"More filters / Hide filters"** toggle revealing Service type · BS model · From · To · Clear.
- **Columns:** SI No · Date · Bill No · *{vehicleNo}* · *{agent}* · Types (light pill per service type) · Total (net) · Received · Balance (red when > 0) · Status · Action (View / Edit / Print / Record Payment / Delete).
- **States:** loading skeleton (3 bars); **error** ("Couldn't load bills / Check your connection and try again." + Retry); **empty** — no filters: "No bills yet / Create your first service bill…" + New service; with filters: "No bills match these filters / Try a different truck number, mechanic or date range." + Clear filters.
- **Phone (<768):** table becomes a stack of cards — truck number large and bold on top, status badge top-right, labelled Bill no / Date / Mechanic / Total / Received / Balance, SI No hidden.
- **Record Payment modal** includes Payment mode; full-width footer buttons on phone.

### 9.3 Service form — create / view / edit
- **Title:** "Turbo & air compressor service" (create) / "Edit service" / "View service"; subtitle "BS-IV / BS-VI service work record · Bill no. 812".
- **Header fields (2 columns, uppercase small labels):** Create date* · Truck number* (auto-uppercased; on blur **looks up the vehicle** and pre-fills address + phone from its last bill) · Lorry address · Mechanic name* · Phone number (digits only, max 10) · **BS model** (one per bill; changing it re-prices every line and drops items not offered for that model; shows "Mixed" for legacy bills).
- **Services:** "Add New Service"; optional **Quick add:** chips ("Turbo · Cartridge") that add a line to the right card (creating it if needed). Each **service card:** Service type (select) · Work / service items (multi-select checklist; disabled until a type is chosen; only items offered for the BS model) · Remove. Under it, a **line list** (Item · Qty × Rate = Amount · ×), with a description input for "asks detail" items, and "Subtotal".
- **Sticky footer bar** (glass): "Total amount" (large, primary color) + Cancel / Save service (Update service). Cancel on a dirty new bill asks "Discard this bill? Anything entered will be lost." (native `confirm`).
- **Validation copy:** "Truck number is required", "Mechanic is required", "Enter a valid 10 digit number", "Add at least one service with an item", "Describe the work", "Qty must be more than 0".
- **Phone:** each line wraps: name + × on row 1, description full width, then qty × rate … amount.
- Payment is **not** on this form (recorded from the list).

---

## 10. Cross-vertical screens

### 10.1 Expenses — `/issueCounter/expenses` (radiator + automobile)
- **Header:** Add Expense (gradient).
- **Filters:** Search "reason or product" · From (default month start) · To (default today) · Type (Materials / Others) · Min Amount · Max Amount · Clear · Excel · PDF. Summary strip: "37 expenses — **Total: ₹48,250.00**".
- **Columns:** SI No (with expand chevron for Materials) · Date · Type (badge) · Description ("3 product(s)" or reason) · Amount · Action (Edit / Delete). Expanded row: "Products in this expense" mini-table (Product · Qty · Unit Price · Amount · Total).
- **Add/Edit modal (large):** Expense Type* · Date* (≤ today). *Others* → Reason* + Amount*. *Materials* → editable product table (Product Name · Qty · Unit Price · Amount auto · delete) + "+ Add Product Row" + Total.

### 10.2 Bonus ledger — `/bonus/mechanics`, `/bonus/labour`
- **Title:** "Mechanic Bonus" / "*{worker}* Bonus".
- **Header actions:** Issue selected (n) (only when rows ticked) · Manual bonus · Recalculate · Excel · PDF · Analytics (→ review).
- **Explainer paragraph** (plain language, references Settings → Bonus). Warning callout when bonus accrues ₹0: "No bonus is accruing for these jobs yet — set a bonus % … in Settings → Bonus, then click Recalculate."
- **Filters:** From (mechanic: FY start; labour: month start) · To · Person · Status (Pending / Paid / All).
- **Columns:** ☐ (select pending) · Person · Jobs · Work value · Collected · Bonus earned · Ready to pay (bold) · Paid · Status · Action (Details/Hide · Edit · **Issue**). Totals footer row. Expanded "Bills behind X's bonus" mini-table (Date · Work value · Collected · Bonus earned · Ready to pay · Paid · Status).
- **Modals:** Issue Bonus (amount, note; "Issuing locks these entries"), Correct bonus (ready-to-pay amount, reason), Issue selected (list of names + amounts), Manual bonus (person, amount, note; "recorded as paid for today").

### 10.3 Performance review — `/bonus/mechanics/review`, `/bonus/labour/review`
Back button + "Mechanic Performance Review" + Excel/PDF. Filters: person (required), From, To. Empty: "Select a mechanic to view their performance review". Then: 4 KPIs (Total Bills · Operations · Total Revenue · Collected); Service Type Mix (pie) · Revenue by Product Model (bars) · Revenue Timeline (area, "Granularity: day/week/month") · Collection Rate (progress bar + "₹X of ₹Y"). **Bonus Decision** card: "Suggested Bonus: ₹X", final amount, notes, **Confirm & Mark Paid** (gradient). Bills table (Date · Vehicle · Services · Total · Collected · Balance).

### 10.4 Employees — `/salary/employees`
Header: Add Employee. Filters: Search by name · Status (Active/Inactive) · Clear. Columns: SI No · Name · Role · Phone · Base Salary · Status · Action (Edit / Remove). No pagination. **Modal (large):** Name* · Role (Mechanic/Labour/Other) · Phone · Join Date · Base Salary (₹)* · Active ☑ · "Bank Details (optional)": Account Name, Account Number, IFSC, Bank Name · Notes. **Remove** explains: deleted if no history, otherwise marked inactive.

### 10.5 Settle Salary — `/salary/settle`
- **Selector card:** Employee · Period Start (month start) · Period End (today). Empty: "Select an employee and period to settle salary".
- **Attendance card (½):** date + status (Present / Absent / Half Day / Leave) + Mark; marked days as colored badges ("04 Oct — present"); radio **Use daily marks / Manual override** (+ present-days input); "Computed from daily marks: N days. Working days in period: M."
- **Advances card (½):** add row (date, amount, reason, Add) + table of unapplied advances; "All N unapplied advance(s) will be swept into this settlement."
- **Deductions card:** repeatable amount + reason rows, "+ Add Deduction"; **preview table** — Gross (present/working days) · Advances deducted · (Advance carried forward) · Deductions · **Net Payable**; optional note; **Settle & Pay** (gradient); "This locks the period as paid…"
- **Settlement History:** Period · Net Paid · Adjustments · Paid On · Action (View Payslip · Add Adjustment). Paginated. **Add Adjustment modal:** Type, Amount*, Reason; explains it never changes the original amount.

### 10.6 Settings — `/settings`
"Save All Settings" button top-right **and** bottom-right; one save persists all tabs. **Segmented tabs**, per vertical:

| Radiator | Automobile | Engineering |
|---|---|---|
| Company · Catalog & Pricing · *{agent}* & *{worker}* · Bonus · Invoice · Salary | Company · Parts Catalog · *{agent}* & *{worker}* · Bonus · Labels & Invoice · Salary | Company · Service Catalog · Mechanics · Bonus · Invoice |

- **Company:** *Company Profile* (Name, Address, Phone 1, Phone 2, UPI ID, Payment display text; uploads with preview: Business Logo (≤1MB), Payment QR, Authorised signature, Login Background (≤4MB)). *Branding* (Primary / Accent / Login Text color pickers + explanation). *Login Highlight Lines* (tag input).
- **Catalog & Pricing (radiator):** Add *{product}* · Add Service Type; **price matrix table** (rows = products, columns = priceable services with × to remove, number inputs in cells, delete row). Note: comment-required services aren't in the matrix.
- **Parts Catalog (automobile):** add Part Name / Unit / Default Rate; editable table; **Units** chip list with add/remove.
- **Service Catalog (engineering):** *BS models* chip row (inline rename, delete, "Add model"; adding a model adds a price column) · **master-detail**: left rail of service types with item counts + "New service type"; right panel with inline-editable type name, "Delete type", an item grid (Item name · one ₹ price per BS model — empty = not offered, ₹0 = offered free · "Ask for a description" switch · "Quick-add chip" switch · ×), "New item name" + Add item, legend · *Bill numbering* ("Start bill numbers from", only ever raises) · *Financial year* start month.
- **People:** mechanic list and labour list as drag-to-reorder tag inputs.
- **Bonus:** radiator — mechanic **% matrix** (product × service) + default % + bonus-year start month; labour % matrix + default %. Automobile — flat Mechanic % and Labour % of net total + year start month. Engineering — single Mechanic bonus %.
- **Invoice / Labels:** Field label text inputs; Bill title, Footer note; switches "Show payment QR on invoice (requires UPI ID)", "Show signature on invoice (requires a signature image)".
- **Salary:** Pay Cycle (Monthly only), Working Day Rule (Every calendar day / Exclude a weekly off day → Weekly Off Day), Payslip title + footer note.

### 10.7 Activity Log — `/audit`
Filters: Action · From · To · Clear. Columns: When · Action · By · Details. Paginated (20). Empty: "No activity yet".

---

## 11. Super-admin console

### 11.1 Clients — `/admin/clients`
- **Header:** Template (download Excel template) · Import Excel · **Add Client**.
- **Summary stats (3 tiles):** Total Clients · Active (accent) · Suspended (muted).
- **Filters:** search "name, code, or username…" · status select · Clear (client-side).
- **Columns:** SI No · Business Name · Code (`monospace`) · Type (Radiator / Automobile / Engineering badge) · Admin Login · Status (Active / Suspended) · Last Login · Created · Action (View Settings · Open Login Page · Edit · Suspend/Reactivate · Reset Password · Export Data · Delete).
- **Modals:** Add Client (Business Name*, Business Code* auto-slugged and locked after creation, Admin Username*, Admin Password*, Business Type — fixed after creation) → **Handover Details** (Login URL, Code, Username, Temp Password; Copy / Done). Edit Client (name only; code locked). Reset Password. **View Settings** (read-only key/value sections: Provisioning, Company Profile, Branding swatches, labels, catalog matrix…). **Delete Client** (danger title, "Download a backup first" warning with Download Data, type-the-code-to-confirm, "Delete Permanently"). Import Results (created / skipped / error badges per row).

### 11.2 Audit — `/admin/audit`
"Audit Log" + "← Clients". Filters: client · action · From · To · Clear. Columns: When · Action · Client · By · Details.

---

## 12. Known inconsistencies & UX issues to resolve in the new design

Verified in code; these are the things a redesign should fix rather than copy.

1. **Three overlapping style systems** (legacy `style.css`, "Apple rebrand" overrides, Engineering `eng-` tokens) with many `!important` fights. Engineering controls are 8px radius, everything else 12px; Engineering has skeletons, error and empty states, mobile cards; other verticals don't.
2. **Brand leaks:** `btn-gradient` is a fixed blue→purple gradient regardless of tenant color; radiator/automobile charts hard-code greens/purples/coral.
3. **Primary action styling is inconsistent:** "Add New" (bills) is `btn-primary`, "Add Expense"/"Add Employee"/"Add Client" are gradient, "Settle & Pay"/"Confirm & Mark Paid" are gradient, "Save" is primary.
4. **Status color semantics are reused for categories:** expense type Materials = warning yellow, Others = success green; employee Inactive = warning.
5. **Label inconsistencies:** "Create Date" (radiator, engineering) vs "Bill Date" (automobile); page title "Billing" vs nav "Bills"; engineering uses uppercase field labels, others don't.
6. **Settings copy promises a feature that doesn't exist:** the radiator Bonus tab says *"A per-line 'Bonus %' on the bill form overrides the mechanic matrix"* — the bill form has no such field.
7. **Activity Log only has readable names for radiator/expense/settings/bonus/login actions.** Automobile (`autobill.*`), engineering (`engbill.*`) and salary (`salary.*`) actions fall back to raw keys.
8. **Exports differ by vertical:** radiator has Excel + PDF + A4 Report; automobile and engineering have Excel only.
9. **Pagination "Rows per page"** is a free number input with a datalist — unusual and error-prone; Employees has no pagination at all.
10. **Search** silently ignores 1–2 character queries.
11. **Full-screen loader on every fetch** (filters, pagination) blocks the whole page; no inline loading for tables except Engineering.
12. **Modals** are conditionally rendered without visible focus management or Esc handling in the code; Engineering cancel uses the browser's native `confirm()`.
13. **Responsiveness** is strong only on Engineering screens; radiator/automobile tables just scroll sideways on phones, and the wide filter rows stack into long forms.
14. **No accessibility audit:** color contrast depends on tenant-picked colors with no guard; several icon-only controls are `span role="button"` without keyboard handling (settings remove icons, password eye toggle).
15. Footer component is rendered but empty.

---

## 13. Data shapes (for realistic mockups)

```ts
// Radiator bill
{ billDate, truckNumber, transportName /* party */, mechanicName, phoneNumber?, radiatorType /* product */,
  labourName: string[], serviceInfo: { type, price, comments? }[],
  status: "Not Received" | "Partial" | "Received", totalAmount, discount?, receivedAmount, pendingAmount }

// Automobile bill
{ billNo, billDate, vehicleNumber, customerName?, phoneNumber?, mechanicName, labourName: string[], notes?,
  items: { particulars, partRef?, qty, unit, rate, amount }[], totalAmount, discount, netAmount, receivedAmount, pendingAmount, status }

// Engineering bill
{ billNo, billDate, vehicleNo, lorryAddress?, mechanic, phone?,
  services: { type, typeLabel?, bsModel, items: { item, label, comment?, requiresComment?, qty, rate, amount }[], subtotal }[],
  total, discount, netTotal, amountReceived, balance, paymentMode?, paymentStatus }

// Expense
{ expenseType: "materials" | "others", date, reason?, products?: { name, quantity, unitPrice, amount }[], amount }

// Bonus row (per person)
{ beneficiary, operations, totalBusiness, totalCollected, accruedBonus, payableBonus, paidBonus, status: "Pending" | "Paid", records[] }

// Employee
{ name, role: "mechanic" | "labour" | "other", phone?, joinDate?, baseSalary, active, bankDetails?, notes? }
```

**Seeded defaults** (`Radiator-backend-main/src/config/defaultSettings.js`): radiator products BS-II, BS-III, BS-IV, BS-VI; radiator services Service, New Radiator, Tank, Cover, Other (asks comment). Engineering BS models BS-3, BS-4, BS-6; service types **Turbo** (Hold set, Tel, O-ring kit change, Lathe work, Shaft polish, O-rings / rings alteration, Packing set, Labour bill, Other), **Air Compressor** (Kit, Labour, Piston, Rings, Lathe work, Block bush change — not BS-6, Sleeve fixing / Water type / Bold type — BS-6 only, Other), and **Other**. Mechanic and labour lists start empty; automobile parts start empty (example in code: "Engine Oil 15W40", unit L, ₹450). For mockups, use Indian truck numbers (e.g. `TN 37 AB 1234`) and amounts in the ₹ hundreds to tens of thousands.

---

## 14. Volumes & usage context

- Bills list: typically tens to a few thousand rows per tenant; 10 per page default.
- Settings catalogs: ~3–8 product/BS models, ~5–20 service types, ~5–30 items per engineering type.
- People lists: ~2–20 mechanics/labour.
- Primary device for bill entry: tablet/phone at the counter; dashboards and settings: desktop/laptop.
- Printing to A5 paper is a core daily task; the invoice design is part of the brand.
