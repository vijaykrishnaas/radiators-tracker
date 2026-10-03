# Engineering UI refinement log

Hourly routine "Engineering UI — refine" (see trigger). Source of truth for rules, backlog and run history.
Branch: `claude/ui-refine` (this file only). Work PRs go from `claude/eng-ui-refine-<n>` into `staging`.

## Rules (hard)
1. Scope = Engineering screens ONLY: `Radiator-frontend-main/src/Pages/Engineering/**`, `src/Components/PrintEngInvoice.ts`, `src/Utils/amountInWords.ts`, `e2e/engineering.e2e.mjs`.
   NEVER touch radiator / automobile / salary pages, `src/Assets/css/*`, `PrintInvoice.ts`, shared Components, or any backend file. If an improvement needs one, log it under "Needs user" instead.
2. All CSS lives in `Pages/Engineering/engineering.css`, every selector prefixed `eng-` (or scoped under an `eng-*` ancestor). No bare element/.btn/.card/.table rules.
3. Behaviour is frozen: change layout, spacing, typography, states, accessibility, motion. Do not change data logic, validation, API calls, money math.
4. One small, visible improvement per run (one backlog item). No churn: if a screen already meets the rubric, move on; if nothing is worth changing, log "no change" and stop.
5. Prove it: take before/after screenshots (desktop 1300px and phone 390px) with the Playwright harness, LOOK at them, and only ship if clearly better. Keep `tsc --noEmit` clean, engineering e2e all-pass, radiator/automobile/salary e2e no FAIL.
6. PR into `staging` only. Never master, never deploy. One open UI PR at a time. Review (fresh subagent, charter below) and merge happen in SEPARATE runs.
7. Never claim live-DB verification. The mock API in e2e is the only data.

## Design rubric ("principal-grade" bar)
- Spacing on a 4/8px scale; consistent card radius/shadow from tokens (`--r-*`, `--shadow-*`, `--line`, `--surface`).
- Type scale: one title size, one body size, one caption size; eyebrow labels 11px caps; numerals `tabular-nums` and right-aligned.
- Colour only from tokens + tenant `--primary`; no hard-coded brand hexes. Contrast >= 4.5:1 for text.
- Touch targets >= 44px on phone; inputs 16px font on phone (no iOS zoom).
- Every control has a visible focus ring (`--focus-ring`), hover and pressed state; keyboard order is logical.
- Real empty / loading / error states (skeleton or concise message), never a blank card.
- Motion is subtle (<=200ms, `--ease`), respects `prefers-reduced-motion`.
- No horizontal page overflow at 390px; no layout shift on load.
- Dark mode: if tokens already support it, Engineering screens must not break it.

## DESIGN DIRECTION v2 — TailAdmin-CRM style (user request 2026-10-03; supersedes "keep the existing look")
The user pointed at https://demo.tailadmin.com/crm as the style to aim for and asked to "infer from this and upgrade". **That site is BLOCKED from this environment (egress proxy 403) — do NOT try to fetch it.** The spec below is inferred from TailAdmin's published design language (Tailwind-based admin kit, Untitled-UI-style gray scale), NOT from viewing the page. If the user uploads screenshots later they appear in the session transcript/uploads: compare against them and correct this spec. Scope is unchanged: Engineering screens only, `eng-*` CSS only, behaviour frozen, tenant `--primary` stays white-label (never hard-code TailAdmin's #465FFF; use `var(--primary)` and `color-mix` tints of it).

**Look & feel.** Airy and calm: white cards on a very light gray canvas, generous whitespace, hairline borders, soft shadows, one accent colour, soft-tint status badges, quiet gray secondary text.
- Canvas gray-50 `#F9FAFB`; cards white, `1px` border gray-200 `#E4E7EC`, radius **16px**, shadow-xs (`0 1px 2px rgba(16,24,40,.05)`); page gutter 24px, card padding 20–24px, section gap 24px.
- Gray scale (use via `--eng-gray-*`): 50 `#F9FAFB`, 100 `#F2F4F7`, 200 `#E4E7EC`, 300 `#D0D5DD`, 400 `#98A2B3`, 500 `#667085`, 600 `#475467`, 700 `#344054`, 800 `#1D2939`, 900 `#101828`.
- Semantic: success `#12B76A` (tint `#ECFDF3`, text `#027A48`), warning `#F79009` (tint `#FFFAEB`, text `#B54708`), error `#F04438` (tint `#FEF3F2`, text `#B42318`). Brand tint = `color-mix(in srgb, var(--primary) 10%, transparent)`; focus ring = `0 0 0 4px color-mix(in srgb, var(--primary) 12%, transparent)`.
- Type: geometric sans (TailAdmin uses *Outfit*) — **keep the existing font stack; loading Outfit means an external font fetch and touching shared CSS = "Needs user".** Page title 24/600 gray-900; card title 18/600 gray-900; body 14/400 gray-700; label/caption 12–13/500 gray-500; metric value 28–30/600 gray-900; `tabular-nums` on every number.
- Motion: ≤200ms, subtle, `prefers-reduced-motion` respected.

