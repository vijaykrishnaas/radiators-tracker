# Frontend Spec — White-Label Workshop Billing App · v2 (TailAdmin redesign)

> **What this document is:** the complete frontend spec for the redesign. It keeps everything the current app does (from the v1 spec, read from `Radiator-frontend-main/src/` on `staging`, Oct 2026) and defines the **target visual system and layout**: the TailAdmin dashboard language (left sidebar shell, Outfit type, gray scale, border-first cards) adapted to this app's tenant-driven branding and Bootstrap 5 stack.
>
> **How to read it:**
> - **Functional truth** (§1, §5, the *Functional (verbatim from v1)* blocks in §6–§11, §13, §14) is copied unchanged from v1. Every field, action, rule, string, label and route in it must keep working.
> - **Target design** (§2.3, §3.2–§3.5, §4, the "Layout" blocks in §6–§11, §12) is new. Where any v1 wording describes a *look* ("gradient", "pill", "uppercase", "glass", "centered icon"), §4 overrides it.
> - **Delivery** (§15–§17): build order, file plan, acceptance checklist, open questions.
>
> **Companion files** (put them in the repo as named in §15.2):
> `theme.css` (tokens) · `bootstrap-bridge.css` (Bootstrap → tokens) · `fonts.css` (Outfit + ₹ fallback) · `applyTenantBrand.ts` + `applyTenantBrand.test.ts` (runtime brand scale with contrast guard; 15 passing tests, including a sweep of 4,096 primaries; type-checks under `tsc --strict`).
> `chartTheme.ts`, `reactSelectTheme.ts` and every `components/*.css` file are **not** provided. The agent writes them from §4.
>
> Visual reference: TailAdmin (https://demo.tailadmin.com). All measured values come from the **free, MIT-licensed** TailAdmin repo, not the Pro demo. Do not copy TailAdmin markup. Rebuild the patterns in this app's own React + Bootstrap components.

---

## 0. Prompt to pair with this spec (for a coding agent)

> You are a senior frontend engineer working in `Radiator-frontend-main`. Implement the redesign described in this spec, phase by phase (§15), one screen per PR.
> - Keep every route, field, action, label, validation and business rule in §1, §5–§11 working exactly as described.
> - Use only the tokens in `theme.css` (no hex values or brand colours in components), Bootstrap 5.3 markup, and the components in §4.
> - Tenant colours come from `applyTenantBrand()`, never from fixed values.
> - Resolve each item in §12 as specified. Do not add features. Anything you think should be added goes in a "Proposals" note in the PR description.
> - Do not change jsPDF invoice, report or payslip output (§4.15).
> - For each PR, attach screenshots at 390, 820, 1280 and 1440px wide, and tick the relevant items in §16.

---

## 1. Product summary *(unchanged)*

- **What it is:** a multi-tenant, white-label billing and back-office app for small Indian vehicle-service workshops. One codebase serves many client businesses ("tenants"). Each tenant has its own login URL, branding, catalog, labels and data.
- **Three business verticals** (fixed per tenant at creation, `settings.businessType`):
  | Vertical | What a "bill" is | Pricing model |
  |---|---|---|
  | **Radiator** (default; e.g. "Sri Velavan Radiators") | A radiator service job on a truck: one *product model* + N *service types* | Price matrix: product model × service type → price |
  | **Automobile** | A general vehicle repair bill: free-form line items (particulars, qty, unit, rate) | Optional parts catalog auto-fills unit + rate |
  | **Engineering Works** (turbo & air-compressor service) | One or more *service cards*, each a service type with multiple items, tied to a "BS model" (emission standard, e.g. BS-IV/BS-VI) | Per item × BS-model price grid; empty = not offered |
- **Also in the product:** expenses, payment tracking (partial payments + discount), mechanic/labour bonus engine, salary management (attendance, advances, settlement, payslips), activity log, and a **Super Admin console** to provision tenants.
- **Users:**
  - *Tenant admin / counter staff* create bills at the shop counter, record payments and print invoices. They are often on a **tablet or phone on the shop floor**. Many are not finance-literate, so copy is plain-language on purpose.
  - *Owner* reads dashboards, pays bonuses and salaries, and edits settings.
  - *Super admin* (platform operator) creates, suspends and deletes tenants, and views the audit trail.
- **Locale:** India. Currency ₹ with `en-IN` grouping (₹1,23,456.00). Dates shown `dd/mm/yyyy` (`toLocaleDateString("en-IN")`). Financial year usually starts in **April** (configurable). Phone numbers are 10 digits.
- **Language:** English only. No i18n.

---

## 2. Tech constraints & design decisions

### 2.1 Stack *(unchanged)*
React 19 + TypeScript + Vite. **Bootstrap 5** grid, utilities and markup (`.card`, `.modal`, `.btn`, `.form-control`). react-select for dropdowns. react-hook-form. Recharts for charts. framer-motion (one slide-in on bill forms). jsPDF for **all printing and PDF exports** (generated client-side, not HTML print).

### 2.2 Platform constraints *(unchanged, restated)*
- **Tenant branding is runtime.** After login, the tenant's `branding.primaryColor` and `branding.accentColor` drive the UI. Designs must stay legible for **any** colour a tenant picks, including very light, very dark and mid-tone saturated colours.
- **Tenant-editable labels.** Many field names and column headers come from settings, not fixed copy:
  - `labels.vehicleNo` ("Truck Number")
  - `labels.party` ("Lorry Address" / "Party Name")
  - `labels.agent` ("Mechanic Name")
  - `labels.product` ("Radiator Model")
  - `labels.worker` ("Labour Name")
  - Automobile has its own set: `vehicleNo`, `customer`, `agent`, `worker`.

  Every layout must tolerate labels of arbitrary length (wrap, never truncate a label silently).
- **Tenant-uploaded assets:** logo (sidebar + invoice), payment QR, signature, login background image.
- The legacy `src/index.css` (Vite template) is **not imported**. Ignore it.

### 2.3 Design decisions (new)

| # | Decision | Why |
|---|---|---|
| D1 | **Stay on Bootstrap 5.3. Do not add Tailwind.** Implement the TailAdmin look via `theme.css` tokens + `bootstrap-bridge.css`, which uses Bootstrap's own component CSS variables (verified against bootstrap 5.3.8) + small component CSS files. | Adding Tailwind beside Bootstrap brings conflicting resets and class names, and two utility systems. The look comes from the tokens, not the framework. |
| D2 | **Left sidebar + slim header** replaces the top navigation bar (§3.2). | This is the TailAdmin layout. It scales to more nav items and the collapsed rail suits tablets. |
| D3 | **Tenant colour generates a full 12-step brand scale** (`--brand-25 … --brand-950`) at runtime via `applyTenantBrand()`, with a **contrast guard**: `--on-brand`, `--brand-text`, `--brand-solid`, `--brand-solid-border`, `--focus-ring-color` are chosen so text reaches **4.5:1** in the normal and hover states. | Fixes v1 §12.14 (no contrast guard). Verified: mid red `#E53935` fails 4.5:1 with both white and dark text, so the guard darkens the solid surface to `#CA322F`. The current default login button (white on `#F47F6B`, ≈2.6:1) also fails today. The guard switches it to dark text. |
| D4 | **Outfit** becomes the UI font, self-hosted, with an explicit **₹ fallback** to Inter latin-ext (`fonts.css`). | Outfit is the TailAdmin typeface, but **Outfit has no ₹ glyph** (verified in Outfit-Fonts and @fontsource/outfit 5.3). Without the fallback, every amount would render ₹ in a random system font. |
| D5 | **Tabular figures** (`font-variant-numeric: tabular-nums`) and right alignment for every amount, count and date column, KPI value and total. | Amounts in lists must line up digit-for-digit. Outfit supports `tnum`. |
| D6 | **One radius language:** 8px controls, 12px tiles/alerts, 16px cards/panels, 24px modals, pill for badges/avatars. | Resolves v1 §12.1 (8px engineering vs 12px elsewhere). |
| D7 | **Border-first surfaces:** cards have a 1px `gray-200` border and **no shadow**. Shadows only on floating UI (menus, modals, toasts). | TailAdmin language. It is also cheaper to render on low-end tablets than the current shadows + 20px glass blur. |
| D8 | **Badge text uses the 700 step** on the 50 tint (e.g. `success-700` on `success-50`), not TailAdmin's 600. | Measured: TailAdmin's 600-on-50 badges score 3.3–4.4:1 (all fail AA at 12px). 700-on-50 scores 5.1–6.0:1. |
| D9 | **Document scroll, fixed sidebar, sticky header.** TailAdmin scrolls an inner `<div>`; this app scrolls the page. | Page scroll keeps mobile address-bar collapse and native pull-to-refresh working, makes body scroll-lock for modals and the drawer trivial, and lets sticky elements (header, form footer) stick to the viewport. The hover-expanded rail also overlays content instead of reflowing it. |
| D10 | **No dark mode in this redesign.** Tokens are structured so it can be added later (§17, P3). | Not in v1. Tenant colours + dark mode need a second contrast pass. |
| D11 | **Shell breakpoint is 1280px** (TailAdmin `xl`), implemented in custom CSS. Bootstrap's grid breakpoints (576/768/992/1200/1400) stay as they are for page content. | Rebuilding Bootstrap from Sass to move `xl` is not worth it. Between 1200 and 1279 the sidebar is off-canvas, so content has full width. **Caveat:** Bootstrap columns follow the *viewport*, but with the sidebar open the content is 290px narrower (942px at a 1280 viewport, so a `col-xl-4` card is ≈298px wide). Components that change layout by their own width (chart legends, KPI values) use **container queries** (`container-type: inline-size`), not viewport breakpoints. |
| D12 | **No Unicode symbols as UI glyphs.** Arrows, chevrons, ⋯, ✕, ✓ and ▾ are SVG icons. | Verified: Outfit (and the Inter ₹ fallback subset) has **no** ← → ⋯ ✕ ▾ ▸ ✓ ⌘ glyphs, so text arrows would render in a random system font. "← Bills" in this spec means a back-arrow icon + the text "Bills". × · — … are present and fine. |

---

## 3. Information architecture & navigation

### 3.1 Routes *(unchanged)*

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

Routes do **not** change in this redesign. Bill create/view/edit live under `/…/dashboard/…` but belong to **Bills**, and the sidebar's active-state rule (§3.2.5) handles that. Moving them to `/…/billing/…` is proposal P5 (§17).

### 3.2 App shell — tenant (new; replaces the v1 top bar)

```
≥1280px                                              <1280px
┌─────────────┬──────────────────────────────────┐   ┌──────────────────────────────┐
│ SIDEBAR     │ HEADER (sticky)                  │   │ HEADER  ☰  [logo]      (VK)  │
│ fixed, 290  ├──────────────────────────────────┤   ├──────────────────────────────┤
│ (90 rail)   │ PAGE  max 1536, padding 24       │   │ PAGE  padding 16             │
│             │  page header → cards             │   │  sidebar = off-canvas drawer │
└─────────────┴──────────────────────────────────┘   └──────────────────────────────┘
```

#### 3.2.1 Sidebar container
| Property | Value |
|---|---|
| Position | `position: fixed; top: 0; left: 0; height: 100vh; height: 100dvh` (vh first as the fallback). Own vertical scroll (scrollbar hidden). z `--z-sidebar` |
| Width | 290px expanded (`--sidebar-w`), 90px collapsed rail (`--sidebar-w-collapsed`, ≥1280 only) |
| Padding | 0 20px |
| Surface | `--surface` (white), right border 1px `--border` |
| Transition | width / transform `var(--duration) var(--ease)` (respects reduced motion) |
| Page offset | at ≥1280 the page wrapper gets `margin-left: var(--sidebar-w)` (or `--sidebar-w-collapsed` when collapsed). The hover-expanded rail **overlays** the page and adds `--shadow-theme-lg`. It does not reflow content. |

#### 3.2.2 Responsive behaviour
| Viewport | Default | Toggle (☰ in header) |
|---|---|---|
| ≥1280 | Expanded, in-flow (page offset) | Collapses to the 90px **icon rail**. Choice persisted in `localStorage` key `sidebarCollapsed` (wrap in try/catch; default expanded). |
| ≥1280, rail collapsed | Rail shows centred icons only. Expands to 290px **on `:hover` and `:focus-within`** (overlay) | — |
| <1280 | Off-canvas (`transform: translateX(-100%)`) | Slides in as a drawer over a backdrop (`--overlay-nav`, z `--z-overlay`). Closes on: backdrop click, Esc, route change, the close button. Focus is trapped while open and returns to ☰ on close. |

Use **two** state values, `desktopCollapsed` and `mobileOpen`. Do not reuse one boolean for both meanings (TailAdmin does, and it causes bugs).

#### 3.2.3 Sidebar anatomy
1. **Brand row**, padding 32px top / 28px bottom:
   - **Expanded:** tenant logo (max-height 32px, max-width 160px, `object-fit: contain`) + company name (16px semibold `--text-strong`, 1 line, ellipsis, full name in `title`). No logo uploaded → initials tile (32px, `--radius-md`, `--brand-50` bg, `--brand-text` 14px semibold).
   - **Rail:** initials tile only, centred.
2. **Menu groups.** Group title 12px/20px uppercase `--text-subtle` (decorative, so contrast is exempt), margin-bottom 16px. In the rail the title becomes a 24px dots icon, centred. Item list: `flex column; gap 4px; margin-bottom 24px`.
3. **Menu item:**
   - Box: `display flex; align-items center; gap 12px; padding 10px 12px; border-radius 8px; min-height 44px` (44px tall with the 24px icon; TailAdmin's 40px is below the touch target). Text 14px/20px medium.
   - Icon: 24px, left. Chevron: 20px, absolute right 10px, rotates 180° when open.
   - Inactive: text `--gray-700`, icon `--gray-500`. Hover: bg `--gray-100`, icon `--gray-700`.
   - **Active:** bg `--brand-50`, text + icon `--brand-text`, chevron `--brand-text`.
   - Rail: icon only, centred; label and chevron hidden (still in the DOM for screen readers).
4. **Submenu** (accordion: one open at a time; the open section persists in `localStorage` key `sidebarOpenSection`):
   - Container: margin-top 8px, gap 4px, **padding-left 36px**.
   - Item: same as a menu item (44px tall, padding 12px) but no icon.
   - Active: `--brand-50` bg + `--brand-text`.
   - Hidden in the rail and shown again when the rail hover-expands.
   - Parent items with children are `<button aria-expanded aria-controls>`, not links.
5. **No footer box.** TailAdmin's promo box is dropped.

#### 3.2.4 Navigation content
| Group | Radiator / Automobile | Engineering | Icon (existing `Icons.tsx` name, else react-icons) |
|---|---|---|---|
| **Menu** | Dashboard | Dashboard | grid / `MdOutlineDashboard` |
| | Bills | Bills | `receipt-text` |
| | Expenses | — | `currencyrupee` |
| | Bonus ▸ Mechanic Bonus · *{worker}* Bonus | Bonus (single link → `/bonus/mechanics`) | `trendingup` |
| | Salary ▸ Employees · Settle Salary | — | users / `FiUsers` |
| **Manage** | Settings | Settings | gear / `FiSettings` |
| | Activity Log | Activity Log | `clock` |

Nav labels keep their current text (v1 §3.2), as do all button and menu labels (§4.2). Settings and Activity Log move from the user menu into the sidebar for discoverability. Whether they also stay in the user menu is open question Q2.

#### 3.2.5 Active-state rules
| Current route | Active item |
|---|---|
| `/{v}/dashboard` (exact) | Dashboard |
| `/{v}/billing`, `/{v}/dashboard/create`, `/{v}/dashboard/view/:id`, `/{v}/dashboard/edit/:id` | Bills |
| `/issueCounter/expenses` | Expenses |
| `/bonus/mechanics`, `/bonus/mechanics/review` | Bonus › Mechanic Bonus (parent open + highlighted) |
| `/bonus/labour`, `/bonus/labour/review` | Bonus › *{worker}* Bonus |
| `/salary/employees` · `/salary/settle` | Salary › Employees · Settle Salary |
| `/settings` · `/audit` | Settings · Activity Log |

`{v}` = `issueCounter` | `automobile` | `engineering`. Active links get `aria-current="page"`.

#### 3.2.6 Header
| Property | Value |
|---|---|
| Position | `sticky; top 0`; z `--z-header`; bg `--surface`; bottom border 1px `--border` |
| Padding | ≥1280: 16px 24px (≈77px tall). <1280: 12px 16px (≈64px) |
| Left | ☰ toggle button (menu icon): 44×44 at every width, `--radius-md`, 1px `--border` at ≥1280, icon `--gray-500`, `aria-label="Toggle sidebar"`, `aria-expanded`, `aria-controls="app-sidebar"`. Below 1280 the tenant logo / initials tile follows it. |
| Right | **User menu** (§3.2.7). Nothing else. |
| Not included | Global search, ⌘K, notifications and dark-mode toggle are **not** built (no such features exist). See proposals P1–P3. |

#### 3.2.7 User menu
- **Trigger:** avatar circle 44px (initials, `--brand-50` bg, `--brand-text`, 14px semibold), then 12px gap, user name/userId (14px medium `--gray-700`, hidden <768), then an 18px chevron (rotates when open).
- **Panel:** `.dropdown-menu`, width 260px, right-aligned, 17px below the trigger.
  - Head: name (14px medium `--text-strong`) + "Business code · Radiator" (12px `--text-muted`).
  - Items: Change Password · (Settings · Activity Log, per Q2) · divider · **Logout**.
- Logout returns to `/t/<code>/login` (unchanged).
- Closes on outside click and Esc. Arrow keys move between items.

#### 3.2.8 Page container & page header
- **Container:** `max-width: var(--content-max)` (1536px), centred. Padding 16px (<768), 24px (≥768). (The sticky form footer is in normal flow, so no extra bottom padding is needed.)
- **Page header** (top of every screen): `display flex; flex-wrap wrap; justify-content space-between; align-items center; gap 12px; padding-bottom 24px`.
  - **Left:** optional back link (20px back-arrow icon + "Bills", 14px medium `--text-muted`, hover `--text-strong`, min 44px tap height), then page title (20px/30px semibold `--text-strong`), then optional subtitle (14px `--text-muted`).
  - **Right:** actions. Secondary buttons first, **one** primary last.
  - **<768:** exports (Excel / PDF / Report) collapse into a "More" secondary menu button (with a dots icon). The primary stays visible. Actions wrap below the title.
- **Grid:** Bootstrap `.row.g-3.g-md-4` (16px → 24px gutters).
- **Remove** the empty footer component (v1 §12.15).

### 3.3 App shell — super admin
Same shell, header and user menu. Differences:
- Brand row: shield emblem + two lines "Super Admin" (16px semibold) / "Console" (12px `--text-muted`).
- One group "Console": **Clients** (`/admin/clients`) · **Audit** (`/admin/audit`).
- User menu: Change Password · Logout.
- Brand colours: `applyTenantBrand(DEFAULT_PRIMARY, DEFAULT_ACCENT)` (no tenant).

### 3.4 Browser tab title *(unchanged)*
Tenant company name, else "Radiator Management". Super admin: "Super Admin Console".

### 3.5 Screens without the shell
Login, change password (including forced first login) and super-admin login render **without** sidebar and header (§6).

---

## 4. Design system (target)

All values are tokens in `theme.css`. **Components must not contain hex colours, raw px font sizes outside the scale, or `!important`.**

### 4.1 Colour

**Brand (runtime, from `applyTenantBrand`):**
| Token | Use |
|---|---|
| `--brand-500` | Exact tenant primary: chart series 1, decorative accents, progress bars |
| `--brand-solid` / `--brand-hover` / `--on-brand` / `--brand-solid-border` | Solid surfaces: primary buttons, selected checkbox/radio, active pagination, switch "on". `--brand-hover` is a **surface** colour only, never text. |
| `--brand-text` | Brand as text or icons on white / `--brand-50`: links, active nav, bill total, active tab text |
| `--brand-50` | Active nav/menu background, avatar background, selected option background |
| `--brand-25…400`, `600…950` | Tints and shades for charts and hover |
| `--brand-300` | Input focus border |
| `--focus-ring-color` | Colour of the 3–4px focus box-shadow on every interactive element. (Named `-color` so it can't collide with the legacy `--focus-ring`, which holds a full shadow value.) `--focus-ring-error` for invalid fields and danger buttons. |
| `--accent`, `--accent-solid`, `--on-accent`, `--accent-hover` | Tenant accent: **login button** and chart series 2 only |
| `--primary`, `--accentColor` | **Legacy aliases.** Still set for jsPDF and unmigrated CSS. Do not use in new code. |
| `--login-text-color` | Still set on the login page from `branding.loginTextColor` (unchanged; not handled by `applyTenantBrand`) |

**Neutrals and roles:**
| Role token | Value | Use |
|---|---|---|
| `--page-bg` | gray-50 `#F9FAFB` | App background |
| `--surface` | white | Cards, sidebar, header, modals, menus |
| `--surface-muted` | gray-50 | Table footer row, hover row, read-only inputs, nested rows |
| `--surface-sunken` | gray-100 `#F2F4F7` | Icon tiles, segmented track, chips, skeletons |
| `--border` | gray-200 `#E4E7EC` | Cards, sidebar, header, dividers (also the global default border colour) |
| `--border-subtle` | gray-100 | Table row separators, list separators inside cards |
| `--border-control` | gray-300 `#D0D5DD` | Inputs, selects, outline buttons |
| `--text-strong` | gray-800 `#1D2939` | Titles, values, key cell (truck number), totals |
| `--text` | gray-700 `#344054` | Labels, menu items, body copy |
| `--text-muted` | gray-500 `#667085` (4.97:1 on white) | Secondary text, table cells, helper, captions |
| `--text-subtle` | gray-400 `#98A2B3` (2.58:1) | **Placeholders and decorative group titles only.** Never for information. |

**Status (fixed, not tenant-themed):**
| Meaning | Text / icon | Background | Solid |
|---|---|---|---|
| Success | `--success-700` `#027A48` | `--success-50` `#ECFDF3` | `--success-500` `#12B76A` (charts, dots) |
| Warning | `--warning-700` `#B54708` | `--warning-50` `#FFFAEB` | `--warning-500` `#F79009` |
| Error | `--error-700` `#B42318` (badges) · `--error-600` `#D92D20` (inline amounts, messages; 4.83:1 on white) | `--error-50` `#FEF3F2` | `--error-600` (danger button; error-500 with white text is only 3.76:1) |
| Info | `--blue-light-700` `#026AA2` | `--blue-light-50` `#F0F9FF` | `--blue-light-500` |
| Neutral | `--gray-700` | `--gray-100` | `--gray-400` |

"Received so far (green)" and other positive amounts use `--success-700`. "Pending/Balance (red)" amounts use `--error-600`.

### 4.2 Typography
Font: `--font-sans` = Outfit, then Rupee Fallback (₹ only, from Inter), then system UI. Self-hosted (`fonts.css`). Weights: 400, 500, 600, 700.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `--text-xs` | 12 / 18 | 400–500 | Table headers, helper and error text, badges in tables, meta lines, captions |
| `--text-sm` | 14 / 20 | 400–500 | **UI default:** inputs, buttons, labels (500), table cells, menu items |
| `--text-md` | 16 / 24 | 400 | Body copy, modal body, empty-state text |
| `--text-lg` | 18 / 28 | 600 | Card titles, dropdown/panel titles |
| `--text-xl` | 20 / 30 | 600 | Page titles, modal titles |
| `--text-2xl` | 24 / 32 | 700 | Bill total in the form footer, suggested bonus |
| `--text-3xl` | 30 / 38 | 700 | Upper bound for KPI values. KPI values scale with tile width (§4.13). |

Rules:
- **Sentence case** for page titles, card titles and field labels ("Bill date", not "BILL DATE" or "Bill Date"). Tenant-defined labels render exactly as entered.
- **Button, menu and nav labels keep their current text and casing** ("Add New", "Save All Settings", "Record Payment", "Settle Salary"). Staff know them and any e2e tests match them. Only CSS `text-transform: uppercase` is removed, so a label stored as "Login" shows as "Login". Wording changes are limited to the list in §16.
- **No letter-spacing tweaks** (the −0.022em/−0.012em tracking is removed).
- **No uppercase** except sidebar group titles.
- Amounts: `tabular-nums`, right-aligned in tables, `white-space: nowrap`. Format with `en-IN` (`₹1,23,456.00`). Unchanged.
- Never truncate an amount. If a KPI value is wider than its tile, the tile grows or the value wraps below the label.

### 4.3 Spacing, sizes, radius, elevation, motion, layers
- **Spacing:** 4px base (`--space-1…10` = 4, 8, 12, 16, 20, 24, 32, 40). Card padding 24px (20px <768). Gaps between cards 16px (<768) / 24px.
- **Control height:** 44px everywhere (inputs, selects, buttons, date pickers, icon buttons, sidebar items). This is also the minimum touch target. Compact 40px buttons (`.btn-sm`) only in card headers and table toolbars at ≥768. Dense controls that must be smaller (chip ×, table checkbox) still get a ≥24×24 hit area (WCAG 2.5.8).
- **Radius:** `--radius-sm` 6 (checkbox, chips inside inputs) · `--radius-md` 8 (controls, buttons, menu items) · `--radius-lg` 12 (icon tiles, alerts, toasts, react-select menu) · `--radius-xl` 16 (cards, dropdown panels, nested service cards, mobile list cards) · `--radius-2xl` 24 (modals) · `--radius-full` (badges, avatars, switches, chips).
- **Elevation:** cards none. `--shadow-theme-xs` on inputs and buttons. `--shadow-theme-lg` on dropdowns, menus and the hover-expanded rail. `--shadow-theme-xl` on modals. `--shadow-theme-md` on the sticky form footer.
- **Motion:** `--duration-fast` 150ms (colour, hover), `--duration` 300ms (sidebar, drawers). Easing `--ease`. Everything respects `prefers-reduced-motion`. The bill-form framer-motion slide-in stays, at ≤200ms, and is disabled under reduced motion.
- **Layers:** `--z-dropdown` 1000 · `--z-sticky` 1020 · `--z-header` 1030 · `--z-overlay` 1040 · `--z-sidebar` 1045 · `--z-modal` 1055 · `--z-popover` 1070 (row menus, react-select portals) · `--z-toast` 1090.

### 4.4 Buttons
| Variant | Class | Spec |
|---|---|---|
| **Primary** | `.btn.btn-primary` | bg `--brand-solid`, text `--on-brand`, border `--brand-solid-border`, hover `--brand-hover`, shadow xs |
| **Secondary** | `.btn.btn-secondary` (the bridge also maps `.btn-outline-secondary` and `.btn-light` to it) | white, 1px `--border-control`, text `--gray-700`, hover bg `--gray-50`, shadow xs |
| **Danger** | `.btn.btn-danger` | bg `--error-600`, white text, hover `--error-700` |
| **Danger outline** | `.btn.btn-outline-danger` | white, border `--error-300`, text `--error-600`, hover bg `--error-50` (row remove, "Delete type") |
| **Link** | `.btn.btn-link` | text `--brand-text`, no underline; hover adds an underline, colour unchanged ("Clear filters", "Add item") |
| **Icon** | `.btn.btn-icon` (new) | 44×44, `--radius-md` or round, icon 20px `--gray-500`, hover bg `--gray-100`. Required `aria-label`. Used for the row-menu (dots), close and eye-toggle icons. |

- **Sizes:** default 44px (padding 11px 16px, 14px medium). `.btn-sm` 40px (≥768 only). Full width on phones in modal footers and auth cards.
- **Icon + label:** 20px icon, 8px gap. Loading state: 16px spinner replaces the icon, label becomes "Saving…" / "Logging in…", button disabled.
- **One primary per region:** at most one primary in the page header, one in a modal footer, one in a form footer.
- **Remove** `btn-gradient` (fixed blue→purple, ignores tenant brand) and `btn-cancel`.
  - Every v1 gradient button becomes **Primary**.
  - Every `btn-cancel` becomes **Secondary**.
  - During migration only, alias them in `components/compat.css`: `.btn-gradient` = primary tokens, `.btn-cancel` = secondary tokens. Delete the aliases in phase 4.
- Pressed state: no `scale(.98)`. Use the active background colour.

### 4.5 Form controls
| Control | Spec |
|---|---|
| **Label** | `.form-label`: 14px medium `--gray-700`, 6px below. Required fields: label + " *" in `--error-600`, with `aria-required`. |
| **Text input / textarea** | `.form-control`: 44px, padding 10px 16px, 14px `--text-strong`, white bg, 1px `--border-control`, radius 8, shadow xs. Placeholder `--text-subtle`. Focus: border `--brand-300` + 3px `--focus-ring-color`. Textarea min 96px. |
| **Read-only / disabled** | bg `--gray-50`, text `--gray-700` (≈10:1, stays legible), no shadow, no opacity fade. **View mode** of bill forms keeps using `disabled` as today. The legible disabled style is what makes view mode readable. Date-picker inputs that set `readOnly` get class `picker-input` so they keep the normal look. react-select's disabled state matches (`reactSelectTheme.ts`). |
| **Invalid** | border `--error-300`, focus ring `--focus-ring-error`. Message below: 12px `--error-600`, linked via `aria-describedby`. Existing validation copy unchanged. |
| **Helper** | `.form-text`: 12px `--text-muted`, 6px below. |
| **Input with prefix/suffix** | "₹" prefix or unit suffix: Bootstrap `.input-group` + `.input-group-text` (bridge: `--gray-50` fill, `--border-control` border, 14px `--text-muted`), one rounded 44px control (TailAdmin pattern). |
| **react-select** | Theme via `reactSelectTheme.ts`. Control 44px, radius 8, border `--border-control`, shadow xs, focus = input focus. Placeholder `--text-subtle`. Menu: **portal to `document.body`** (`menuPortalTarget`), z `--z-popover`, radius 12, 1px `--border`, `--shadow-theme-lg`, padding 6px. Option: radius 8, padding 8px 12px, 14px; hover `--gray-100`; selected `--brand-50` + `--brand-text` + check icon. Multi-value chip: `--gray-100` bg, radius 6, 12px medium `--gray-700`, × 14px. "-- All --" stays as the clearable empty option. |
| **Date input** | Native `type="date"` styled as `.form-control`, 20px calendar icon right in `--gray-500`. The Radiator "calendar picker" panel: radius 16, `--shadow-theme-lg`, selected day `--brand-solid` / `--on-brand`, today ring `--brand-300`, range fill `--brand-50`. |
| **Checkbox / radio** | 20px, radius 6 / round, border `--border-control`, checked `--brand-solid`. Labels 14px `--gray-700`; the label is clickable, so the target is the whole row (≥44px tall in forms). |
| **Switch** | `.form-switch`: track 44×24 round, off `--gray-200`, on `--brand-solid`; thumb 20px white + shadow-sm. Label right, 14px. |
| **Field layout** | Forms use a 2-column grid at ≥768 (`.col-md-6`), 1 column below. Gap 20px vertical, 24px horizontal. |
| **Password eye toggle** | A real `<button type="button" aria-label="Show password" aria-pressed>` inside the control, replacing the `span role="button"` (v1 §12.14). |

### 4.6 Card
`.card`: `--surface`, 1px `--border`, radius 16, **no shadow**.
- **Header** (`.card-header`, optional): padding 16px 24px, no fill. Title 18px semibold `--text-strong` + subtitle 14px `--text-muted`. Actions right (`.btn-sm`). Bootstrap's 1px bottom border (`--border`) is kept. For a card with a title but no divider, put the title inside `.card-body` instead of using `.card-header`.
- **Body:** padding 24px (20px <768).
- **Nested card** (bill service blocks, settings sub-sections): radius 16, 1px `--border`, padding 16px, white on `--surface`. The v1 "bordered blocks" become nested cards.
- **Section divider** (v1 "Services", "Items", "Expenses"): label 14px semibold `--text-strong` + 1px `--border` rule filling the rest of the line, 24px above, 16px below. The legacy grey uppercase label is dropped.

### 4.7 Data table (desktop ≥768)
- **Container:** the table sits inside a card. Toolbar / filter bar in the card header area, then the table, then the pagination footer. Horizontal overflow: a `.table-wrap` with `overflow-x: auto` and a thin scrollbar (6px, `--gray-200` thumb).
- **Header row:** 12px/18px medium `--text-muted`, **sentence case** (not uppercase), `white-space: nowrap`, padding 12px 20px, top + bottom border `--border-subtle`, no fill.
- **Body rows:** padding 16px 20px, 14px `--text-muted`, separators `--border-subtle`, hover bg `--gray-50`. **Key cell** (truck / vehicle number, person name, business name): 14px medium `--text-strong`. First column 24px left padding at ≥1280.
- **Numbers:** `td.num` / `th.num` are right-aligned, `tabular-nums`, nowrap. Dates and SI No are nowrap. Text cells wrap (no ellipsis on tenant labels or service lists).
- **Footer (totals):** bg `--surface-muted`, 14px semibold `--text-strong`.
- **Selection column** (bonus): 20px checkbox, 48px column.
- **Expandable row:** 20px chevron button (`aria-expanded`) in the first cell. The expanded content row has bg `--surface-muted` and inner padding 16px 24px. The nested mini-table uses the same table styles at 12px header / 14px cell, inside a white nested card.
- **Row actions:** last column, 48px, right-aligned dots icon button (`aria-label="Actions for {key}"`) → **Row menu** (§4.11). The cell gets class `cell-actions` (4px vertical padding), so the 44px button doesn't stretch the row (measured: 77px without it, ≈52px with it). The same applies to cells with an inline `.btn-sm` (bonus "Issue").
- **Column visibility ("Cols", radiator bills):** secondary `.btn-sm` with a columns icon → dropdown of checkboxes (14px), "Reset" link at the bottom. Choice persisted per tenant in `localStorage` (as today if it already persists).
- **No sticky table header.** `position: sticky` cannot follow the page while the table sits in a horizontal scroll wrapper (the wrapper becomes the scroll container). Lists are paginated, so it isn't needed. (Settings matrices are the exception, §10.6.)

### 4.8 Mobile data list (<768) — all lists, all verticals
This generalises the Engineering phone pattern (v1 §9.2) to every list (fixes v1 §12.13).

```
┌───────────────────────────────────────────┐
│ TN 37 AB 1234                [Partial] ⋯  │  key 16px semibold, badge, row-menu icon button
│ 04/10/2026 · Bill 812 · Ramesh            │  meta 12px --text-muted
│ Total          Received        Balance    │  12px labels
│ ₹12,450.00     ₹8,000.00       ₹4,450.00  │  14px medium tabular; balance --error-600 if >0
└───────────────────────────────────────────┘
```
- Card: radius 16, 1px `--border`, padding 16px, 12px gap between cards. The whole card is tappable (→ View). Implement this as a real link on the key text, stretched over the card with Bootstrap's `.stretched-link`, not as `onClick` on a `<div>`, so it works with keyboard and screen readers. The row-menu button sits above it (`position: relative; z-index: 2`).
- SI No is hidden. Column-visibility settings are ignored on phones.
- Per-screen card content is defined in each screen's **Layout** block.
- Totals footer rows (bonus, expenses summary) become a summary card above the list.

### 4.9 Filter bar
- Lives at the top of the list card, padding 16px 24px, bottom border `--border`.
- **≥1280:** CSS grid `repeat(auto-fill, minmax(180px, 1fr))`, gap 12px. Search first, spanning 2 columns, with a 20px search icon prefix. Labels above controls (`.form-label`, 12px variant allowed here: 12px medium `--text-muted`). Last cell: **Clear filters** link button, shown only when any filter differs from its default. Then the **Cols** button (radiator bills).
- **768–1279:** row 1 = search + up to 2 primary filters + a "Filters (n)" secondary button that expands the remaining filters inline below (Engineering's "More filters / Hide filters" pattern, generalised).
- **<768:** search full width + a "Filters (n)" button opening a **bottom sheet** (radius 24 top corners, max-height 85vh / 85dvh, scrollable) containing all filters stacked, "Clear filters" and a primary **Done** button. Filters still apply instantly as they do today. Done only closes.
- `(n)` = count of non-default filters, shown as a `--brand-50` / `--brand-text` count badge.
- **Search rule unchanged** (debounce 200ms, fires at ≥3 characters or when cleared), **plus** a helper when 1–2 characters are typed: "Type at least 3 characters" (12px `--text-muted`) (fixes v1 §12.10).
- Summary strip (Expenses: "37 expenses — Total: ₹48,250.00") sits between the filter bar and the table: 14px `--text-muted` with the total in 14px semibold `--text-strong`.

### 4.10 Pagination footer
- Padding 12px 24px, top border `--border-subtle`. Flex, space-between, wraps on phones.
- **Left:** "Rows per page" (14px `--text-muted`) + a standard 44px **select** (10 / 20 / 30 / 50 / 100, ~88px wide), replacing the number input + datalist (fixes v1 §12.9). Then "1–10 of 245" (14px `--text-muted`, tabular).
- **Right:** "Page 3 of 25" (14px) + prev/next **icon buttons** (44px, matching the select; secondary outline; `aria-label="Previous page"` / `"Next page"`; disabled at the ends).
- **<768:** "Rows per page" is hidden. Range text left, prev/next right.
- Employees keeps no pagination (2–20 rows; v1 §14 volumes). This is deliberate, not an inconsistency.

### 4.11 Menus (row actions, user menu, "More", column picker)
- `.dropdown-menu`: rendered in a **portal** (as today), radius 16, 1px `--border`, `--shadow-theme-lg`, padding 8px, min-width 200px.
- Item: radius 8, padding 8px 12px, 14px medium `--gray-700`, 20px icon `--gray-500`, 12px gap. Hover/focus bg `--gray-100`.
- **Destructive** item (Delete, Remove, Delete Permanently): text + icon `--error-600`, hover bg `--error-50`. Separated from other items by a divider (`--border-subtle`, 4px margin).
- Disabled item ("Record Payment" when nothing is pending): `--gray-400`, `aria-disabled`. The reason is shown **as visible text** under the label (12px `--text-muted`: "Fully paid"). A `title` tooltip never appears on touch devices.
- Keyboard: Enter/Space opens, ↑/↓ moves, Esc closes and returns focus to the trigger.
- Row-action order everywhere: View · Edit · Print · Record Payment · divider · Delete.

### 4.12 Badges
`.badge`: pill, padding 2px 10px, 12px/18px medium.

| Status | Tone |
|---|---|
| Payment: Received / Partial / Not Received | success / warning / error |
| Bonus: Paid / Pending | success / warning |
| Employee: Active / Inactive | success / **neutral** |
| Client: Active / Suspended | success / **neutral** |
| Attendance: Present / Half Day / Absent / Leave | success / warning / error / info |
| Import: created / skipped / error | success / neutral / error |

**Category badges** (expense type Materials / Others, client type Radiator / Automobile / Engineering, engineering service-type pills, BS model) are **neutral**: `--gray-100` bg, `--gray-700` text. **Status colours are reserved for status** (fixes v1 §12.4).

Optional 6px status dot before the label (same hue, 500 step) for scanability. The text alone must carry the meaning.

### 4.13 KPI tile (metric card)
TailAdmin metric card. Replaces both the radiator "centred icon" tile and the engineering "icon-left" tile.
```
┌──────────────────────────┐
│ [■ icon 48]              │  icon tile 48×48, radius 12, 24px icon
│                          │  (20px gap)
│ Total Revenue            │  14px --text-muted
│ ₹12,34,567.00            │  bold --text-strong, tabular, size scales with tile
└──────────────────────────┘
```
- Card padding 16px (<576), 20px (576–767), 24px (≥768). No deltas or trend pills (that data doesn't exist; do not invent it).
- **Icon tile tones:** neutral `--gray-100` + `--gray-800` (default) · brand `--brand-50` + `--brand-text` (Billed, Revenue) · success `--success-50` + `--success-700` (Collected, Received) · error `--error-50` + `--error-700` (Pending, Outstanding). Pending/Outstanding values are also coloured `--error-600` (v1 "Pending (red)").
- **Grid:** 6 tiles → 2 columns <768, **3 columns at every width ≥768** (2 rows). 4 tiles → 2 columns <1280, 4 columns ≥1280.
- **Value size scales with the tile** (it must never overflow or wrap mid-number): put `container-type: inline-size` on the element that **carries the tile padding** (`cqi` measures that element's content box; putting it on an outer unpadded wrapper makes values touch the edge). The value uses `font-size: clamp(16px, 12cqi, 30px); line-height: 1.25; white-space: nowrap`. Fallback without container queries: 24px.
  - Why: measured in Outfit 700, "₹1,23,45,678.00" is 229px wide at 30px and 183px at 24px. Fixed sizes overflowed in three layouts: 6 columns at 1536px (132px inside the tile), 4 columns at 1280px with the sidebar open (170px), and 2 columns on a 390px phone (131px).
  - With the clamp rule, "₹1,23,45,678.00" was rendered and fits every layout with room to spare (tightest: a 360px phone, 163px text in 170px).
- Loading: skeleton (§4.17).

### 4.14 Charts (Recharts)
Centralise in `chartTheme.ts`; read token values from CSS variables (`var(--…)` works in Recharts `fill`/`stroke`, as the current code already does).
- **Chart card:** card header = title (18px semibold) + subtitle/caption (14px `--text-muted`) + right-side control (segmented / "Granularity"). Body height 300px (≥768) / 240px (<768). Donuts 260px. The card is a size container: below 480px card width, the donut legend list moves **under** the donut and the header control wraps under the title (a `col-xl-4` card is only ≈298px wide at a 1280 viewport with the sidebar open).
- **Grid:** horizontal lines only, `--gray-100`, solid. No vertical lines.
- **Axes:** no axis line, no tick lines. Ticks 12px `--text-muted`. Y-axis amounts use the **compact Indian formatter** from Engineering (1.5k / 1L / 1.2Cr) on all dashboards.
- **Tooltip:** white, 1px `--border`, radius 8, `--shadow-theme-sm`, padding 12px. Title 12px medium `--text-strong`. Rows 12px `--text` with 8px colour dot, values medium tabular.
- **Legend:** 14px `--gray-700`, 8px round markers, 16px gap, top-right of the card on desktop, below the chart on phones.
- **Bars:** top radius 4px, max bar width 24px, category gap 30%. Horizontal bars: right radius 4px, bar thickness 16–20px, label left 14px `--text`.
- **Series colours:**
  - **Paired comparison** (Revenue vs Collected, Billed vs Received): `--brand-500` + `--brand-300` (TailAdmin pairing).
  - **Payment status donut:** Received `--success-500`, Partial `--warning-500`, Not Received `--error-500`.
  - **Categorical** (service mix, product mix, expense types, by mechanic), in order: `--brand-500`, `--accent`, `--blue-light-500`, `--warning-500`, `--theme-purple-500`, `--success-500`, `--theme-pink-500`, `--orange-500`. Beyond 8 slices, group the rest as "Other" in `--gray-400`.
  - **Area** (monthly expenses, revenue timeline): stroke `--brand-500` 2px, fill gradient `--brand-500` from 20% to 0%.
  - **Remove** hard-coded `#36b37e`, `#6554c0`, `#f47f6b`, `#f0f0f0` (fixes v1 §12.2).
- **Donut:** inner radius 70%, centre label total (20px semibold `--text-strong`) + caption (12px `--text-muted`). Custom legend list beside it (Engineering pattern): dot · name · % · amount (tabular), on all dashboards.
- **Empty:** centred empty state (§4.17) inside the chart body: "No data for this period" + "Try a wider date range."

### 4.15 What does NOT change visually
**jsPDF output**: A5 invoices (all three variants), the A4 radiator summary report, A5 payslips, and Excel/PDF exports. The invoice design is part of each tenant's brand and is printed daily. PDF table headers keep using the tenant primary (read `--primary` / settings as today). Any redesign of printed output is a separate project.

### 4.16 Modal
- Built on the existing conditionally-rendered `.modal` markup, wrapped in a shared `<Modal>` component that adds the a11y below.
- **Backdrop:** `--overlay` (gray-400 at 50%). Optional `backdrop-filter: blur(8px)`, off on devices that report `prefers-reduced-transparency`. TailAdmin's 32px blur is too heavy for low-end tablets.
- **Panel:** white, radius 24, `--shadow-theme-xl`. Widths: **sm** 400px (confirm/delete), **md** 480px (default: record payment, reset password, adjustment), **lg** 700px (`.modal-lg`) (expense, employee, add client, view settings, import results). Max-height `calc(100vh - 40px)`, then `calc(100dvh - 40px)` where supported. The body scrolls; header and footer stay fixed.
- **Header:** padding 24px 24px 0. Title 20px semibold `--text-strong` (+ optional 14px `--text-muted` description). Close = 44px round icon button (close icon), top-right, `--gray-100` bg, `aria-label="Close"`. Bootstrap's `.btn-close` is restyled to exactly this by the bridge.
- **Body:** padding 24px. **Footer:** padding 0 24px 24px. Buttons right-aligned, gap 12px: Cancel (secondary) then confirm (primary or danger).
- **<576:** panel is full width with a 12px margin. Footer buttons stack full width with the confirm action on top.
- **Accessibility (fixes v1 §12.12):** `role="dialog"`, `aria-modal`, `aria-labelledby`. Focus moves to the first field (or to the confirm button for confirms). Focus is trapped. **Esc closes** (except while submitting). Focus returns to the trigger. Body scroll is locked.
- **Danger confirm** (delete bill, delete client): title in `--text-strong` with a 48px `--error-50` icon tile (`--error-600` icon) above it. The message names the record (copy unchanged). Danger button.
- **Native `confirm()` is removed** (Engineering "Discard this bill?") and replaced with the sm confirm modal, same copy.

### 4.17 Feedback & states
- **Alert / callout** (inline, e.g. bonus "No bonus is accruing…"): radius 12, 1px border in the 500 step at 30% opacity, 50-step background, padding 16px. 20px icon in the 600/700 step. Title 14px semibold `--text-strong`. Text 14px `--text-muted`. Optional link 14px medium underline.
- **Toast** (`AlertComponent` replacement): same anatomy + white bg + `--shadow-theme-lg`, width 360px.
  - Position: fixed, top-right, 16px below the header (top, full width minus 16px on phones). Stacks with an 8px gap. z `--z-toast`.
  - Success and info auto-dismiss after 5s (paused on hover/focus). Warning and error stay until closed.
  - `role="status"` (success/info) or `role="alert"` (error), plus a close icon button.
- **Loading (fixes v1 §12.11): no full-screen loader for fetches.**
  - Lists: keep the card, filter bar and pagination. Replace the rows with **5 skeleton rows** (gray-100 bars, 12px tall, radius 6, pulse 1.5s; static under reduced motion). Phone: 3 skeleton cards.
  - Refetch on filter/page change: keep the current rows at 50% opacity plus a 2px indeterminate brand bar at the top of the card. Do not blank the table.
  - KPI tiles and charts: skeleton blocks of the same size.
  - Form submit: button loading state, other actions disabled. The form stays visible.
  - **The full-screen overlay stays only for:** login transition, and PDF/Excel generation ("Preparing PDF…" in a white tile, radius 16).
- **Empty state:** centred in the card body, padding 48px 24px. 48px icon tile (neutral), title 16px semibold `--text-strong`, text 14px `--text-muted`, optional action button. Two variants for every list, using Engineering's copy pattern:
  - **No data yet:** "No bills yet" / "Create your first bill…" + primary action.
  - **No matches:** "No records match these filters" / "Try a different {vehicleNo}, {agent} or date range." + "Clear filters" link.
- **Error state:** same layout with an error-tone icon tile: "Couldn't load {thing}" / "Check your connection and try again." + Retry (secondary).

### 4.18 Other components
- **Segmented control** (Engineering date presets, dashboard chart toggles): track `--gray-100`, radius 8, padding 2px. Items 40px tall (44px total with the track padding), padding 0 12px, 14px medium `--text-muted`. Active: white bg, `--text-strong`, `--shadow-theme-xs`, radius 6. `role="tablist"` / `role="tab"` with arrow-key navigation.
- **Settings tabs:** the same segmented style, scrolling horizontally with fade edges when it overflows (6 tabs at 768–1279). **<768:** replaced by a full-width select labelled "Section".
- **Chips / tag input** (mechanics, labour, highlight lines, units, BS models): chip 28px, padding 0 10px, radius full, `--gray-100`, 14px `--gray-700`. × is a 16px icon inside a 24×24 button (`aria-label="Remove {name}"`, keyboard reachable). Drag handle 16px `--gray-400`, with keyboard reorder via a "Move up/down" option in a chip menu. Input: standard control, "Type and press Enter".
  - "Add model" chip: dashed 1px `--border-control`, text `--brand-text`.
  - Inline rename: the chip becomes a 28px input.
- **Quick-add chips** (Engineering form): secondary chip with a "+" icon, hover `--brand-50` / `--brand-text`.
- **Progress bar** (collection rate): 8px tall, radius full, track `--gray-100`, fill `--brand-500`. Label "₹X of ₹Y" 14px tabular above, right-aligned %.
- **Upload with preview** (logo, QR, signature, login background): if the current code uses a plain `.form-control` file input, the bridge already styles it (flush "Choose file" button). The target is a dashed 1px `--border-control` drop zone, radius 12, padding 24px, 14px text "Drop image or browse" + size limit 12px `--text-muted`. Preview tile 96px with a remove icon button and "Replace" link. Error copy unchanged (≤1MB / ≤4MB).
- **Colour picker** (Branding): `<input type="color" class="form-control form-control-color">` (44px square swatch, sized by the bridge) + hex input. Below it, a **live preview row** (primary button, active nav item, badge) rendered from `buildBrand()`. If the guard had to adjust the colour, show a 12px `--text-muted` note: "Adjusted slightly for readability." No functional change: it saves the colour the tenant picked.
- **Sticky form footer** (all three bill forms, settings): `position: sticky; bottom: 0` (in normal flow at the end of the form; no page padding needed), white, top border `--border`, `--shadow-theme-md`, padding 12px 24px, z `--z-sticky`. Left: "Total amount" 12px `--text-muted` over the total in `--text-2xl` bold `--brand-text` (tabular). Right: Cancel (secondary) + Save (primary). Phone: buttons share the row 50/50 and the total sits above them.
- **Icons** (all arrows, chevrons, dots, close, check: see D12): keep the `Icons.tsx` sprite (`receipt-text`, `currencyrupee`, `trendingup`, `clock`, `print`, `edit`, `delete`, `view`, `exporticon`, …) + react-icons. Sizes: 16 (inline in badges/chips), 20 (buttons, inputs, menus), 24 (sidebar, KPI tiles, empty states). Always `currentColor`. Icon-only controls must be `<button>` with `aria-label`.

### 4.19 As-built → target mapping (what to delete)
| As-built (v1 §4) | Target |
|---|---|
| `base-theme.css`, `common.css`, `apple-rebrand.css`, `admin.css`, `engineering.css` (`eng-` tokens) | `theme.css` + `bootstrap-bridge.css` + `components/*.css`. Engineering's TailAdmin-like tokens become the app-wide system. |
| `style.css` (2,700 lines, legacy) | Removed screen by screen. Delete when empty (phase 4). |
| `responsive.css` | Breakpoint rules move into each component file. |
| `--ink-*`, `--canvas`, `--line*` | gray scale + role tokens (§4.1). Note: `--surface` and `--surface-sunken` exist in both systems with near-identical values (`#FFF`, `#F2F2F5` → `#F2F4F7`); theme.css loads last and wins. |
| `--primary-soft` / `--primary-softer` | `--brand-50` / `--brand-25` |
| `--focus-ring` (3px, 18% primary; a full shadow value) | `--focus-ring-color` (a colour, generated from `--brand-text` at 20%). Different name on purpose: no collision while legacy CSS still loads. |
| SF Pro / Inter font stack, 15px base, negative tracking | Outfit + ₹ fallback, 14px UI / 16px body, no tracking |
| Glass nav (72% white + 20px blur) | Solid white header with a 1px border |
| Modal radius 22, nav glass, `btn` press scale | Modal radius 24, no blur nav, no scale |
| Uppercase grey table headers | Sentence-case 12px medium headers |
| Full-screen loader for every fetch | Skeletons / in-card loading (§4.17) |

---

## 5. Shared business rules that drive UI *(unchanged; visual notes added)*

- **Payment status** is derived, never picked: *Not Received → Partial → Received* from received vs. net total.
- **Record Payment** (all verticals): shows Total/Net, Received so far (green → `--success-700`), Pending (red → `--error-600`). Inputs: *Discount (₹, optional — reduces amount owed)* and *Amount received now (₹)* with "Up to ₹X" placeholder. Shows "Pending after discount" when a discount is entered. Engineering adds **Payment mode** (Cash/UPI/Card/Bank/Other). Disabled when nothing is pending.
  - *Layout:* md modal. Top: a 3-cell summary strip (`--surface-muted`, radius 12, padding 16px; label 12px / value 16px semibold tabular). Then fields (₹ prefix inputs). Payment mode is a segmented control (5 options; wraps to 2 rows <576). "Pending after discount" is a 14px line under the discount field.
- **"Requires comment" services/items** (e.g. "Other"): the line asks for a description, and the **description replaces the label** everywhere it is shown (tables, exports, invoices).
- **Delete** is always a confirm modal naming the record ("Delete bill for TN01AB1234 dated 04/10/2026? This cannot be undone."). *Layout:* sm danger confirm (§4.16).
- **Exports** (Excel via SheetJS, PDF via jsPDF) always export *all records matching the current filters*, not just the visible page. The PDF table header uses the tenant primary colour. *Layout:* secondary buttons in the page header ("More" menu on phones), with the full-screen "Preparing…" overlay while generating.
- **Printing** generates PDFs in-browser (unchanged, §4.15):
  - **Invoice (A5 portrait)** per bill:
    - masthead (logo + company + address/phones, bill title/no/date);
    - "BILLED TO" / "DETAILS" blocks;
    - line items and totals;
    - optional **"Scan to pay" QR** (uploaded image or generated from UPI ID) with "PAY VIA" text;
    - optional **signature** above "Authorised signatory";
    - footer note.

    Variants for radiator, automobile and engineering.
  - **Summary report (A4):** Radiator only, over filtered bills. Revenue, payment position, breakdowns by model / service / mechanic.
  - **Payslip (A5):** salary settlement.
- **Bonus engine:** every bill accrues bonus for its mechanic (and, for radiator/automobile, its labour, split equally). Bonus is *payable in proportion to the amount collected*. Issuing ("Mark paid") locks entries against future bill edits.
- **Salary:** net = base salary × present days ÷ working days − advances − deductions. Settling locks the period. Later changes are append-only **adjustments**.

---

## 6. Authentication screens

### 6.1 Tenant login — `/issueCounter/login`, `/t/:code/login`
*Functional (verbatim from v1):*

- **Layout:** full-bleed background — tenant's uploaded image with a slow Ken-Burns zoom, or a `primary → accent` 135° gradient when none. Dark left-to-right scrim + brand-tinted overlay.
  - **Left brand panel (≥992px only):** time-of-day eyebrow ("Good morning/afternoon/evening"), huge company name (36–60px, in tenant `loginTextColor`), a **rotating highlight line** that fades every 4.2s (tenant-configured lines, else defaults: "Billing, expenses & bonuses in one place", "Every payment, tracked", "Your workshop, organized").
  - **Right glass card (max 420px):** logo (64px) or initials tile or lock icon, company name, "Sign in to continue".
- **Fields:** Business Code (pre-filled + read-only on `/t/:code/login`), User ID, Password (show/hide eye toggle, min 6). Inline error under each field; general error above the button.
- **Button:** full-width pill "LOGIN" in **accent** color; "Logging in..." while submitting.
- **After login:** forced to `/change-password` if `mustChangePassword`, else dashboard (redirected per vertical).
- Respects `prefers-reduced-motion`.

*Layout (new):*
- Keep the full-bleed background, scrim and left brand panel. The brand panel text stays on the scrim.
- **Card:** **solid white** (no glass), radius 16, `--shadow-theme-xl`, padding 32px (24px <576), max-width 420px. Right-aligned at ≥992, centred below.
  - Title: company name 24px semibold `--text-strong`. "Sign in to continue" 14px `--text-muted`.
  - Fields: standard 44px controls with labels. Read-only Business Code uses the read-only style plus a 16px lock icon.
  - Button: full-width 44px, radius 8 (not a pill), bg `--accent-solid`, text `--on-accent`, hover `--accent-hover`. Label text unchanged; only the CSS uppercase is removed (§4.2).
- The brand panel company name gets a contrast check (large text needs 3:1). The photo underneath is unknown, so test against the **worst case**: the scrim colour at its lightest point, composited over white. With the current dark scrim, that is roughly `#000` at the scrim's minimum opacity over `#FFF`. If `contrast(loginTextColor, thatColour) < 3`, use white. Reuse `contrast()` from `applyTenantBrand.ts`.
- Call `applyTenantBrand()` with the tenant's colours as soon as the tenant code resolves. The generic `/issueCounter/login` (no tenant yet) uses the defaults.

### 6.2 Change password — `/change-password`
*Functional (verbatim from v1):*

Centered card (max 440px), no app chrome. Title + subtitle ("For security, please set a new password before continuing." when forced). Fields: Current, New (≥6), Confirm. Buttons: Cancel (hidden when forced) + "Change Password".

*Layout:* no shell, `--page-bg`, centred card max-width 440px, radius 16, padding 32px. Tenant logo/initials (40px) above the title. Title 20px semibold. Buttons full width on phones, right-aligned at ≥576.

### 6.3 Super-admin login — `/admin/login`
*Functional (verbatim from v1):*

Centered card: shield emblem, eyebrow "Super Admin", "Console sign-in", "Manage clients & platform access". Fields: User ID, Password (eye toggle). Accent pill button "SIGN IN".

*Layout:* same card as 6.2 on `--page-bg`. Shield in a 48px `--brand-50` tile. Eyebrow 12px medium `--text-muted`. Button: full width, `--accent-solid` / `--on-accent` (same as the tenant login, default colours). Label text unchanged.

---

## 7. Radiator vertical

### 7.1 Dashboard — `/issueCounter/dashboard`
*Functional (verbatim from v1):*

- **Filters card:** From (default = FY start), To (default today, max today), Mechanic, Product model, Status. Helper: "Mechanic / Product / Status filters apply to billing only. Expense stats always use the date range above."
- **Billing KPIs (6 tiles):** Total Bills · Total Revenue · Collected · Pending (red) · Collection Rate % · Avg Bill Value.
- **Charts:** Monthly Revenue (grouped bars: Revenue vs Collected, 8/12 width) · Payment Status (donut, 4/12) · Service Type Mix (pie, ½) · *{Product}* Mix (horizontal bars, ½) · Top Mechanics by Revenue (horizontal bars, full).
- **"Expenses" section** (divider): 4 KPIs — Total Expenses · Materials · Others · Payroll (read-only from Salary) — then Expense Type Breakdown (pie, 5/12) and Monthly Expenses (area, 7/12).
- Every filter change refetches; no explicit Apply button.

*Layout (new):*
- Page header "Dashboard".
- **Filter card** (filter bar §4.9 in a standalone card; helper text below it, 12px `--text-muted`).
- 6 KPI tiles (§4.13). Tones: Revenue = brand, Collected = success, Pending = error, others neutral.
- **Chart rows:**
  - Monthly Revenue `col-xl-8` + Payment Status donut `col-xl-4`.
  - Service Type Mix (donut + legend list) `col-lg-6` + *{Product}* Mix (horizontal bars) `col-lg-6`.
  - Top Mechanics (horizontal bars, height = 40px × rows, min 240) `col-12`.
- **Section divider "Expenses"**, then 4 KPI tiles (Total Expenses = neutral, Materials and Others = neutral, Payroll = neutral with a "From Salary" 12px caption), then Expense Type Breakdown `col-xl-5` + Monthly Expenses (area) `col-xl-7`.
- Columns marked `col-xl-*` stack full width below 1200. `col-lg-6` pairs stack below 992.

### 7.2 Bills list — `/issueCounter/billing`
*Functional (verbatim from v1):*

- **Header actions:** Excel · PDF · **Report** (A4 summary) · **Add New** (primary).
- **Filters:** Search *{vehicleNo}* · Mechanic · *{Product}* · Service Type · Status · From · To · Clear · **Cols** (toggle any of 11 columns).
- **Columns:** SI No · Date · *{vehicleNo}* · *{party}* · *{product}* · Mechanic · Services (comma list) · Total · Received · Pending (red + bold when > 0) · Phone · Status (badge) · Action (⋯ View / Edit / Print / Record Payment / Delete).
- **Empty:** "No Records Found". Paginated (default 10).
- **Modals:** Record Payment (§5), Delete confirm.

*Layout (new):*
- Page title **"Bills"** (was "Billing"; matches the nav, v1 §12.5). Actions: Excel · PDF · Report (secondary; "More" menu on phones) · **Add New** (primary, plus icon).
- Card: filter bar → table (§4.7) → pagination.
  - Key cell: *{vehicleNo}*.
  - Total / Received / Pending are `.num`. Pending > 0 uses `--error-600` semibold (v1: red + bold).
  - Services wrap. Status is a payment badge.
- Empty states per §4.17. "No Records Found" becomes the two-variant empty state.
- **Phone card:** key = *{vehicleNo}*. Meta = Date · *{product}* · Mechanic. Second meta line = Services (12px, max 2 lines). Amounts = Total / Received / Pending. Badge = status.

### 7.3 Bill form — create / view / edit
*Functional (verbatim from v1):*

- **Header:** small title strip ("Create Bill" / "Edit Bill" / "View Bill"). Content slides in from the right (framer-motion).
- **Fields (2-column ≥1200px):** Create Date* (calendar picker) · *{vehicleNo}** · *{party}** · *{agent}** (select from settings mechanics) · *{product}** (select) · *{worker}** (multi-select labour, ≥1) · Phone Number (optional, 10 digits).
- **"Services" section:** "Add New Service" button; repeating bordered blocks, each: Service Type* (select; already-used types removed from other rows) · Price (₹)* (auto-filled from the price matrix when both product and service are chosen; re-applied if the product changes) · Remove (when >1 row). "Requires comment" types blank the price and show a **Comment*** textarea.
- **Bill total** right-aligned, large.
- **Footer:** Cancel/Back + Save/Update. View mode: everything disabled, only Back.
- On save → back to the bills list with a success toast.

*Layout (new):*
- Back link (icon + "Bills"). Title "Create bill" / "Edit bill" / "View bill" (page title, so sentence case). View mode: header actions unchanged from today (Back only). Adding Print/Edit there is proposal P8.
- Card "Bill details": 2-column grid ≥768. Label "Create Date" becomes **"Bill date"** (v1 §12.5; all verticals).
- Card "Services": section header with "Add New Service" (secondary `.btn-sm`, plus icon). Each service = nested card: Service type (select) | Price (₹ prefix, `.num`) | remove (danger-outline icon button) in a row ≥768, stacked below. Comment textarea spans full width under it.
- **Sticky form footer** (§4.18) with the bill total, replacing the in-page "Bill total right-aligned, large". Cancel/Back + Save/Update.

---

## 8. Automobile vertical

### 8.1 Dashboard — `/automobile/dashboard`
*Functional (verbatim from v1):*

Same pattern as radiator, billing only (no product filter, no expenses section): filters From/To/*{agent}*/Status; 6 KPIs; Monthly Revenue + Payment Status; Top *{agent}*s by Revenue.

*Layout:* as §7.1 without the product mix and expenses rows.

### 8.2 Bills list — `/automobile/billing`
*Functional (verbatim from v1):*

- **Header:** Excel · Add New (no PDF / Report).
- **Filters:** Search *{vehicleNo}* · *{agent}* · Status · From · To · Clear (no Cols toggle).
- **Columns:** SI No · Date · Bill No · *{vehicleNo}* · *{customer}* · *{agent}* · Items ("Engine oil (4 L), Filter (1 pcs)") · Total · Received · Pending · Status · Action (same 5 actions).

*Layout:* as §7.2. Title "Bills". Bill No is `.num` (monospace not needed).
**Phone card:** key = *{vehicleNo}*. Meta = Date · Bill {no} · *{agent}*. Second meta = *{customer}*. Then amounts and badge.

### 8.3 Bill form
*Functional (verbatim from v1):*

- **Fields:** Bill Date* · Bill No (read-only, "auto-assigned") · *{vehicleNo}** · *{customer}* · *{agent}** · *{worker}* (multi) · Phone Number · Notes.
- **"Items" section:** "Add Item"; each block: **Particulars*** = a part picker (from Parts Catalog, fills unit + rate) *plus* a free-text name field below it ("Or type item name freely"; typing clears the picked part) · Qty* · Unit (select from settings units) · Rate (₹)* · Amount (₹)* (qty × rate; editable) · Remove.
- **Bill total** + Cancel/Save as radiator.

*Layout (new):* as §7.3. Label "Bill date". Notes spans 2 columns.
- **Item nested card:**
  - Row 1: part picker (full width), with the free-text field directly under it and helper "Or type item name freely".
  - Row 2 (≥768, 4 columns): Qty | Unit | Rate (₹) | Amount (₹), then the remove icon.
  - Phone: Qty + Unit on one row, Rate + Amount on the next.

  Amounts are `.num`.
- Sticky footer total.

---

## 9. Engineering Works vertical

### 9.1 Dashboard — `/engineering/dashboard`
*Functional (verbatim from v1):*

- **Header:** "Dashboard" + **New service** (primary).
- **Range bar card:** segmented presets **Today / This month / This FY** (active state auto-detected from the dates) + From → To date inputs.
- **KPIs (4, icon-left tiles):** Bills · Billed (primary tone) · Received (success) · Outstanding (danger).
- **Grid:** Revenue by month (Billed vs Received bars, caption, compact Indian axis labels 1.5k / 1L / 1.2Cr; 8/12) · By service type (donut + custom legend list with %, amount; caption = total; 4/12) · Revenue by mechanic (horizontal bars, height grows with rows; full).
- **Empty panel:** "No data for this period / Try a wider date range."

*Layout:* the page header holds the primary action. The range bar card holds the segmented control (§4.18) + From and To inputs inline, separated by an arrow icon (stacked on phones).
- 4 KPI tiles (value size per §4.13). Tones: Billed = brand, Received = success, Outstanding = error, Bills = neutral.
- Charts: `col-xl-8` + `col-xl-4`, then `col-12`.
- This screen is closest to the target already. Migrate it to the shared components and delete its `eng-` styles.

### 9.2 Bills list — `/engineering/billing`
*Functional (verbatim from v1):*

- **Header:** Excel · Add New.
- **Filters:** Search *{vehicleNo}* · *{agent}* · Status; phone shows a **"More filters / Hide filters"** toggle revealing Service type · BS model · From · To · Clear.
- **Columns:** SI No · Date · Bill No · *{vehicleNo}* · *{agent}* · Types (light pill per service type) · Total (net) · Received · Balance (red when > 0) · Status · Action (View / Edit / Print / Record Payment / Delete).
- **States:** loading skeleton (3 bars); **error** ("Couldn't load bills / Check your connection and try again." + Retry); **empty** — no filters: "No bills yet / Create your first service bill…" + New service; with filters: "No bills match these filters / Try a different truck number, mechanic or date range." + Clear filters.
- **Phone (<768):** table becomes a stack of cards — truck number large and bold on top, status badge top-right, labelled Bill no / Date / Mechanic / Total / Received / Balance, SI No hidden.
- **Record Payment modal** includes Payment mode; full-width footer buttons on phone.

*Layout:* as §7.2, using the generalised filter bar (§4.9) and mobile list (§4.8). Types are **neutral** category badges (§4.12). Phone card: key = truck number. Meta = Date · Bill {no} · Mechanic. Amounts = Total / Received / Balance.

### 9.3 Service form — create / view / edit
*Functional (verbatim from v1):*

- **Title:** "Turbo & air compressor service" (create) / "Edit service" / "View service"; subtitle "BS-IV / BS-VI service work record · Bill no. 812".
- **Header fields (2 columns, uppercase small labels):** Create date* · Truck number* (auto-uppercased; on blur **looks up the vehicle** and pre-fills address + phone from its last bill) · Lorry address · Mechanic name* · Phone number (digits only, max 10) · **BS model** (one per bill; changing it re-prices every line and drops items not offered for that model; shows "Mixed" for legacy bills).
- **Services:** "Add New Service"; optional **Quick add:** chips ("Turbo · Cartridge") that add a line to the right card (creating it if needed). Each **service card:** Service type (select) · Work / service items (multi-select checklist; disabled until a type is chosen; only items offered for the BS model) · Remove. Under it, a **line list** (Item · Qty × Rate = Amount · ×), with a description input for "asks detail" items, and "Subtotal".
- **Sticky footer bar** (glass): "Total amount" (large, primary color) + Cancel / Save service (Update service). Cancel on a dirty new bill asks "Discard this bill? Anything entered will be lost." (native `confirm`).
- **Validation copy:** "Truck number is required", "Mechanic is required", "Enter a valid 10 digit number", "Add at least one service with an item", "Describe the work", "Qty must be more than 0".
- **Phone:** each line wraps: name + × on row 1, description full width, then qty × rate … amount.
- Payment is **not** on this form (recorded from the list).

*Layout (new):*
- Labels become **sentence case** (no uppercase small labels; v1 §12.5). "Create date" becomes **"Bill date"**.
- **Truck lookup feedback:** a 16px spinner in the input while looking up. On success: "Filled from last bill" helper (12px `--success-700`, 3s).
- Header fields in a 2-column card.
- **Service cards** = nested cards. Header row: type select + the existing Remove action (danger-outline icon button, `aria-label="Remove service"`). The items multi-select checklist spans full width.
- **Line list:** rows separated by `--border-subtle`. Each row: name (14px medium) · description input (full width when required) · `qty × rate` (12px `--text-muted`, tabular) · amount (14px semibold, right) · × icon button.
- **Subtotal:** right-aligned, 14px semibold, on `--surface-muted`.
- **Quick add** row above the services: label "Quick add" (12px `--text-muted`) + chips.
- **Sticky footer** per §4.18. The dirty-cancel confirm becomes a **sm confirm modal** (not native `confirm`).

---

## 10. Cross-vertical screens

### 10.1 Expenses — `/issueCounter/expenses`
*Functional (verbatim from v1):*

- **Header:** Add Expense (gradient).
- **Filters:** Search "reason or product" · From (default month start) · To (default today) · Type (Materials / Others) · Min Amount · Max Amount · Clear · Excel · PDF. Summary strip: "37 expenses — **Total: ₹48,250.00**".
- **Columns:** SI No (with expand chevron for Materials) · Date · Type (badge) · Description ("3 product(s)" or reason) · Amount · Action (Edit / Delete). Expanded row: "Products in this expense" mini-table (Product · Qty · Unit Price · Amount · Total).
- **Add/Edit modal (large):** Expense Type* · Date* (≤ today). *Others* → Reason* + Amount*. *Materials* → editable product table (Product Name · Qty · Unit Price · Amount auto · delete) + "+ Add Product Row" + Total.

*Layout (new):*
- Page header: Excel · PDF (secondary; they move from the filter bar to the page header, matching every other list) · **Add Expense** (primary; was gradient).
- Filter bar + summary strip + table.
- Type = **neutral** badge (was warning/success; v1 §12.4).
- Min/Max amount use ₹-prefix inputs.
- **Modal lg:**
  - Expense type as a 2-option segmented control (Materials / Others).
  - Product rows as an editable mini-table at ≥768 and stacked nested cards on phones.
  - Total right-aligned, 16px semibold, tabular.
- **Phone card:** key = Description. Meta = Date · Type badge. Amount on the right (16px semibold). Materials cards expand inline to show products.

### 10.2 Bonus ledger — `/bonus/mechanics`, `/bonus/labour`
*Functional (verbatim from v1):*

- **Title:** "Mechanic Bonus" / "*{worker}* Bonus".
- **Header actions:** Issue selected (n) (only when rows ticked) · Manual bonus · Recalculate · Excel · PDF · Analytics (→ review).
- **Explainer paragraph** (plain language, references Settings → Bonus). Warning callout when bonus accrues ₹0: "No bonus is accruing for these jobs yet — set a bonus % … in Settings → Bonus, then click Recalculate."
- **Filters:** From (mechanic: FY start; labour: month start) · To · Person · Status (Pending / Paid / All).
- **Columns:** ☐ (select pending) · Person · Jobs · Work value · Collected · Bonus earned · Ready to pay (bold) · Paid · Status · Action (Details/Hide · Edit · **Issue**). Totals footer row. Expanded "Bills behind X's bonus" mini-table (Date · Work value · Collected · Bonus earned · Ready to pay · Paid · Status).
- **Modals:** Issue Bonus (amount, note; "Issuing locks these entries"), Correct bonus (ready-to-pay amount, reason), Issue selected (list of names + amounts), Manual bonus (person, amount, note; "recorded as paid for today").

*Layout (new):*
- **Page header actions** (all secondary; no primary in this header): Analytics · Excel · PDF ("More" menu on phones) · Recalculate · Manual bonus.
- **Issue selected (n)** moves out of the page header into the bulk-selection bar below. It still appears only when rows are ticked, and its position doesn't make other buttons jump.
- **Explainer** = 14px `--text-muted` paragraph in the page header subtitle slot. The zero-accrual warning = warning alert (§4.17) above the card.
- **Table:** amounts `.num`. Ready to pay is semibold `--text-strong`. Row "Issue" stays an inline secondary `.btn-sm` (primary per-row action), with Details and Edit in the row menu.
- **Bulk-selection bar:** when ≥1 row is selected, a bar appears above the table (`--brand-50` bg, radius 12): "3 selected · ₹12,400 ready to pay" + "Issue selected" primary + "Clear" link.
- **Phone:** a summary card with the totals above the list. Person cards: name, status badge, a Ready to pay value (16px semibold), meta "Jobs 12 · Collected ₹…", expand for bills, and a checkbox at the left for pending rows.

### 10.3 Performance review — `/bonus/mechanics/review`, `/bonus/labour/review`
*Functional (verbatim from v1):*

Back button + "Mechanic Performance Review" + Excel/PDF. Filters: person (required), From, To. Empty: "Select a mechanic to view their performance review". Then: 4 KPIs (Total Bills · Operations · Total Revenue · Collected); Service Type Mix (pie) · Revenue by Product Model (bars) · Revenue Timeline (area, "Granularity: day/week/month") · Collection Rate (progress bar + "₹X of ₹Y"). **Bonus Decision** card: "Suggested Bonus: ₹X", final amount, notes, **Confirm & Mark Paid** (gradient). Bills table (Date · Vehicle · Services · Total · Collected · Balance).

*Layout (new):* back link (icon + "Mechanic Bonus" or "*{worker}* Bonus", matching the ledger it came from).
- Filter card.
- Empty state (person not selected): neutral icon + the existing copy.
- 4 KPI tiles. Charts: 2 × `col-lg-6`, then Timeline `col-xl-8` + Collection rate card `col-xl-4`.
- **Bonus decision card:** brand-tinted header strip (`--brand-25` bg) with "Suggested bonus ₹X" (24px bold tabular). Then fields, then **Confirm & Mark Paid** (primary; was gradient).
- Bills table per §4.7.

### 10.4 Employees — `/salary/employees`
*Functional (verbatim from v1):*

Header: Add Employee. Filters: Search by name · Status (Active/Inactive) · Clear. Columns: SI No · Name · Role · Phone · Base Salary · Status · Action (Edit / Remove). No pagination. **Modal (large):** Name* · Role (Mechanic/Labour/Other) · Phone · Join Date · Base Salary (₹)* · Active ☑ · "Bank Details (optional)": Account Name, Account Number, IFSC, Bank Name · Notes. **Remove** explains: deleted if no history, otherwise marked inactive.

*Layout:* **Add Employee** primary. Status badge: Active = success, Inactive = **neutral**. Role = neutral badge.
- **Modal lg**, 2-column fields. "Bank details (optional)" is a collapsible section (closed by default when empty). Active is a switch.
- **Phone card:** name key, role badge, status badge, base salary right.

### 10.5 Settle Salary — `/salary/settle`
*Functional (verbatim from v1):*

- **Selector card:** Employee · Period Start (month start) · Period End (today). Empty: "Select an employee and period to settle salary".
- **Attendance card (½):** date + status (Present / Absent / Half Day / Leave) + Mark; marked days as colored badges ("04 Oct — present"); radio **Use daily marks / Manual override** (+ present-days input); "Computed from daily marks: N days. Working days in period: M."
- **Advances card (½):** add row (date, amount, reason, Add) + table of unapplied advances; "All N unapplied advance(s) will be swept into this settlement."
- **Deductions card:** repeatable amount + reason rows, "+ Add Deduction"; **preview table** — Gross (present/working days) · Advances deducted · (Advance carried forward) · Deductions · **Net Payable**; optional note; **Settle & Pay** (gradient); "This locks the period as paid…"
- **Settlement History:** Period · Net Paid · Adjustments · Paid On · Action (View Payslip · Add Adjustment). Paginated. **Add Adjustment modal:** Type, Amount*, Reason; explains it never changes the original amount.

*Layout (new):*
- **Selector** card (3 fields in a row ≥768).
- Attendance `col-xl-6` + Advances `col-xl-6`.
- Attendance marked days = attendance badges (§4.12) in a wrapping row. Mode radio = segmented control (2 options).
- **Deductions + preview** = one card. Preview is a key/value summary (label left `--text-muted`, value right tabular). Net payable is 20px bold `--text-strong` on `--surface-muted` with a top border.
- **Settle & Pay** = primary (was gradient) + lock copy as a 12px helper above it.
- History table per §4.7.

### 10.6 Settings — `/settings`
*Functional (verbatim from v1):*

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

*Layout (new):*
- **Page header:**
  - Title "Settings". **Save All Settings** (primary) top-right.
  - The bottom duplicate becomes a **sticky form footer** (§4.18; no total, just Save — and Cancel = "Discard changes" only if dirty tracking already exists; otherwise just Save).
  - Tabs: segmented (§4.18). Select on phones.
- **Each tab** = a stack of cards, one per sub-section (e.g. Company: "Company profile", "Branding", "Login highlight lines"). Card header = title + one-line description (14px `--text-muted`).
- **Branding card:** colour pickers + the **live preview row** (§4.18) so the owner sees how their colours render.
- **Price matrices** (radiator catalog, radiator bonus %):
  - Table inside its own scroll wrapper (`max-height: 60vh; overflow: auto`), so both the first column (product name) and the header row can be `position: sticky` within it.
  - Cells are 40px-tall `.num` inputs (desktop-first screen; 44px below 768), ₹ or % suffix.
  - Column header × = icon button.
  - Horizontal scroll inside the card.
- **Engineering service catalog master-detail:**
  - ≥1280: left rail (280px, a list of types with item counts; active = `--brand-50` / `--brand-text`; "New service type" link button at the bottom) + right panel card.
  - <1280: the rail becomes a select above the panel.
  - Item grid columns: Item name · one price input per BS model · "Ask for a description" switch · "Quick-add chip" switch · ×. Legend as 12px helper text.
- **Copy fix (v1 §12.6):** remove the sentence *"A per-line 'Bonus %' on the bill form overrides the mechanic matrix"* from the radiator Bonus tab. The feature does not exist.

### 10.7 Activity Log — `/audit`
*Functional (verbatim from v1):*

Filters: Action · From · To · Clear. Columns: When · Action · By · Details. Paginated (20). Empty: "No activity yet".

*Layout:*
- Standard list. When = date + time (12px `--text-muted` time under the date). Action = neutral badge with the readable name.
- **Phone card:** Action as key, When + By as meta, Details as 14px text.
- **Fix (v1 §12.7):** add readable names for all `autobill.*`, `engbill.*` and `salary.*` action keys:
  - Enumerate the keys from the backend audit constants.
  - Follow the existing radiator naming pattern (e.g. `engbill.create` → "Service bill created").
  - Unknown keys fall back to the raw key in `--font-mono`, as now.

---

## 11. Super-admin console

### 11.1 Clients — `/admin/clients`
*Functional (verbatim from v1):*

- **Header:** Template (download Excel template) · Import Excel · **Add Client**.
- **Summary stats (3 tiles):** Total Clients · Active (accent) · Suspended (muted).
- **Filters:** search "name, code, or username…" · status select · Clear (client-side).
- **Columns:** SI No · Business Name · Code (`monospace`) · Type (Radiator / Automobile / Engineering badge) · Admin Login · Status (Active / Suspended) · Last Login · Created · Action (View Settings · Open Login Page · Edit · Suspend/Reactivate · Reset Password · Export Data · Delete).
- **Modals:** Add Client (Business Name*, Business Code* auto-slugged and locked after creation, Admin Username*, Admin Password*, Business Type — fixed after creation) → **Handover Details** (Login URL, Code, Username, Temp Password; Copy / Done). Edit Client (name only; code locked). Reset Password. **View Settings** (read-only key/value sections: Provisioning, Company Profile, Branding swatches, labels, catalog matrix…). **Delete Client** (danger title, "Download a backup first" warning with Download Data, type-the-code-to-confirm, "Delete Permanently"). Import Results (created / skipped / error badges per row).

*Layout (new):*
- Page header: Template · Import Excel (secondary) · **Add Client** (primary; was gradient).
- 3 KPI tiles (Active = success tone, Suspended = neutral).
- **List:** Code in `--font-mono` at `--text-sm`. Type = neutral badge. Status: Active = success, Suspended = neutral.
- **Row menu** (labels unchanged): View Settings · Open Login Page · Edit · Reset Password · Export Data · divider · Suspend/Reactivate · Delete (destructive).
- **Handover modal:** values as a read-only key/value list (label 12px `--text-muted`, value 14px `--font-mono`, temp password included). Footer: the existing **Copy** (secondary) + **Done** (primary). Per-field copy buttons are proposal P9.
- **Delete modal:** danger confirm with a warning alert containing "Download Data" (secondary). The type-to-confirm input enables **Delete Permanently** (danger) only on an exact match.
- **View settings:** lg modal. Sections as key/value lists (label 12px `--text-muted`, value 14px), with branding swatches (24px, radius 6, hex label).

### 11.2 Audit — `/admin/audit`
*Functional (verbatim from v1):*

"Audit Log" + "← Clients". Filters: client · action · From · To · Clear. Columns: When · Action · Client · By · Details.

*Layout:* back link (icon + "Clients"), title "Audit Log" (unchanged). Standard list as §10.7.

---

## 12. v1 inconsistencies → resolutions

| # | v1 issue | Resolution in this spec |
|---|---|---|
| 1 | Three overlapping style systems, `!important` fights, 8 vs 12px radius, states only on Engineering | One token layer (§4, D1, D6). Engineering's patterns (skeleton, error, empty, phone cards, sticky footer) become app-wide (§4.8, §4.17, §4.18). Legacy CSS is deleted in phase 4 (§15). |
| 2 | Brand leaks: fixed gradient button, hard-coded chart colours | `btn-gradient` removed (§4.4). Chart palette from tokens only (§4.14). Lint rule: no hex colours outside `theme.css` (§16). |
| 3 | Inconsistent primary action styling | One primary per region. Every "Add …", "Save", "Settle & Pay", "Confirm & Mark Paid" is `.btn-primary` (§4.4). |
| 4 | Status colours used for categories | Category badges are neutral. Status tones only for status (§4.12). |
| 5 | "Create Date" vs "Bill Date"; "Billing" vs "Bills"; uppercase labels on Engineering | "Bill date" everywhere. Page title "Bills". Sentence-case field labels and titles. Button/menu/nav text unchanged (§4.2, §7.2, §7.3, §9.3). |
| 6 | Settings copy promises a non-existent bonus field | Sentence removed (§10.6). |
| 7 | Activity log lacks readable names for automobile/engineering/salary | Add names (§10.7). |
| 8 | Exports differ by vertical | **Not changed** (feature parity is a product decision, Q4). The page-header slot handles any number of export buttons consistently. |
| 9 | Rows-per-page free number input; Employees unpaginated | Select (§4.10). Employees stays unpaginated, justified by volume. |
| 10 | Search silently ignores 1–2 characters | Inline hint "Type at least 3 characters" (§4.9). |
| 11 | Full-screen loader on every fetch | Skeletons + in-card refetch. Overlay only for login and PDF/Excel generation (§4.17). |
| 12 | Modals lack focus management / Esc; native `confirm()` | Shared `<Modal>` with focus trap, Esc, focus return. Native confirm replaced (§4.16). |
| 13 | Responsiveness only on Engineering | Mobile list cards, filter sheet and sticky footers on all screens (§4.8, §4.9, §4.18). |
| 14 | No contrast guard; `span role="button"` controls | `applyTenantBrand` guard (D3, tested). Badge text at the 700 step (D8). All icon controls are `<button>` with `aria-label` (§4.5, §4.18). |
| 15 | Empty footer component | Removed (§3.2.8). |

---

## 13. Data shapes (for realistic mockups) *(unchanged)*

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

**Seeded defaults** (`Radiator-backend-main/src/config/defaultSettings.js`):
- **Radiator:** products BS-II, BS-III, BS-IV, BS-VI. Services Service, New Radiator, Tank, Cover, Other (asks comment).
- **Engineering:** BS models BS-3, BS-4, BS-6. Service types:
  - **Turbo:** Hold set, Tel, O-ring kit change, Lathe work, Shaft polish, O-rings / rings alteration, Packing set, Labour bill, Other.
  - **Air Compressor:** Kit, Labour, Piston, Rings, Lathe work, Block bush change (not BS-6), Sleeve fixing / Water type / Bold type (BS-6 only), Other.
  - **Other.**
- Mechanic and labour lists start empty. Automobile parts start empty (example in code: "Engine Oil 15W40", unit L, ₹450).

For mockups, use Indian truck numbers (e.g. `TN 37 AB 1234`) and amounts from the ₹ hundreds to tens of thousands. **Test with long values:** ₹12,34,56,789.00, a 40-character *{party}* label, 8 services on one bill.

---

## 14. Volumes & usage context *(unchanged)*

- Bills list: typically tens to a few thousand rows per tenant; 10 per page default.
- Settings catalogs: ~3–8 product/BS models, ~5–20 service types, ~5–30 items per engineering type.
- People lists: ~2–20 mechanics/labour.
- Primary device for bill entry: tablet/phone at the counter. Dashboards and settings: desktop/laptop.
- Printing to A5 paper is a core daily task. The invoice design is part of the brand.

---

## 15. Implementation plan

### 15.1 Phases (each phase = several small PRs; each PR must keep the app fully working)
| Phase | Scope | Done when |
|---|---|---|
| **0 — Foundation** | (1) **Collision check** (before adding the new files): list every custom property the existing CSS defines anywhere under `src/` (the exact command is in the `theme.css` header) and compare with `theme.css`. Expected overlaps: `--surface`, `--surface-sunken`, `--primary`, maybe `--radius-*`. Confirm each overlap is the same kind of value (a colour stays a colour). (2) Add `fonts.css`, `theme.css`, `bootstrap-bridge.css`, `components/compat.css` (gradient/cancel aliases), **loaded after legacy CSS**. (3) Add `applyTenantBrand.ts` + tests and call it wherever `--primary` / `--accentColor` are set today. (4) Write `chartTheme.ts` and `reactSelectTheme.ts`. | Tests pass. Every screen still works. **Expect visible shifts** on unmigrated screens: font, colours, 44px controls, roomier table rows, and 24px card padding. Legacy `!important` rules still win where they exist. Check every screen at 390 and 1280 for broken layouts (overflow, overlapping, clipped text) and fix them before merging. |
| **1 — Shell** | `AppShell`, `Sidebar`, `Header`, `UserMenu`, `navConfig.ts` (per vertical + super admin). Remove the top bar and the empty footer. | §16 shell checks pass at all widths. Every route reachable. Active states correct. |
| **2 — Components** | `PageHeader`, `Card`, `KpiCard`, `StatusBadge`/`CategoryBadge`, `FilterBar` (+ mobile sheet), `DataTable` + `MobileList`, `Pagination`, `RowMenu`, `Modal` + `ConfirmDialog`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton*`, `SegmentedControl`, `Switch`, `ChipInput`, `StickyFormFooter`, `Upload`. | A component demo route (dev-only) shows every state from §4. |
| **3 — Screens** | In order of daily use: (a) the 3 bills lists, (b) the 3 bill forms, (c) the 3 dashboards, (d) expenses, (e) bonus ledger + review, (f) employees + settle salary, (g) settings, (h) activity log, (i) auth screens, (j) super-admin clients + audit. | Each screen passes its §16 checks. Before/after screenshots in the PR. |
| **4 — Cleanup** | Delete `style.css` rules no longer referenced, `base-theme.css`, `common.css`, `apple-rebrand.css`, `admin.css`, `responsive.css`, `engineering.css`, `compat.css`, unused icon/glass/gradient code. Remove every `!important`. | `grep -r "!important" src/styles` is empty. The stylelint "no hex outside theme.css" rule passes. Bundle CSS is smaller than before. |

### 15.2 File plan (suggested; match the repo's conventions if they differ)
```
src/styles/fonts.css                 ← companion file
src/styles/theme.css                 ← companion file
src/styles/bootstrap-bridge.css      ← companion file
src/styles/components/*.css          shell, page, card, table, data-list, filter-bar, pagination,
                                     menu, badge, kpi, chart, modal, toast, states, segmented,
                                     chips, switch, upload, form-footer, compat (temporary)
src/assets/fonts/inter-latin-ext-{400,500,600,700}-normal.woff2   (₹ fallback, see fonts.css)
src/theme/applyTenantBrand.ts (+ .test.ts)   ← companion files
src/theme/chartTheme.ts, src/theme/reactSelectTheme.ts
src/layout/AppShell.tsx, Sidebar.tsx, Header.tsx, UserMenu.tsx, navConfig.ts
src/components/ui/…                  phase-2 components
```
Import order in `main.tsx`: `bootstrap.min.css` → legacy CSS (until removed) → Outfit fontsource imports → `fonts.css` → `theme.css` → `bootstrap-bridge.css` → `components/*.css`.
**Bootstrap must be ≥ 5.3** (the bridge relies on 5.3 component variables). Check `package.json` first.

---

## 16. Acceptance checklist

**Tokens & theming**
- [ ] No hex colours, brand values or `!important` in component CSS/TSX (stylelint `color-no-hex` with `theme.css` excluded; grep in CI). jsPDF / export code is excluded (§4.15).
- [ ] `applyTenantBrand` tests pass (including the 4,096-colour sweep: solid, hover and accent text all ≥4.5:1). Brand stress test: screenshots of dashboard, bills list, bill form, login and sidebar for primaries `#12467A`, `#FFF59D`, `#E53935`, `#0B0B0F`, `#76FF03` and accents `#F47F6B`, `#FFEB3B`. All text readable; primary buttons visible.
- [ ] `--primary` / `--accentColor` still set (jsPDF headers unchanged).
- [ ] ₹ renders from "Rupee Fallback" (DevTools → Rendered Fonts) in amounts, inputs and charts.
- [ ] Amount columns align digit-for-digit (`tabular-nums`).
- [ ] KPI tiles with ₹1,23,45,678.00 never overflow or wrap at 360 / 390 / 768 / 1280 (sidebar open and collapsed) / 1536 / 1920.
- [ ] No Unicode arrows, ⋯, ✕, ✓ or ▾ in rendered UI text (D12). Search the TSX for `[←→⋯✕✓▾▸]`.

**Shell**
- [ ] ≥1280: 290px sidebar; ☰ collapses to a 90px rail; the rail expands on hover **and** keyboard focus without reflowing content; state persists across reloads.
- [ ] <1280: drawer with backdrop; closes on backdrop, Esc, route change; focus trapped and restored.
- [ ] Active item correct for every route in §3.2.5, including bill view/edit and bonus review.
- [ ] Engineering nav hides Expenses, Salary and Labour bonus. Super-admin nav shows Clients and Audit log only.

**Components & screens**
- [ ] Controls 44px tall; touch targets ≥44px on phones (the bridge forces `.btn-sm` to 44px below 768). Table rows with action buttons ≈52px, not taller.
- [ ] Every list has skeleton, empty (both variants), error + retry and phone-card states.
- [ ] No full-screen loader on filter/pagination changes.
- [ ] Every modal: Esc closes, focus trapped and returned, labelled. No native `confirm()` left.
- [ ] Badge tones match §4.12. Categories are neutral.
- [ ] Copy changes applied, and **only** these: page title "Billing" → "Bills"; "Create Date"/"Bill Date" → "Bill date"; sentence-case field labels and page/card titles; removed bonus sentence (§10.6); activity-log names (§10.7); search hint (§4.9); empty/error-state copy for lists that had none (§4.17); "Fully paid" disabled-reason (§4.11). Button, menu and nav labels unchanged.
- [ ] Every field, action and validation message from §6–§11 still present and working (regression pass per vertical).
- [ ] Screens checked at 360 / 390 / 820 / 1280 / 1440 / 1920 px. No horizontal page scroll (tables scroll inside their card only).
- [ ] Keyboard-only pass: login → create bill → record payment → print → logout.
- [ ] axe / Lighthouse accessibility: no contrast or name/role violations on the 5 most-used screens.
- [ ] jsPDF invoice, report and payslip output visually identical to before.

---

## 17. Open questions & proposals

**Open questions (decide before phase 1):**
- **Q1 — Default brand fallback.** Login falls back to `#2264E5` and the app to `#12467A`. This spec unifies both on `#12467A` (`DEFAULT_PRIMARY`). Confirm, or choose `#2264E5`.
- **Q2 — Settings & Activity log placement.** Sidebar only (spec default), or sidebar **and** user menu?
- **Q3 — Font.** Outfit (TailAdmin look, needs the ₹ fallback) or keep Inter (already bundled, has ₹, looks less like TailAdmin)? The spec assumes Outfit.
- **Q4 — Export parity.** Should automobile and engineering get PDF export and the A4 Report like radiator? (Feature work, outside this redesign.)
- **Q5 — Bootstrap version.** Confirm `bootstrap` in `package.json` is ≥ 5.3. If 5.0–5.2, upgrade first (low risk) or adapt the bridge.

**Proposals (not part of this redesign; build only if approved):**
- **P1** Global truck-number search in the header (⌘K / "/" shortcut). This is the most common counter lookup.
- **P2** Notifications (e.g. bills with a pending balance over 30 days).
- **P3** Dark mode (tokens are structured for it; needs a second contrast pass with tenant colours).
- **P4** Dirty-state tracking on Settings, with "You have unsaved changes · Discard · Save" in the sticky footer.
- **P5** Move bill create/view/edit routes under `/…/billing/…` (with redirects from the old paths).
- **P6** Breadcrumbs on nested pages (currently back links).
- **P7** Unify icons on one set (currently a custom sprite + react-icons).
- **P8** Print and Edit buttons in the page header of bill view mode (both exist today only as row actions).
- **P9** Per-field copy buttons in the client Handover modal.
