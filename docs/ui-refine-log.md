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

## Backlog (pick top unchecked; add new items as you find them)
- [ ] Dashboard: KPI cards (type scale, tabular numerals, icon tile, outstanding emphasis), chart card headers, consistent chart colours via tokens, empty-state when no data.
- [ ] Dashboard: date-range filter as a segmented control (Today / Month / FY) + custom range; phone layout.
- [ ] Service form: header fields grid rhythm; service-card header (type · BS model chips); item lines; quick-add chips styling; validation message styling.
- [ ] Service form: view-only mode styling (read-only fields look like text, not disabled inputs).
- [ ] Billing: desktop table polish (row hover, numeric alignment, status pill palette, balance emphasis), empty state, loading skeleton.
- [ ] Billing: payment modal + delete modal layout (Engineering-only markup, if scoped) and phone sizing.
- [ ] Settings: Company / Mechanics / Invoice tabs inside the Engineering branch only (if they are Engineering-specific markup); otherwise log under Needs user.
- [ ] Header/nav for engineering tenants: only if Engineering-specific markup; otherwise Needs user.
- [ ] PDF: second pass (long item lists multi-page, long company name in band, many-row totals block), compare against mockup.
- [ ] Accessibility sweep: labels, aria, contrast, focus order across Engineering screens.
- [ ] Reduced-motion + subtle transitions on cards/buttons within `.eng-*` scope.

## Done
- 2026-10-02: #36 Settings catalog (master/detail, phone cards), #37 bill PDF to mockup, #38 Billing cards + sticky totals bar (by the user's request).

## Needs user (don't act without a decision)
- Tamil text / ₹ glyph on the PDF needs an embedded font file (user to supply or approve one).
- Any change to shared header, shared Settings tabs, shared CSS or other verticals.

## Run log (newest first)