**Component recipes (build these as `eng-*` classes).**
- *Metric card* (Dashboard KPIs): white card r16; a 44–48px rounded-xl icon chip (gray-100 bg, gray-800 icon); label 13/500 gray-500 under it; value 28/600; optional trend pill (↑ 11.0% in success tint / ↓ in error tint) **only if a real comparison value already exists in the data — NEVER invent numbers or add fetching.**
- *Chart card*: title 18/600 + 14 gray-500 subtitle on the left, kebab/segmented control on the right; chart colours = `--primary` + soft tints, hairline gray-100 gridlines, rounded bar tops, minimal axes.
- *Status badge*: pill (`border-radius:999px`), `padding:2px 10px`, 12/500, soft tint bg + darker text, optional 6px leading dot (Received = success, Partial = warning, Not received = error).
- *Table*: card-wrapped; header row gray-50 bg, 12/500 gray-500 (sentence case or light uppercase), rows separated by gray-100 hairlines, cell padding 14–16px, row hover gray-50, numbers right-aligned tabular, quiet pagination.
- *Buttons*: height 40–44, radius 8px; primary = filled `--primary` + shadow-xs; secondary = white, `1px` gray-300 border, gray-700 text; ghost/link for tertiary; focus ring as above.
- *Inputs/selects*: height 44, radius 8px, `1px` gray-300, placeholder gray-400, focus border = tinted `--primary` + 4px ring; error = error-500 border + ring. Keep dropdown height equal to input height (e2e guards 44px).
- *Tabs / segmented*: gray-100 container r8, active segment white + shadow-xs.
- *Modals*: r16, overlay gray-900 @ 50%, header with title + close, footer actions right-aligned (full-width stacked on phones).
- *Empty/loading/error states*: soft icon chip + title + one-line hint + action (already built for Billing; reuse the pattern everywhere).

