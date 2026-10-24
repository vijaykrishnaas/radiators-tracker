# Tyre vertical — review log

Hourly reviewer + fixer runs. Each run takes the bugs the user reported first, otherwise the next area in the rotation:
a) money logic · b) challan form UI · c) list + dashboard · d) printed PDF · e) settings / inventory / bonus · f) other verticals.
A finding is logged only when reproduced (failing test, screenshot or exact steps), and every fix ships with a test.

## User-reported bugs (open)
_None reported yet. Add them here (screen, what you did, what went wrong) and the next run takes them first._

## Run 1 — 2026-10-24 — area (a) money logic

1. **An installment showed as overdue on its own due date when the server runs west of UTC.**
   Repro: `TZ=America/New_York node --experimental-test-module-mocks --test test/tyrebill.dao.test.js`, so the
   "row status and overdue" test fails. Due dates are stored as UTC midnight of the calendar day; overdue compared that
   instant with the server's local midnight. Fix: compare calendar days (`dayOf` / `todayOf` in tyrebill.dao.js) in
   enrich, the overdue list filter and the dashboard follow-up. Test: "not overdue on its own due date, whatever the
   server's time zone" (switches the process TZ across UTC, IST, New York, Honolulu).
2. **A full-payment challan discounted to ₹0 stayed "Not Received" forever** (nothing left to collect).
   Fix: nothing to collect counts as Received. Test: "a challan discounted to ₹0 is settled".
3. **A discount larger than what was still owed silently cut "received"**. For example, ₹40,000 received on ₹48,500,
   then a ₹10,000 discount, left received at ₹38,500 while the payment log still said ₹40,000. Fix: a discount can't be
   more than what is still owed. Test: "a discount can't cut the total below what was already received".

Gate: backend 91/91; tsc + build OK; e2e tyre 28/28, automobile / engineering / radiator / salary 0 FAIL.

Left open (not tyre-specific, same pattern in every vertical, so not changed here):
- The bill-date filters (from/to) use the server's local midnight, as in the other verticals.
- "Today" is the server's calendar day. On a UTC server, an installment due yesterday (IST) becomes overdue at
  05:30 IST, not at midnight.

## Run 2 — 2026-10-24 — area (b) challan form UI

I reviewed screenshots of every form state (empty, validation errors, edit with a locked row, view, payment modal) at
1300px and 390px, in light and dark mode. There were no page errors and no sideways scroll. Each bug below has an e2e
check that fails on the old code and passes on the fix (`e2e/tyre.e2e.mjs`).

1. **The model / size name was cut off on desktop** ("10.00-20 Ste…"), and it is the tyre's key detail. Fix: the model
   field spans two columns from 768px up. Check: "the chosen model / size is shown in full" (old code: 39px cut).
2. **An Overdue badge covered the installment total in edit mode** ("₹27,500.0(" on screen). The status cell was too
   narrow for a badge plus the remove button and spilled left. Fix: wider status column; the total cell doesn't wrap.
   Check: "installment totals aren't covered by an Overdue badge" (old code: 2 rows covered). The first version of this
   check measured overflow inside the total cell, which can't see a neighbour painting over it, so it was rewritten to
   compare the two boxes.
3. **Phone installment rows were 314px tall, with the remove ✕ alone on its own line.** Fix: status and ✕ sit beside the
   installment name; principal | interest side by side; total on one line. Rows are now 268px. Check: "phone installment
   rows are compact, remove sits beside the name".
   - The first fix put principal, interest and total in three columns, which cut "27500" down to "2". I caught it in the
     screenshot, not by a test. Fixed with two columns, and a new check "phone installment amounts are fully visible",
     which was confirmed to fail on the three-column layout.
4. **Saving an untouched form flagged every default installment row with "Enter an amount"** before any tyre was added
   (three repeated errors). Fix: those row errors wait until the challan has a tyre amount; the tyre fields say what
   to fill in first. Check: "untouched form doesn't flag every installment row".

Gate: backend 91/91; tsc + build OK; e2e tyre 33/33, automobile / engineering / radiator / salary 0 FAIL.

Seen, not changed:
- Date inputs show mm/dd/yyyy in the test browser. That is its en-US locale; an Indian-locale browser shows dd/mm/yyyy.
- In view mode, required asterisks and the "Optional notes" placeholder still show. The other verticals' view screens
  do the same.

## Run 3 — 2026-10-24 — area (c) challan list + dashboard

