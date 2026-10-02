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
- Another routine, "Staging QA" (every 4h, :37), runs in this same session and its log `docs/staging-qa-log.md` expects engineering e2e = 50 checks and the new `.eng-*` selectors. If you add/remove e2e checks, tell it by updating that count in its log (branch `claude/staging-qa`) — but only that line.
- Open user questions NOT yours to decide: promote staging→master/prod (explicit user confirmation only, never automatic), lost radiator discounts check, edit-below-received cap.

## Backlog (pick top unchecked; add new items as you find them)
- [x] Dashboard: KPI cards, chart panels, token colours, empty states — PR #39 (merged).
- [x] Dashboard: date-range segmented control + phone layout — PR #39 (merged).
- [x] Dashboard follow-ups: hoisted `Seg`, fixed `compact()` rounding — PR #40 (merged).
- [x] Service form: validation styling, item column header + row polish — PR #41 (merged).
- [x] Service form follow-ups from #41 review (view-mode header alignment, nits) — PR #42 (merged). Still open (cosmetic): description-field row can wrap at ~768-850px while the column header can't.
- [x] Service form: dropdown height 38px vs input 44px mismatch — PR #43 (merged).
- [x] Service form: quick-add chips to the mockup (brand tint pill) — PR #44 (open, awaiting review).
- [ ] Service form (remaining, low value): Discount/Received/Payment-mode row spacing; Remove button alignment in the service-card header. DECIDED: leave the empty slot beside Phone — the user's mockup puts BS Model there and BS model is per card by the user's choice; do NOT reorder fields. NOTE: judge the form with VIEWPORT screenshots, not fullPage (the sticky bar renders mid-page in stitched full-page shots and hides content).
- [ ] Service form: view-only mode styling (read-only fields look like text, not disabled inputs).
- [ ] Billing: desktop table polish (row hover, numeric alignment, status pill palette, balance emphasis), empty state, loading skeleton.
- [ ] Billing: payment modal + delete modal layout (Engineering-only markup, if scoped) and phone sizing.
- [ ] Settings: Company / Mechanics / Invoice tabs inside the Engineering branch only (if they are Engineering-specific markup); otherwise log under Needs user.
- [ ] Header/nav for engineering tenants: only if Engineering-specific markup; otherwise Needs user.
- [ ] PDF: second pass (long item lists multi-page, long company name in band, many-row totals block), compare against mockup.
- [ ] Accessibility sweep: labels, aria, contrast, focus order across Engineering screens.
- [ ] Reduced-motion + subtle transitions on cards/buttons within `.eng-*` scope.

## Done
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