**How to apply (order of backlog, one small PR each).**
1. Token layer: add a wrapper class `eng-theme` on each Engineering page root (Dashboard, Create, Billing, Settings tab wrapper) and define `--eng-gray-*`, `--eng-radius-*`, `--eng-shadow-xs`, `--eng-ring` on `.eng-theme` in engineering.css. Do NOT edit shared `base-theme.css`. Existing `eng-*` rules then migrate to these tokens gradually.
2. Dashboard KPIs → metric-card recipe; chart cards → chart-card recipe; segmented range control to the recipe.
3. Billing table → table + badge recipes; filters card.
4. Buttons/inputs inside Engineering → button/input recipes (scoped under `.eng-theme`, `!important` only where shared CSS forces it, with a comment).
5. Settings catalog (rail + rows) → card/table recipes. Form cards → card/section recipes. Modals → modal recipe.
6. PDF stays brand-coloured; only adopt spacing/typography ideas if they clearly help.
**Per-PR proof (test-first):** assert computed styles in e2e (card radius 16px, border colour = gray-200, metric value font-size/weight, badge `border-radius` 999px + tint background, button radius 8px/height 44, input focus ring present) — print the measured values, fail on the OLD code first. Contrast ≥ 4.5:1 for text on tints (compute and note in the PR). Compare before/after screenshots at 1300 and 390.
**Needs user (new):** Outfit font; any change to the shared sidebar/header/layout that TailAdmin shows (the app's existing header is shared with other verticals); dark mode.

## Reviewer charter (fresh-context subagent, diff only)
BLOCKING if: file outside scope; non-`eng-` CSS selector matching outside Engineering; any logic/handler/API/money change; behaviour regression; tsc error. Verify every finding by reading code. Output first line exactly `VERDICT: BLOCKING` or `VERDICT: NO-BLOCKERS`.

## Lessons learned (from the build session — read before touching anything)
**What the user wants**
- The user judged the first UI "junior level" and said the *layouts themselves* are poor (e.g. Settings → Service Catalog). Priority is layout/structure and phone usability over colour. Keep the existing look and tenant `--primary`; do not invent a new palette or dark-first theme.
- Their reference mockups: service form (BS model + service type + multi-select items + qty×rate rows, quick-add chips, footer totals) and the printed bill (green header band with logo/name/phones, address strip, vehicle | bill no | date cells, particulars with type tags, amount in words, UPI box, total pill, signature). Originals are images in the session transcript `/root/.claude/projects/-home-user-radiators-tracker/e3d98a1d-3293-56ac-a946-742667199fec.jsonl` (also uploaded under `/root/.claude/uploads/...`). If you need to look at them, extract base64 `"type":"image"` blocks from that file to the scratchpad. Match them; do not drift from them.
- "The existing app must not be affected at any cost" (radiator is LIVE in production). When unsure, don't ship; log under Needs user.
- BS model is chosen PER SERVICE CARD (user's earlier decision), not in the header, even though one mockup shows it in the header. Don't change that.
- The user reviews on Netlify staging (`staging-service.netlify.app`). This container cannot reach netlify.app (proxy 403), so judge only via local Vite + Playwright screenshots.

**Codebase gotchas that already cost time**
- Shared `src/Assets/css/responsive.css` forces `!important` on `.table-accordion-header` padding and `table td { white-space: nowrap !important }`. To override inside Engineering, scope under an `eng-*` ancestor and use `!important` there. Never edit the shared files.
- The shared `Selector` (react-select) renders menus unportalled at z-index 1. Anything sticky/overlapping must stay at z-index <= 0 or menus get covered. A sticky bottom bar needs `scroll-padding-bottom` (done via `html:has(.eng-foot)`), otherwise fields scroll under it and e2e clicks time out.
- react-select in e2e: use `{ force: true }` clicks and `page.getByText("BS-6", { exact: true }).last()`; changing BS model re-applies the catalog rate, so type manual rates afterwards.
- Catalog selectors now: rail `.eng-type`, rows `.eng-item`, price fields `.eng-price input`. Billing phone cards: `.eng-table`, `.eng-c-*` cells, `.eng-filters`/`.eng-more`, toggle "More filters". Form: `.eng-svc`, `.eng-line*`, `.eng-foot`.
- `display: contents` wrappers inside Bootstrap `.row` don't survive the shared CSS; give the children an `eng-more` class instead of wrapping.
- jsPDF standard fonts cannot draw `₹` or Tamil -> amounts print as "Rs"; company name prints Latin. Don't try to "fix" without an embedded font (Needs user). PDF text wraps, so e2e asserts on partial phrases ("Rupees Four Thousand Eight Hundred").
- Rasterize a downloaded PDF with `pip install pymupdf` then `pymupdf.open(f)[0].get_pixmap(dpi=130).save(png)`; always LOOK at it. Test at least: qty 1 only, qty>1 + discount + part payment, long company name, many rows (multi-page), no logo/QR/address.

**Process gotchas**
- Merge needs the FULL 40-char head SHA (`git rev-parse HEAD`), not the 7-char one.
- Stage only your own files (`git add <paths>`), never `git commit -a` on the log branches — a stray modified file nearly rode along once. Always `git status` clean before switching branches. Delete `e2e/.out` after e2e runs (the stop hook flags untracked files).
- Start Vite once. `pgrep -f "vite --port"` can match its own shell and falsely say "running" — start it with `nohup npx vite --port 5173 >/tmp/vite.log 2>&1 &`, wait ~7s and `curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/` must print 200 before taking screenshots. (Start Vite once; `pkill -f "vite --port"` exits 144 — that's expected, not a failure.
- Screenshot harness: copy the route-mock block from `e2e/engineering.e2e.mjs` (settings, `/engbills*`, analytics) into a scratchpad script; set `localStorage` `svr_token` / `svr_user` (role admin, clientId c1) on `/issueCounter/login`, then `goto` the Engineering page. Capture 1300x900 AND 390x844, `fullPage: true`, plus viewport shots for sticky elements. Measure `document.documentElement.scrollWidth - window.innerWidth` for overflow.
- Run order each time: `npx tsc --noEmit`, `node e2e/engineering.e2e.mjs` (all PASS, currently 50), then radiator (6), automobile (10), salary (6) with no FAIL/ERROR.
- Commit/PR attribution: use the Co-Authored-By + Claude-Session lines and the PR footer given in the system attribution reminder; never put a model identifier in code/PR text beyond those lines.
- Shared `ChartCard`/`ChartTooltip` live in `src/Components` (out of scope to edit). The Engineering dashboard uses its own local `Panel`; reuse `ChartTooltip` import only.
- Shared `.btn` has a min-width that widens icon-only buttons (the line remove ×): override with `min-width: 0 !important` + fixed width inside `.eng-*`. Shared `.form-control` forces `border-color: ... !important` — to recolour (error state) use a higher-specificity `.eng-field.has-error .form-control { ... !important }`. Borders have a 150ms transition: in e2e wait ~450ms before reading a computed colour.
- To prove alignment, measure `getBoundingClientRect()` in e2e (assert <=2px) rather than judging screenshots.
- Test-first: for a reported visual bug, add the e2e measurement first, run it on unfixed code and keep the failing output in the PR description — proves the check is real. View mode (`/engineering/dashboard/view/b1`) and edit mode render different markup (no remove button): test both.
- A failing test is only meaningful if it fails for the RIGHT reason: print the measured values and make sure they show the defect (38 vs 44), not an empty selector set.
- Chromium serialises `color-mix()` computed colours as `color(srgb 0.13 0.39 0.9 / 0.1)`, not `rgba(...)`: write assertions that accept both. When a check fails after the style is clearly right, print the computed value before changing the style.
- Compare against the MOCKUP images (not just the rubric): mismatches with the user's designs (e.g. chip style) are the highest-value fixes.
- Use realistic mock data for list screens (several rows, mixed statuses/lengths) — a single row hides alignment, wrapping and emphasis problems. If a new check already passes before the change, label it a regression guard in the PR.
- States, not just the happy path: always screenshot EMPTY, FILTERED-EMPTY and LOADING for every list/dashboard. To test them in e2e, register a later `page.route` that delays then returns `[]` (later routes win; call `route.fallback()` for other requests) and `page.unroute` afterwards, then re-`goto` the page — leaving the override in place breaks later steps.
- Don't over-claim in PR text: 'never flashes' must be verified at FIRST PAINT, not only after 350ms. Check error/failed-fetch states too, not just empty and loading.
- To catch ONE-FRAME states in e2e, install a `MutationObserver` with `page.addInitScript` before `goto` and read a window flag later — screenshots/timeouts can't see a single frame.
- UI copy must be verifiable from the page: no reassurances like 'your data is safe' unless the page knows it.
- Modals: open them WITH typed values at both widths (long labels/amounts expose overflow); measure `max(child.right) - modal-content.right` and footer-vs-field offsets. Bootstrap `.modal-footer` and shared `.btn` margins fight the body padding on phones — scope fixes under `.eng-modal`.
- When you MOVE text out of a `<label>` for looks, re-associate it (`aria-describedby`) in the same PR — don't leave an a11y regression for later. Also: a PR rule like 'keep X byte-identical' must not stop you fixing a regression the PR itself causes.
- 'Fail loudly' in e2e means a clean FAIL line, not an exception that aborts the run: guard null lookups (`el ? … : 'missing'`) so remaining checks still execute.
- New tenants have EMPTY defaults (company name/address/phones/UPI all ''). Always test PDFs and screens with the BARE-settings case, not just the filled-in demo tenant. jsPDF writes text as `(text) Tj`, uncompressed, so e2e can assert on raw PDF bytes (e.g. `!raw.includes('(?)')`).
- demo.tailadmin.com is blocked by the egress proxy (403) — the TailAdmin spec in this file is inferred from its design language, not viewed. Don't retry fetching; ask the user for screenshots if exact values matter.
- Another routine, "Staging QA" (every 4h, :37), runs in this same session and its log `docs/staging-qa-log.md` expects engineering e2e = 50 checks and the new `.eng-*` selectors. If you add/remove e2e checks, tell it by updating that count in its log (branch `claude/staging-qa`) — but only that line.
- Open user questions NOT yours to decide: promote staging→master/prod (explicit user confirmation only, never automatic), lost radiator discounts check, edit-below-received cap.

## Backlog (pick top unchecked; add new items as you find them)
- [ ] **TailAdmin v2 — step 1: token layer** (`eng-theme` wrapper + `--eng-*` tokens in engineering.css) — see DESIGN DIRECTION v2. Do this BEFORE other restyles.
- [ ] **TailAdmin v2 — step 2: Dashboard** metric cards + chart cards + range control to recipes.
- [ ] **TailAdmin v2 — step 3: Billing** table + status badges + filter card.
- [ ] **TailAdmin v2 — step 4: buttons/inputs** inside Engineering.
- [ ] **TailAdmin v2 — step 5: Settings catalog, form cards, modals.**
- [x] Dashboard: KPI cards, chart panels, token colours, empty states — PR #39 (merged).
- [x] Dashboard: date-range segmented control + phone layout — PR #39 (merged).
- [x] Dashboard follow-ups: hoisted `Seg`, fixed `compact()` rounding — PR #40 (merged).
- [x] Service form: validation styling, item column header + row polish — PR #41 (merged).
- [x] Service form follow-ups from #41 review (view-mode header alignment, nits) — PR #42 (merged). Still open (cosmetic): description-field row can wrap at ~768-850px while the column header can't.
- [x] Service form: dropdown height 38px vs input 44px mismatch — PR #43 (merged).
- [x] Service form: quick-add chips to the mockup (brand tint pill) — PR #44 (merged).
- [ ] Service form (remaining, low value): Discount/Received/Payment-mode row spacing; Remove button alignment in the service-card header. DECIDED: leave the empty slot beside Phone — the user's mockup puts BS Model there and BS model is per card by the user's choice; do NOT reorder fields. NOTE: judge the form with VIEWPORT screenshots, not fullPage (the sticky bar renders mid-page in stitched full-page shots and hides content).
- [ ] Service form: view-only mode styling (read-only fields look like text, not disabled inputs).
- [x] Billing: desktop table — numeric alignment + truck emphasis — PR #45 (merged). Row hover already existed (shared).
- [x] Billing: empty state (no bills / filtered) + loading skeleton — PR #46 (merged).
- [x] Billing follow-ups: first-paint flash (`loaded` flag) + fetch-failure state with Retry — PR #47 (merged).
- [x] Billing modal a11y follow-up (re-link hint with aria-describedby) — PR #49 (merged).
- [x] Billing: payment modal + delete modal — PR #48 (merged): hint overflow (60px) on phones, loud uppercase hint, footer 5/13px off fields. Delete modal only got scoping + footer fix (it was fine).
- [ ] Settings: Company / Mechanics / Invoice tabs inside the Engineering branch only (if they are Engineering-specific markup); otherwise log under Needs user.
- [ ] Header/nav for engineering tenants: only if Engineering-specific markup; otherwise Needs user.
- [x] PDF second pass — PR #50 (open, awaiting review): 25 items (3 pages, header repeats, totals ok), long name/address (ok), BARE tenant (no company name) fixed. Still 'Needs user': ₹ glyph + Tamil need an embedded font. Not yet covered: very long single item name (>2 lines), 'Other' comment text overflow, logo/QR/signature images present.
- [ ] Accessibility sweep: labels, aria, contrast, focus order across Engineering screens.
- [ ] Reduced-motion + subtle transitions on cards/buttons within `.eng-*` scope.

## Done
- 2026-10-03: #49 a11y fix merged. #50 PDF no-company-name fix awaiting review.
- 2026-10-03: #48 billing pop-ups merged. #49 a11y fix for #48 awaiting review.
- 2026-10-03: #47 first-paint + failed-load merged. #48 billing pop-ups awaiting review.
- 2026-10-03: #46 billing empty state + skeleton merged. #47 first-paint flash + failed-load state awaiting review.
- 2026-10-03: #45 billing table merged. #46 billing empty state + skeleton awaiting review.
- 2026-10-02: #44 quick-add chips merged. #45 billing table awaiting review.
- 2026-10-02: #43 dropdown height merged. #44 quick-add chips (mockup) awaiting review.
- 2026-10-02: #42 view-mode alignment merged. #43 dropdown height awaiting review.
- 2026-10-02: #41 service form (field errors, item column header, calmer rows) merged. #42 view-mode alignment follow-up awaiting review.
- 2026-10-02: #39 dashboard + #40 dashboard follow-ups merged. #41 service form (field errors, item columns) awaiting review.
- 2026-10-02: Dashboard refine PR #39 merged (segmented range control, KPI tiles, chart panels, donut legend). Follow-ups in #40 awaiting review.
- 2026-10-02: #36 Settings catalog (master/detail, phone cards), #37 bill PDF to mockup, #38 Billing cards + sticky totals bar (by the user's request).

## Needs user (don't act without a decision)
- Tamil text / ₹ glyph on the PDF needs an embedded font file (user to supply or approve one).
- Any change to shared header, shared Settings tabs, shared CSS or other verticals.

## Run log (newest first)
- 2026-10-03 (user request, between runs) — Added DESIGN DIRECTION v2 (TailAdmin-CRM style) + backlog steps 1–5 at the top. Site unreachable (egress 403), spec inferred. Supersedes the earlier 'keep the existing look' choice for Engineering screens (tenant `--primary` stays white-label).
- 2026-10-03 07:56 UTC — Merged #49 (re-ran tsc, eng e2e 75/75, rad 6, auto 10, sal 6 on exact reviewed head 65d0ea2; push notification sent). PDF second pass: generated 3 stress PDFs through the real Print action with parametrised mocks (25 items / very long name+address / empty company name), rasterised every page with pymupdf and looked. Real defect: a tenant with NO company name (every new tenant until Settings is filled!) printed a '?' badge, an empty band and a dangling 'For' -> PR #50 (no badge, band shows invoice.billTitle, footer line omitted). Test-first via a later `page.route` for /settings with company.name='' (all 3 checks failed before). Also folded the #49 e2e nits. eng e2e 78/78. Next run: review #50.
- 2026-10-03 06:56 UTC — Step 1a only: independent review of #49 posted, VERDICT: NO-BLOCKERS (head 65d0ea2). Merge next run. A trade-off I introduced: removing the `|| label` fallback in the e2e hint check makes a missing hint THROW inside page.evaluate (aborts the rest of that run as an ERROR; later checks don't execute). Better: `hint ? getComputedStyle(hint) : null` with 'missing' values so it FAILS cleanly and the suite continues. Also compare the aria-describedby text to the `.eng-hint` element's own text instead of hardcoding the copy. Fold both into the next e2e-touching PR.
- 2026-10-03 05:56 UTC — Merged #48 (re-ran tsc, eng e2e 74/74, rad 6, auto 10, sal 6 on exact reviewed head cc2c72a; push notification sent). Paid back the a11y regression #48 introduced: PR #49 gives the hint an id and the discount input `aria-describedby` (2-line diff), e2e reads the input's accessible description (failed first with ids=[]), documented the modal-footer `!important`, removed the `|| label` fallback in the hint check. eng e2e 75/75. Next run: review #49. Remaining backlog: PDF 2nd pass, accessibility sweep across Engineering screens (labels/aria/contrast/focus order), motion polish.
- 2026-10-03 04:56 UTC — Step 1a only: independent review of #48 posted, VERDICT: NO-BLOCKERS (head cc2c72a). Merge next run. OWN A REGRESSION I INTRODUCED: moving the discount hint out of the `<label>` into a separate `<small>` dropped it from the input's accessible name (screen readers no longer hear 'optional…'). FOLLOW-UP (right after merge, small PR): give the `<small>` an id and add `aria-describedby` on `#payment-discount` (a deliberate one-attribute change to the input), add an e2e that reads the input's accessible description (`page.getByLabel`/`locator.evaluate(el => el.getAttribute('aria-describedby'))` → element text), comment why `!important` is needed on the modal footer padding/margin, and drop the `|| label` fallback in the e2e hint check.
- 2026-10-03 03:56 UTC — Merged #47 (re-ran tsc, eng e2e 71/71, rad 6, auto 10, sal 6 on exact reviewed head 9a67e90; push notification sent). Billing pop-ups: opened Record Payment AND Delete at 1300 and 390 with typed values. Found: discount hint was uppercase semibold, overflowed the modal 60px on phones (clipped), footer buttons -5/+13px off fields -> PR #48. Measured-first (all 3 checks failed with real numbers), then CSS scoped under `.eng-modal`; footer fixed with `.modal-footer` padding + `> .btn { margin:0; width:100% }` on phones. Payment logic untouched; existing additive-discount e2e still passes. eng e2e 74/74. Next run: review #48.
- 2026-10-03 02:56 UTC — Step 1a only: independent review of #47 posted, VERDICT: NO-BLOCKERS (head 9a67e90). Merge next run. Reviewer confirmed the fetch logic is byte-for-byte unchanged apart from three display flag setters, the skeleton can't get stuck, and a failed refresh with stale rows behaves as on staging. Optional nits to bundle later: replace fixed waits in the new e2e checks with waitFor on text; disable Retry while loading (double-click fires two fetches — same pattern as filters); consider surfacing a failed-refresh banner when stale rows are shown.
- 2026-10-03 01:56 UTC — Merged #46 (re-ran tsc, eng e2e 68/68, rad 6, auto 10, sal 6 on exact reviewed head 3268fe0; push notification sent). Took the review's follow-ups -> PR #47. Test-first with REAL reds: a MutationObserver installed via `page.addInitScript` BEFORE navigation saw the empty state on first commit (`sawEmpty=true`) — proving my own PR-#46 claim 'never flashes' was wrong, and the PR text now says so; a mocked 500 showed 'No bills yet'. Fix: display-only `loaded` + `loadError` flags set inside the existing try/catch/finally of getTableData (fetch logic untouched). Dropped a draft 'Your bills are safe' copy line (unverifiable reassurance). eng e2e 71/71. Next run: review #47.
- 2026-10-03 00:56 UTC — Step 1a only: independent review of #46 posted, VERDICT: NO-BLOCKERS (head 3268fe0). Merge next run. FOLLOW-UPS to do right after merging (small PR): (1) honest correction — my PR text said the list 'never flashes no-bills' but on FIRST paint `loading` is false and `recordData` is [] for one frame: add a display-only `loaded` flag (skeleton until the first fetch settles); do NOT change the `loading` initialiser; add an e2e that reads the DOM synchronously on first render if feasible (e.g. `page.addInitScript` / check the first mutation) or at least asserts the skeleton is present before the first response resolves; (2) fetch FAILURE shows 'No bills yet / New service' beside the error alert — show 'Couldn't load bills' + Retry (needs a display-only `loadError` flag set in the existing catch); (3) `role="status"` announce nit.
- 2026-10-02 23:56 UTC — Merged #45 (re-ran tsc, eng e2e 65/65, rad 6, auto 10, sal 6 on exact reviewed head d6b0fd6; push notification sent). Billing with ZERO bills showed a bare 'No Records Found' row -> PR #46: 'No bills yet' + New service / 'No bills match these filters' + Clear filters (derived from existing filter state) + loading skeleton so the list never flashes 'empty' before data. Test-first (3 checks failed with the old text). Found in screenshots: phone empty card's border clipped by the square cell background -> dropped the frame. eng e2e 68/68. Next run: review #46.
- 2026-10-02 22:56 UTC — Step 1a only: independent review of #45 posted, VERDICT: NO-BLOCKERS (head d6b0fd6). Merge next run. Reviewer confirmed no overlap at the 768px breakpoint (min-width:768 vs max-width:767.98), shared table CSS has no text-align !important, and the hover check is a labelled regression guard (shared apple-rebrand.css:105 already provides row hover). Nits only.
- 2026-10-02 21:57 UTC — Merged #44 (re-ran tsc, eng e2e 62/62, rad 6, auto 10, sal 6 on exact reviewed head 4fadf04; push notification sent). Billing desktop table with FIVE mock bills in mixed states (a 1-bill mock hides alignment problems): money columns were left-aligned, numerals not tabular, truck no. regular -> PR #45. Test-first gave real red values; the row-hover check passed already (shared styles) so it's a regression guard, not a fix — say so in the PR, don't claim it. eng e2e 65/65. Next run: review #45.
- 2026-10-02 20:56 UTC — Step 1a only: independent review of #44 posted, VERDICT: NO-BLOCKERS (head 4fadf04). Merge next run. Reviewer verified contrast (~4.8:1, hover tint ~4.5:1), that `color-mix` is already used elsewhere, and that the `!important`s are needed against shared `.btn-light` rules. Nit only: the global `.btn:active` scale still applies under reduced motion.
- 2026-10-02 19:56 UTC — Merged #43 (re-ran tsc, eng e2e 61/61, rad 6, auto 10, sal 6 on exact reviewed head 1693f34; push notification sent). Compared the form to the mockup: quick-add chips were grey buttons, mockup shows pale-blue pills -> PR #44 (`.eng-form .btn.eng-quick`, color-mix of --primary). Test-first done properly again: class-only run gave the real failure {color:rgb(29,29,31), bg:rgb(248,249,250)}. Chromium serialises color-mix() as `color(srgb r g b / a)` — an assertion expecting `rgba(` failed first; fixed the TEST not the style. Also folded in #43 nits. eng e2e 62/62. Next run: review #44.
- 2026-10-02 18:56 UTC — Step 1a only: independent review of #43 posted, VERDICT: NO-BLOCKERS (head 1693f34). Merge next run. Optional nits to bundle into the next form PR: assert `inputs[0] === 44` for a clearer failure; make the dropdown e2e less order-dependent (filter controls outside `.eng-line` instead of `slice(0,4)`).
- 2026-10-02 17:56 UTC — Merged #42 (re-ran tsc, eng e2e 60/60, rad 6, auto 10, sal 6 on exact reviewed head 1691015; push notification sent). Refined form -> PR #43: react-select controls were 38px beside 44px inputs (mechanic vs lorry address, payment mode vs discount); scoped `.eng-form div[class*="-control"] { min-height: var(--control-h) }`. Test-first: first run failed only because `.eng-form` didn't exist (empty arrays = meaningless red) — added the class alone to get the REAL failure `{inputs:[44],selects:[38]}`, then the rule. eng e2e 61/61. Next run: review #43.
- 2026-10-02 16:56 UTC — Step 1a only: independent review of #42 posted, VERDICT: NO-BLOCKERS (head 1691015). Merge next run. Nits (optional): drop the `?` in the exact-colour regex; the error-colour check is tied to the default `--danger` (fine unless a tenant theme redefines it).
- 2026-10-02 15:56 UTC — Merged #41 (re-ran tsc, eng e2e 59/59, rad 6, auto 10, sal 6 on exact reviewed head 136b30e). Took the reviewer's follow-ups: wrote the view-mode alignment check FIRST and watched it FAIL ({q:30,r:30,a:-30}), then fixed (skip the `.eng-lh-x` slot when `isView`), 0px after. PR #42, eng e2e 60/60. Push notification sent for the #41 merge. Next run: review #42.
- 2026-10-02 14:56 UTC — Step 1a only: independent review of #41 posted, VERDICT: NO-BLOCKERS (head 136b30e). Merge next run. Follow-ups from the review (do right after merging, small PR): (1) VIEW MODE — header renders `.eng-lh-x` even though the remove button is absent, so AMOUNT header sits ~30px right of the values: skip `.eng-lh-x` when `isView` and extend the e2e alignment check to `/engineering/dashboard/view/b1`; (2) rows with the 220px description field can wrap at ~768-850px while the header can't (cosmetic); (3) tighten the error-colour regex to rgb(231, 74, 74); drop the no-op `.eng-lh-amt{padding-right:0}`.
- 2026-10-02 13:56 UTC — Merged #40 (re-ran tsc, eng e2e 57/57, rad 6, auto 10, sal 6 on exact reviewed head 5b48df2; pushed notification sent). Refined service form -> PR #41: error colour+ring on invalid fields, QTY/RATE/AMOUNT header aligned to the fields (0px, measured in e2e), hairline rows, removed doubled rule above sticky bar. eng e2e 59/59; both new checks verified to fail on old code. Next run: review #41.
- 2026-10-02 12:56 UTC — Step 1a only: independent review of #40 posted, VERDICT: NO-BLOCKERS (head 5b48df2). Reviewer ran `compact()` on 20 values (correct) and confirmed the focus test fails on the old code. Merge next run. Nits (optional, bundle into a later PR): comment the promotion test in `compact()`.
- 2026-10-02 11:56 UTC — Merged #39 (re-ran tsc, engineering e2e 56/56, radiator 6, automobile 10, salary 6 on the exact reviewed head dcd5761). Then took the reviewer's two follow-ups: hoisted `Seg` (focus survived-click bug) and fixed `compact()` rounding; opened PR #40, engineering e2e 57/57. Verified the new focus check FAILS on the old code (use this technique: stash only the source file, rerun e2e, pop). Next run: review #40.
- 2026-10-02 10:56 UTC — Step 1a only: independent review of #39 posted, VERDICT: NO-BLOCKERS (head dcd5761). Merge next run. Follow-ups from the review (do in a later small PR, not #39): hoist `Seg` out of `EngDashboard` (remounts each render, loses keyboard focus); `compact(999999)` shows "1000k".
- 2026-10-02 10:00 UTC (first fired run) — Backlog items 1+2 (Dashboard). Before/after screenshots at 1300/390; fixed phone date-input overflow; recharts donut animates ~2s, wait >=3s before screenshots. Opened PR #39; engineering e2e 56/56, radiator 6, automobile 10, salary 6 no FAIL. Next run: review #39.