The dashboard analytics pipeline had **never been executed**, because the fake test DB had no aggregate(). Test-only
change: `mingo` (an in-memory implementation of MongoDB's aggregation) is now a backend devDependency, and FakeDb's
aggregate() runs pipelines with it. The real pipeline was then run on three hand-checked challans: every KPI, the
month / status / brand / mechanic breakdowns and the collection rate matched. Test: "dashboard analytics add up".
The pipeline itself had no bug.

1. **Sorting the list by "Next due" put full-payment challans first.** They have no due date, and MongoDB sorts empty
   values first, so the challans actually due soonest were buried. Fix: a direction-aware sort key keeps challans with
   nothing scheduled last in both directions. `parseSort` (utils/listSort.js) now also accepts `(dir) => expression`;
   existing callers are unchanged. Test: "sorting by next due puts challans with nothing scheduled last, both ways".
   - While fixing this I found the Excel export ignored computed sort keys, so it would export in a random order under
     this sort. It now uses the aggregation path, as the automobile export does. The same test covers the export, and it
     was confirmed to fail without that change.
2. **The dashboard's "installments to collect" table showed only 3 of 7 columns on a phone.** Balance, phone,
   installment and the status were off-screen, though chasing customers from a phone is the main use. Fix: on phones it
   is a compact list (customer, status, installment · due · D.C., balance and a Call button). Check: "phone dashboard
   shows balance and a call button for each installment".
3. **On phone challan cards the ⋮ menu dropped to its own line next to a "Not Received" badge.** This is the shared
   card component and automobile reproduced it too (2 of 10 cards). Fix in `ui.css`: the title shrinks (min 6em) before
   the badge or menu wrap. Check: "phone challan cards keep the menu on the title line". Automobile, engineering,
   radiator and salary suites: 0 FAIL.

Gate: backend 93/93; tsc + build OK; e2e tyre 35/35, automobile / engineering / radiator / salary 0 FAIL.

Open — design questions, not tyre bugs (they are the same in every vertical):
- Desktop lists scroll sideways at 1300px. The money columns (To collect, Received, Pending, Status) start off-screen.
  Automobile is the same (1559px table in a 960px box).
- In the "To collect vs collected" monthly chart the two bar colours are hard to tell apart in dark mode. It is the
  shared chart palette.

## Run 4 — 2026-10-24 — area (d) printed challan PDF

Challans were printed through the app's Print button and every page rendered to PNG (`pdftoppm`). Cases: a normal
installment challan; 14 tyre lines plus 12 installments (multi-page); full payment with a discount and very long
customer name, address and serials; a bare challan; each with a short and a very long company name / address. New e2e
checks print real challans and read word positions with `pdftotext -bbox`. They report SKIP, not PASS, when poppler
isn't installed. All four checks below failed on the old code and pass now.

1. **The signature block went onto its own blank page.** A 3-installment challan with a long company name printed 2
   pages. The page-break test reserved about 32mm for a block that uses about 24mm. Fix: the block's real extent decides.
   Check: "a short challan with a long company name is one page" (old: 2 pages).
2. **Text overprinted in several places**: the tyre name ran into the tyre number ("…S3C8MRF-77882",
   "…XT-7SN-100001"); a 2-line customer name printed over the address; a long "For <company>" printed over
   "Authorised signatory". Fix: 1mm cell padding, a wider Tyre column (shorter "Tube, flap" text), the address placed
   below the name's real height, and the "For" line wraps with the block growing to fit. Check: "no words overprint"
   (any two words whose boxes overlap; old: many hits).
3. **Paise printed as "Rs 32,750.5".** Fix: amounts with paise always show two decimals. Check: "paise print as .50".
4. **Pages 2 and 3 of a long challan had no D.C. number or page number** (a loose page couldn't be matched to its
   challan), and only the last page had the footer. Fix: a footer on every page with "D.C. No X · Page n of N" when
   there is more than one page; tables stop above it. Check: "every page of a long challan is numbered".
5. **A long company name took 4 lines at 17pt** (a third of the page). It now steps down to fit two lines (not below
   11pt). Covered by check 1.
6. **Numeric column headers (Rate, Amount, Principal…) didn't line up over their right-aligned values.** Fix: headers
   take the column's alignment. Seen in the renders; not separately tested.
7. **A tyre row split across pages** ("…Belted Radial" on page 1, "Tubeless" alone on page 2). Fix: rows never split.
   Checked in the render of the 14-tyre challan; not separately tested.

Gate: backend 93/93; tsc + build OK; e2e tyre 39/39, automobile / engineering / radiator / salary 0 FAIL.

Left as is: a very long tyre number (many serials in one field) wraps mid-word in its 22mm column. It is readable and
doesn't overprint.

## Run 5 — 2026-10-24 — area (e) settings, inventory, bonus

**Logic, run end to end on hand-checked data (now possible because the fake DB runs real aggregations):**
- Tyre inventory: bought, sold, remaining, average cost, stock value and profit per brand + model are correct. A brand
  renamed in Settings shows its new name.
- Bonus: mechanic 2% and labour 1% of the tyre amount are correct. Changing the mechanic on an edit moves the pending
  entry to the new mechanic, with no duplicate. Removing a worker drops their pending entry. The review data and the
  pending-by-range rows match.

**Bugs, all reproduced:**
1. **A mechanic removed from Settings vanished from the bonus pages** (Mechanic Bonus filter and the review picker)
   while they still had challans and unpaid bonus, so the bonus couldn't be reviewed. `/mechanic` read only radiator
   bills plus Settings, so a tyre or automobile tenant got the Settings list only. The challan form, on `/tyre-mechanic`,
   still listed them. Fix: `/mechanic` returns the tenant's own names (new `dao/mechanics.dao.js`: Settings plus that
   vertical's bills; radiator unchanged, engineering keeps its own route). Test: "a mechanic removed from Settings still
   appears on the bonus pages while they have challans". It fails with the old radiator-only lookup.
2. **The Settings → Tyre Catalog tab was 174px wider than a phone**, so the whole page scrolled sideways. Each brand
   card, a grid item, stretched to its model table's full width. Fix: brand cards may shrink (`min-width: 0`); the table
   scrolls inside its card as other settings tables do. Check: "settings tyre catalog fits a 390px phone" (old:
   overflow 174px).

Gate: backend 94/94; tsc + build OK; e2e tyre 40/40, automobile / engineering / radiator / salary 0 FAIL.

Open (all verticals, not tyre-specific): the Labour Bonus review picker lists only the Settings labour list, so a worker
removed from Settings can't be picked for a review. There is no "names on bills" source for labour yet.

## Run 6 — 2026-10-24 — area (f) regressions in the other verticals

Method: a visual regression against the code from before any tyre work (`88c407f`). The repo's own sweep
(`e2e/screens.mjs`, same mocked data) ran on the old and the current code: all 27 non-tyre screens at 390px and
1280px, light and dark (108 screenshots each), compared pixel by pixel.

- First pass: every screenshot "differed". That was the harness, not the app: the old copy's fonts were blocked (its
  linked node_modules was outside Vite's serving allow-list). Fixed in the harness; nothing in the repo.
- Real comparison: **92 / 108 identical.** The rest:
  - Chart animation timing on the radiator dashboard and review pages (12–134 pixels). The same spots differ between
    two shots of the old code, so this is noise.
  - Phone bill cards (radiator, automobile, engineering) and bonus pages: the intended run-3 fix, where the ⋮ menu is
    no longer stranded alone under a "Not Received" badge.
  - **A regression from run 3, now fixed:** on phone Employees cards the role badge rose up beside the salary while the
    status badge and ⋮ dropped to the next line, splitting the group. Run 3's fix let the card title shrink so more
    items fit on line 1. Root fix in the shared `MobileCard`: badges and the menu are one group (`.m-card-tail`) that
    wraps as a whole, and the title-shrink change is reverted. This also fixes a pre-existing split on the old code
    ("Old Staff": "Other" beside the salary). Check (salary e2e): "phone employee badges and menu stay together". It
    fails on the pre-tyre code (Old Staff split) and on the run-3 state (every card split), and passes now. The tyre
    card check is now "menu beside its badge".

Gate: backend 94/94; tsc + build OK; e2e tyre 40/40, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

This completes the first full rotation (a–f).

## Run 7 — 2026-10-24 — area (a) money logic, second round (concurrency + fuzz)

New angles: payments landing at the same moment, and a random-operation fuzz test. The fuzz ran 40 challans × 12
random steps (payments, discounts, plan edits, type switches, odd amounts like 0.01 and 19,999.99). After every step it
checked that received equals the payment log and the sum of installment payments, pending equals to-collect minus
received, the status matches the amounts, no row is overpaid, and principals still add up to the tyre amount.
**Result: 217 accepted operations, 0 violations.** Every rejection was a deliberate 400 with a clear message.

1. **Two payments at the same moment both reported success, but only one was saved.** This could happen with a
   double-tapped Record Payment, or two people collecting at once. Repro: two parallel ₹15,000 payments on a ₹20,400
   installment → both "recorded", row paid ₹15,000, one log entry, so one customer payment was lost. The run-1 guard
   compared `updatedAt`, and two writes in the same clock tick carry the same timestamp (milliseconds in MongoDB, whole
   seconds in the fake DB). Fix: an integer revision (`rev`) that every write must match and then increments, so the
   second write is refused with "changed by someone else, reload" (409). Challans saved before this have no `rev`
   and count as revision 0. Tests: "two payments at the same moment never lose one" (fails on the old guard), "a
   challan saved before revisions existed can still be paid and edited"; the run-1 stale-read test now bumps `rev`.

Also traced, no bug: an edit form left open while someone else records a payment. The server re-reads at save time,
the newly paid row comes back locked with its payment, and changing it is refused.

Gate: backend 96/96; tsc + build OK; e2e tyre 40/40, automobile / engineering / radiator / salary 0 FAIL.
