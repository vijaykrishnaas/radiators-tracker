# UI kit and screen recipe (redesign v2)

How screens are built after the TailAdmin redesign. The spec is `docs/FRONTEND_SPEC.md` (v2) at the repo root.
Reference screens: `Pages/IssueCounter/Billing/Index.tsx` (list), `Pages/IssueCounter/Dashboard/Components/CreateRadiators.tsx` (form),
`Pages/IssueCounter/Dashboard/Index.tsx` (dashboard). Copy their structure.

## Rules
- **No legacy classes.** The old global CSS (`Assets/css/*`, `Pages/Engineering/engineering.css`) is no longer loaded. Do not use
  `font-s14`, `font-w600`, `card-shadow`, `table-header`, `table-accordion-header`, `status-badge*`, `btn-cancel`, `btn-gradient`,
  `icon-15`, `session-custom-border`, `resp-bar`, `base-title`, `eng-*` etc. Do not import any file from `Assets/css/`.
- **Tokens only.** No hex colours, no `!important`, no raw px font sizes outside the scale in TSX/CSS. Use the classes below or
  `var(--…)` tokens from `styles/theme.css`. Page-specific CSS goes in the area file `styles/components/<area>.css`.
- **Copy rules (spec §4.2):** button, menu and nav labels keep their exact current text and casing ("Add New", "Record Payment",
  "Save All Settings"). Page titles, card titles and field labels become sentence case ("Bill date", "Phone number"); tenant labels
  (`settings.labels.*`) render exactly as stored. Validation messages unchanged. No CSS uppercase.
- **Keep every field, action, API call, payload, validation and business rule.** Only the presentation changes.
- **Buttons:** `btn btn-primary` (one per region), `btn btn-secondary` (everything else; replaces btn-cancel), `btn btn-danger`,
  `btn btn-outline-danger`, `btn btn-link`, `btn btn-icon` (+ required `aria-label`). `btn-sm` only in card headers/toolbars.
  Every former `btn-gradient` becomes `btn-primary`.
- **Icons:** `<Icons iconName="…" />` (`Components/Icons.tsx`). No Unicode arrows/×/✓/⋯ as glyphs; use icons
  (`arrow-left`, `chevron-down`, `x`, `tick`, `more`). The `×` multiplication sign inside text like "2 × ₹500" is fine.
- **Loading:** never a full-screen `<Loader>` for fetches. Lists → `useRemoteList` + `DataList` (skeleton / refetch bar / error /
  empty). Dashboards → `KpiCard loading` + `ChartCard loading`. Form submit → button spinner (`<span className="spinner" />` +
  "Saving..."). PDF/Excel generation → `<BusyOverlay show label="Preparing PDF…" />`.
- **Feedback:** keep `useAlertMsg().callAlertMsg(msg, "success" | "error")`; it renders toasts. Remove `<AlertComponent>` usages.
- **Dialogs:** `Modal` / `ConfirmDialog` from `Components/ui/Modal` (focus trap, Esc, focus return). No `window.confirm`,
  no hand-written `.modal` markup.

## Components (`src/Components/ui/*`)
| Import | Use |
|---|---|
| `Basics`: `PageHeader({ title, subtitle?, back?: {to,label} \| {onClick,label}, actions?: HeaderAction[], primary? })` | Top of every screen. `actions` are secondary buttons; `collapse: true` moves exports into the "More" menu on phones. `primary` = one `.btn-primary`. |
| `Basics`: `CardHead({ title, subtitle?, actions? })`, `SectionDivider({ label })` | Card titles; "Services"/"Expenses" dividers. Card markup: `<section className="card"><div className="card-body">…</div></section>`. Nested blocks: `<div className="nested-card">`. |
| `Basics`: `Field({ label, htmlFor, required?, error?, help? })` | Label + control + error/help. Layout grid: `<div className="form-grid">` (2 cols ≥768; `span-2` spans). |
| `Basics`: `Badge({ tone, dot? })`, `PaymentBadge({ status })`, `paymentTone()` | Status tones: success / warning / error / info / neutral / brand. **Categories are `neutral`** (expense type, client type, role, service types). |
| `Basics`: `KpiCard({ label, value, icon, tone?: neutral\|brand\|success\|error, caption?, loading?, valueTone?: "error" })`, `KpiGrid({ count: 3\|4\|6 })` | Metric tiles. |
| `Basics`: `EmptyState`, `ErrorState`, `SkeletonRows`, `SkeletonCards`, `Callout({ tone, title? })`, `BusyOverlay`, `SegmentedControl({ options, value, onChange, label, radio?, full? })`, `FormFooter({ totalLabel?, total?, children })`, `ProgressBar` | States, inline alerts, segmented control (`radio` for form values), sticky form footer. |
| `Filters`: `FilterBar({ search?, filters: {id,label,node,primary?}[], activeCount, onClear, tools?, helper? })`, `SearchInput({ id, label?, placeholder, onSearch })` | Filter bar with responsive behaviour + phone bottom sheet. Controls must be **controlled** (pass `value`); give each control `id`/`inputId` = filter `id`. Put `key={filtersKey}` on `SearchInput` to reset it on clear. Standalone (dashboards): wrap in `<div className="card filter-standalone">`. |
| `DataList`: `DataList<T>({ rows, rowKey, columns, status, refetching, onRetry, errorTitle, empty, mobileCard, expanded?, footer?, mobileSummary?, toolbar?, summary?, above?, pagination? })`, `Column<T>` (`className`: `num`, `key`, `nowrap`, `text`, `text-wide`, `cell-actions`), `MobileCard`, `Pagination`, `emptyCopy()` | Every list: table ≥768, cards <768. Last column: `RowActions` with `className: "cell-actions num"` and header `<span className="visually-hidden">Action</span>`. |
| `useRemoteList(load, deps)` | Fetch state for lists → `{ rows, total, totalPages, extra, status, refetching, reload }`. |
| `Menu`: `ActionMenu({ items, label, icon?, text?, buttonClassName? })`, `Popover`, `MenuItems` | Menus. Row actions: `Components/RowActions` (items: label, icon, onClick, danger, disabled, reason). Order: View · Edit · Print · Record Payment · (divider) · Delete. |
| `Modal({ open, onClose, title, description?, size: sm\|md\|lg, busy?, footer, danger?, initialFocus?, as?: "form", onSubmit? })`, `ConfirmDialog({ open, title, message, confirmLabel, busyLabel?, busy?, danger?, disabled?, onConfirm, onCancel, children? })` | Footer: Cancel (`btn-secondary`) then confirm. |
| `Inputs`: `Switch({ id, label, checked, onChange })`, `AffixInput({ prefix: "₹" \| suffix: "%" , …input props })`, `PasswordInput`, `ChipInput({ id, label, values, onChange })`, `Upload({ id, label, hint, accept, previewUrl, uploading, onFile, onRemove?, cover? })` | Form controls. |
| `Charts`: `ChartCard({ title, subtitle?, control?, isEmpty, loading? })`, `ChartTooltip`, `SeriesLegend`, `DonutWithLegend({ data, nameKey, valueKey, amountKey?, centerLabel, colorFor?, asMoney? })` | Charts; reuse `HBarChart` and `PairBarChart` exported from `Pages/IssueCounter/Dashboard/Index.tsx`, and `theme/chartTheme.ts` (`PAIR_COLORS`, `STATUS_COLORS`, `CATEGORY_COLORS`, `axisProps`, `GRID_STROKE`, `compactINR`). |
| `Components/RecordPaymentModal` | Shared Record Payment dialog (all verticals; `withMode` for engineering). |
| `Components/Selector` | react-select themed; pass `inputId` for labels, `value` always (controlled). |
| `Components/InputText` | Plain `form-control` input (accepts all input props, optional `prefix`/`suffix`). |

## Text utilities (`styles/components/ui.css`)
`t-xs t-sm t-md t-lg` (sizes) · `t-strong t-muted t-success t-error t-brand` (colours) · `t-medium t-semibold` · `t-mono` · `tabular`
· `num` (right-aligned tabular nowrap). Bootstrap layout utilities (`d-flex`, `gap-*`, `row g-3 g-md-4`, `col-*`, `mt-*`) are fine.

## Phone cards (spec §4.8)
`<MobileCard title={key} to={viewUrl?} badge={<PaymentBadge/>} menu={rowMenu} meta={[date, …]} meta2={…} amounts={[{label, value, tone}]} right={amount} leading={checkbox} >{expanded content}</MobileCard>`

## Verify
`npx tsc --noEmit -p .` and the screenshot sweep `node e2e/screens.mjs <filter>` (dev server on 5173 or set `E2E_BASE_URL`).
