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

## Run 8 — 2026-10-24 — area (b) challan form, second round (behaviour)

This round drove the real form instead of judging screenshots (real DAO behind it).

Correct, no change:
- Due dates clamp at month end (31 Jan → 28 Feb → 31 Mar).
- A hand-picked due date stays when the challan date changes; the other rows move.
- Removing a middle installment renumbers the default names and re-dates the untouched rows.
- Changing the brand clears the model and rate.
- A quantity of 1.5 is refused.
- The payment modal won't send more than what is left on the installment (the browser's own limit blocks it).

1. **A failed Save didn't show where the mistake was.** The toast said "Fix the highlighted fields", but the highlighted
   field was off-screen. On a phone (390×844), Save from the top with an installment mistake left the error 2,229px
   down; Save from the bottom with no vehicle number left it 1,330px up. Desktop too: 955px in a 900px window. Fix:
   after a failed Save the first error scrolls into view and the cursor goes into its field. Checks: "phone Save
   scrolls down to an installment error" and "phone Save scrolls up to a missing vehicle number and puts the cursor
   there". Both fail on the old code.

Gate: backend 96/96; tsc + build OK; e2e tyre 42/42, automobile / engineering / radiator / salary 0 FAIL.

Seen, not changed: the over-payment message in the payment modal is the browser's own ("Value must be less than or
equal to …"). It works, but it isn't the app's wording.

## Run 9 — 2026-10-24 — area (c) list + dashboard, second round (behaviour)

The list's filter queries were checked with real MongoDB matching (mingo), because the fake DB treats an empty
`nextDueDate` like a date. Correct, no change:
- Filters: overdue, search by tyre serial and by D.C. number, status, payment type, brand, customer, date range.
- The dashboard follow-up totals.
- All 11 sort columns in both directions with no rows lost; paging 3 + 1.

Browser: the dashboard's "Open overdue challans" lists only the overdue challan, on desktop and on a phone (where the
"Filters 1" badge shows a filter is on). The Excel export has the Challans / Tyres / Installments sheets with real
numbers (paise exact), the overdue amount and the row statuses.

1. **"Clear filters" left `?overdue=1` in the address**, so a reload, Back or a shared link brought the overdue filter
   back. Repro: open the overdue list from the dashboard, Clear filters (all challans show), reload → overdue-only again.
   Fix: the Overdue only tick and the address stay in step (ticking adds `?overdue=1`, unticking or Clear removes it).
   Check: "after Clear filters a reload doesn't bring the overdue filter back" (fails on the old code), plus "ticking
   Overdue only puts it in the address".

Gate: backend 96/96; tsc + build OK; e2e tyre 45/45, automobile / engineering / radiator / salary 0 FAIL.

Seen, not changed: Excel dates are text (d/m/yyyy), as in the other verticals' exports.

## Run 10 — area (d) printed PDF, round 2
Printed four new stress cases: 30 installments, Tamil text, crore-sized amounts, and a long Settings title with signature on.
- **Bug: a long challan title printed over the company name.** Repro: Settings → invoice title "Delivery Challan cum Installment Agreement" → print → "DELIVERY" overlaps "MURUGAN TYRES". Fix: the title wraps to at most 2 lines (shrinking from 12pt to 10pt if needed), the company name gets the remaining width, and the date / D.C. No move down below the title. Test: `tyre pdf: a long title does not print over the company name` (fails on the old code with 3 overprints, passes now).
- Fine: 30 installments break cleanly across pages with numbered footers; the signature image prints in place.
- **Open (needs a decision): Tamil text prints as garbage.** jsPDF's built-in fonts are Latin-only. This affects every invoice type, not just tyre. Fixing it means embedding a Tamil font (about 200–400 KB more per print bundle).
- Not changed: amounts of ₹1 crore and up wrap "Rs" onto a second line in the amount column. Unrealistic for one challan.
Gate: backend 96/96, tsc + build OK, e2e tyre 46/46, automobile / engineering / radiator / salary 0 FAIL.

## Run 11 — area (e) settings, inventory, bonus, round 2 (behaviour)
Read through the bonus, inventory and catalog code again for edge cases, then drove Settings → Tyre Catalog in the browser at 390px and 1300px.

**Bugs, both reproduced in the browser:**
1. **A duplicate model's error was shown at the top of the catalog, off screen.** Repro: with four brands, add an existing model under the last brand → nothing visible happens. The error was 1,310px above the screen on a phone and 1,583px above on desktop. Fix: each brand card shows its own model error under its table ("9.00-20 XT-7 is already under Apollo"), and it clears as soon as you type. The brand error at the top now also clears when you type. Test: `tyre: a duplicate model's error shows beside its brand, on screen` (old code: error outside the card, off screen).
2. **On a phone the catalog's rate column was cut off at the card edge.** Every rate box showed only "₹" and a blank strip, so the rates could only be seen by scrolling each table sideways. The table needed 491px in a 280px card: the header wasn't allowed to wrap, the delete column was 120px wide (the shared table minimum) and the name column had a 200px minimum. Fix (tyre catalog on phones only; automobile's table is unchanged): fixed columns name · rate (124px) · delete (48px), a wrapping header and tighter padding. Rates up to 6 digits are fully visible. Test: `tyre: phone catalog shows each model's rate inside its card` (old code: rate input outside the card). Trade-off: on a phone a long model name shows its first ~12 characters until you tap it.

**Checked, fine:**
- Old challans stay editable after their brand or model is removed from the catalog (server and form).
- Tyre stock entries reject fractional quantities with "Whole tyres only".
- Recalculate, review and manual bonus all use the tyre settings and the tyre bonus-year start.
- The bonus review lists tyre lines by brand + model.

**Open (all verticals, not tyre-specific):**
- Settings are saved without checks, so a brand, model or part name can be cleared to blank. The same happens with automobile parts.
- The bonus % box accepts more than 100. The server caps it at 100, so Settings can show 150% while 100% is paid. Automobile and engineering behave the same way.
- Automobile only: a manual mechanic bonus and the Bonus page's "this year" use the radiator year-start setting, not `automobile.bonus.yearStartMonth`. Both are 4 (April) unless changed, and the automobile one has no field in Settings, so in practice they agree.

Gate: backend 96/96; tsc + build OK; e2e tyre 48/48, automobile / engineering / radiator / salary 0 FAIL.

## Run 12 — area (f) regressions in the other verticals, round 2 (behaviour)
No shared (non-tyre) file has changed since run 6, so its pixel comparison still stands. This round read every shared change made by the tyre work (30 files) for changes in behaviour that screenshots can't show:
- **Backend:**
  - `/mechanic` returns the same sorted name list from the radiator, automobile and tyre lookups. Radiator and engineering tenants get exactly what they got before.
  - `parseSort` only adds a function case, so existing string and expression sort keys are unchanged.
  - Bonus review and Recalculate only add a tyre branch.
  - The settings backfill only adds the missing `tyre` key.
  - The new indexes are on `tyrebills` only.
  - Client export and offboarding also cover `tyrebills`.
- **Frontend:**
  - The payment modal, given no installments, resets, shows the discount and submits exactly as before.
  - Every automobile inventory string expands to its old wording ("Stock by part", "-- All parts --", "Profit on parts sold", …).
  - The audit-filter, Settings-tab, navigation, route and year-start helpers only add tyre cases.
  - `tyre.css` has no selector outside `.tyre-*`.

Nothing new found.
Seen, pre-existing (not from tyre work): the super-admin "client settings" view shows the radiator bonus / catalog block for every vertical. Automobile and engineering already did this before tyre existed.
Gate: no code changed this run (last full gate: run 11, all green).

## Run 13 — area (a) money logic, round 3 (edits after a discount)
Looked for ways an edit could change money that was already agreed or collected on a full-payment challan.

**Bugs, both reproduced with the real DAO:**
1. **Editing a discounted challan below its discount silently closed it.** Repro: ₹48,500 challan → Record payment with ₹0 and a ₹2,000 discount → edit the line to one ₹1,500 tyre. The edit was accepted. The discount was quietly cut to ₹1,500, the amount to collect became ₹0, and the challan showed **Received** with nothing collected. Fix: an edit can't take a full-payment challan below received + discount. The message for this case is "A ₹2,000 discount is already on this challan, so its total can't go below ₹2,000". Test: "editing a discounted challan below its discount is refused, not silently marked Received" (old code: edit accepted).
2. **The "can't go below" check ignored the discount, so its message was wrong.** Repro: ₹3,000 received + ₹2,000 discount → edit the total to ₹4,000. It was refused with "₹3,000 is already received, so the challan total can't go below that", though ₹4,000 is above ₹3,000. Now: "₹3,000 received and a ₹2,000 discount are already on this challan, so its total can't go below ₹5,000". ₹5,000 is accepted and the challan is Received. Test: "cutting a challan below received + discount names both amounts".

**Checked, fine:**
- Installment edits keep paid rows locked and re-check that principals equal the new tyre amount.
- A payment-type switch is blocked after any payment.
- A row's label can change after payment (amounts and date can't).

**Open (needs a decision later, same in every vertical):** a discount, once recorded, can't be reduced from the UI, because Record payment only adds to it. A challan with a wrong discount has to be deleted and re-entered.

Gate: backend 98/98; tsc + build OK; e2e tyre 48, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL. (The first e2e pass ran 0 checks because Vite had stopped; it was restarted and every suite re-run.)

## Run 14 — area (b) challan form, round 3 (editing a plan that has payments)
Read the plan editing, load and payment paths, then drove the edit screen in the browser with the real DAO behind it.

**Bug, reproduced in the browser:**
- **Removing an unpaid row before a paid one created a duplicate month and moved a due date.** Repro: plan Initial amount (1 Oct, unpaid) · 1st month (1 Nov, paid) · 2nd month (1 Dec). Edit → remove Initial amount. The plan showed "1st month · 1 Nov" twice, and saving stored both. The old 2nd month had silently moved from 1 Dec to 1 Nov, and the payment picker then listed two "1st month" rows. Cause: unpaid rows took their default name and date from their index, but a paid row keeps its own, so the next unpaid row landed on the paid row's month. Fix (`normalizeRows`, and the "date changed by hand" detection on load): each row has a month slot. A paid row's slot comes from its due date, and the rows after it count on from there. With no paid rows, nothing changes. Test: `tyre: removing a row before a paid one keeps names and due dates distinct` (old code: two "1st month · 2026-11-01").

**Checked, fine:**
- Paid rows are sent back unchanged and accepted by the server.
- The payment type is locked after a payment.
- The payment modal lists only rows with a balance, earliest first, and fills in the balance.
- The full-payment discount is sent as existing + new.

Gate: backend 98/98; tsc + build OK; e2e tyre 49, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 15 — area (c) list + dashboard, round 3 (do the numbers add up)
Checked the list filters, the overdue and follow-up rules, and the analytics pipeline against the challans behind them.

**Bug, reproduced in the browser:**
- **The dashboard's "To collect" breakdown didn't add up when a challan had a discount.** The card read ₹6,86,853.50 with the caption "₹6,75,503.50 tyres + ₹11,850.00 interest", which is ₹6,87,353.50. The ₹500 discount was in the figure but missing from the caption. Fix: the caption adds "− ₹500.00 discount" when there is one. Test: `tyre: dashboard 'To collect' breakdown adds up when a challan has a discount` (old code: caption ₹500 off).
- **Test gap found while doing this:** the e2e dashboard used hard-coded KPI numbers, so no dashboard figure was ever checked. It now calls the real `getTyreAnalytics` on the fake DB, with the filters mapped as the route does.

**Checked, fine:**
- The "Overdue only" list filter and the dashboard's overdue rows use the same calendar-day rule.
- The follow-up covers all challans (not the date filter) up to the end of this month.
- The month chart groups by the challan's own date (`billDate` is stored as UTC midnight).
- Searching a D.C. number also finds it.

**Open (all verticals, server time zone):** the list's From / To dates use the server's local midnight. On a server west of UTC, challans dated on the From day drop out and the day after To comes in. That's correct in UTC and IST, and the other verticals behave the same way.

Gate: backend 98/98; tsc + build OK; e2e tyre 50, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 16 — area (d) printed challan, round 3 (are the printed figures right)
Printed three challans through the app's Print button (real DAO behind it) and read the text back with `pdftotext`:
- **A:** full payment, 2 × ₹24,250, a ₹1,500 discount, ₹20,000 received. It prints Tyre amount ₹48,500, Discount − ₹1,500, Total ₹47,000, Received ₹20,000, Balance ₹27,000. Correct.
- **B:** installments 28,500 + 10,400 + 10,400, with the initial amount paid and ₹4,000 paid on the 1st month. It prints Amount to collect ₹49,300 (₹48,500 + ₹800 interest), Received ₹32,500, Balance ₹16,800, and a Paid column of ₹28,500 / ₹4,000 / "-". Correct.
- **C:** no customer, address, phone or mechanic. The vehicle number stands in for the name, and the Mechanic line is left out. No blank labels.
- All three are one page with 0 overprints, and the render looks clean.

Nothing new found. (Seen, design not bug: the schedule shows Paid but not each row's balance, which the reader works out as Total − Paid.)
Gate: no code changed this run (last full gate: run 15, all green).

## Run 17 — area (e) bonus, round 3 (payouts while installments are still coming in)
Followed a bonus through payment, payout and the rest of collection with the real DAOs.

**Bug, reproduced with the real DAO, then in the browser:**
- **A bonus paid out before the challan was cleared never paid the rest.** Repro: a ₹48,500 installment challan with labour at 1% (₹485). After the initial ₹28,500 came in, ₹285 was payable and the owner paid Kumar's daily bonus. When the customer cleared the challan, the other ₹200 never became payable: paid entries are frozen and no new entry was made. Labour is settled daily, so almost every installment challan lost part of its labour bonus (and the mechanic's too, if paid out at year end before the challan was cleared). This broke the agreed rule that the bonus is fully payable once the tyre price is collected.
- **Fix (`tyrebonus.dao.js` only, tyre challans only):**
  - The money paid and the paid status of a paid entry are never changed.
  - The bonus earned after a payout goes on a new pending "rest" entry for the same person. That entry carries what is still to come (₹200) and the money collected since (₹20,000).
  - The paid entry's "earned" is trimmed to what it actually settled (₹285), so earned / ready / paid / collected add up once in both the Pending and All views.
  - A cancelled payout, or a payout to someone no longer on the challan, stays closed as before.
  - If more than was due was paid, nothing more is owed until enough is collected.
  - The bonus pages label the row "Rest of bonus".
- **Tests:**
  - "a bonus paid out part-way through the installments gets the rest once the tyre price is collected" (old code: no pending entry, so ₹61.85 lost for Kumar and ₹400 for the mechanic).
  - "a cancelled payout stays closed, and paying more than was due owes nothing more".
- **Browser:**
  - First try: the rest row's ₹0 "earned" set off a false "No bonus is accruing… set a bonus %" warning. Fixed by trimming the paid entry as above.
  - Now Kumar shows ₹200 earned and ₹200 ready, with no warning.

**Open:**
- Same freeze in the automobile and radiator bonus code. Bills there are rarely paid over months, and changing it would change other verticals' payouts, so it was left alone.
- Bonus pages (all verticals) at 1300px: when a person's row is expanded, the inner table is wider than the card, so the Status column, including the "Pending" badge, is clipped at the right edge. This was already the case before this run.

Gate: backend 100/100; tsc + build OK; e2e tyre 50, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 18 — area (f) regressions in the other verticals, round 3
Shared files changed since run 12: `bonus.dao.js` (the review rows now carry `rest`) and `Pages/Bonus/Mechanic.tsx` (the "Rest of bonus" label, run 17).
- `rest` is `$ifNull(…, false)`, so radiator, automobile and engineering entries are never labelled. Their bonus pages render as before (run 17's gate: automobile 45, radiator 17, engineering 168, 0 FAIL).
- **Correction to run 17's open item:** the clipped Status column on the bonus pages is not caused by the expanded row. Measured at 1300px, the bonus list table is 1,089px wide in a 960px frame before any row is opened. It is the same "desktop lists scroll sideways" design question already open since run 3. A CSS change that kept the nested table from widening the list made no difference and was reverted.

Nothing new found. No code changed (last full gate: run 17, all green).

## Run 19 — area (a) money logic, round 4 (fuzz with bonus payouts)
Run 17 changed how the bonus follows payments, so the money fuzz was re-run with bonuses in it. Real DAOs on the fake DB; 60 challans × 14 random steps per seed, 4 seeds:
- Steps: installment or full payments (with discounts), bonus payouts to the mechanic or a worker, and edits (quantity re-split over unpaid rows, worker list changed).
- After every step, for every person on the challan, checked:
  - at most one pending entry
  - no negative amounts
  - paid + pending = the bonus payable now (or what was already paid, if an edit lowered it)
  - earned adds up the same way
- **Result:** about 2,040 operations and 869 payouts, 1,150 steps with a rest entry present, **0 violations**. Every rejection was a correct refusal (principal below the paid rows, challan already fully paid, discount over what's owed, total below received + discount).
- The run-7 money fuzz (received = payment log = paid rows, pending, status, no overpaid row, principal = tyre amount) was re-run on two seeds: 0 violations. Two simultaneous payments on one installment are still refused with a 409, not lost.
- **Harness bug found and fixed (not app code):** both fuzz scripts sent due dates as `String(Date).slice(0, 10)`, which parses to the wrong year. So edits to plans with paid rows were being refused and never exercised. With ISO dates they now run.

Behaviour to note (from run 17, not a bug): if the owner pays a bonus at a custom amount below what was ready, the shortfall now shows again as "Rest of bonus" pending (before, it was silently dropped). Cancel or adjust it on the Bonus page if the lower amount was meant to be final.

Nothing new found. No code changed (last full gate: run 17, all green).

## Run 20 — area (b) challan form, round 4 (payment popup and view, phone + dark)
Screenshots of the challan view and the Record Payment popup, for an installment challan (initial amount paid, 1st month overdue) and a full-payment one, at 390px and 1300px, light and dark (real DAO behind it):
- Installment popup: opens on the overdue 1st month with ₹10,400 filled in, shows "₹10,400.00 left · due … (overdue)", has no discount field, and fits the phone.
- Full-payment popup: discount and amount fields, "Up to ₹24,250", fits.
- View page on a phone in dark mode: plan rows with Paid / Overdue / Due badges, totals and "Principal ₹48,500 of ₹48,500 ✓" all readable. (The sticky "Amount to collect / Back" bar shows mid-page only in the full-page screenshot.)

Nothing new found. This is the **third run in a row with nothing new (18, 19, 20)**, so stopping the hourly task is suggested to the user.
No code changed (last full gate: run 17, all green).

## Run 21 — area (c) list + dashboard, round 4 (export vs list vs dashboard)
40 random challans (full and installment, part paid, some discounted, 2 mechanics, over 5 months). Compared the Excel export rows, the list count and the dashboard KPIs under the same filters (none · Overdue only · one mechanic this month), plus the follow-up's overdue count and amount.

**Test-tool bug found and fixed (not app code):**
- With "Overdue only", the list and export had 37 challans but the dashboard counted 27. The extra 10 were all full-payment challans with no due date. Cause: the fake test DB's `find()` turned a missing date into `new Date(null)` (1 Jan 1970), so "next due ≤ today" matched. Real MongoDB, and the fake DB's own aggregation, never match a null against a date range, so **production was right**. But the list and filter tests ran on a wrong database and could have hidden or invented bugs.
- Fix: `test/helpers/fakeDb.js` no longer matches a missing value in a date range. Test: "the Overdue filter lists only installment challans with an overdue row" (fails on the old helper).

**After the fix:** export, list and dashboard agree on every filter: counts, to collect, received, pending, discount; overdue 27 challans and the same overdue ₹ in the follow-up and the export.

Gate: backend 101/101; tsc + build OK; e2e tyre 50, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 22 — area (d) printed challan, round 4 (unusual Settings text)
Printed challans with Settings text earlier rounds never tried:
- a company with no address or phone
- signature on but no image uploaded
- long renamed labels ("Lorry / Trailer Registration No.", "Fitter / Mechanic in charge")
- a long line under the company
- a long receiver's note

**Bugs, both reproduced with `pdftotext -bbox` word boxes:**
1. **A long receiver's note ran into the page footer.** The note was drawn with a 60mm width but the signature block only made room for a wrapped "For <company>". A 3-line note printed "without fail" over the footer's company name, on every challan. Fix: the block reserves room for whichever side (note or "For …") takes more lines.
2. **A long line under the company printed over the date and D.C. No.** That line had no width limit. One sentence more than usual printed over "D.C. No: 3" (7 word overlaps). Fix: it wraps short of the date / D.C. No column.
- Test: `tyre pdf: a long subtitle and receiver's note wrap without printing over anything`. It uses a short company with no address, the tightest case: with the long company name from the previous check, the subtitle sat lower and the bug didn't show. Old code: 6 overlaps.

**Fine:**
- Signature on with no image leaves a blank signing space.
- The long labels fit the Details column.
- No address or phone just closes the gap.

Gate: backend 101/101; tsc + build OK; e2e tyre 51, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 23 — area (e) settings, round 4 (long and renamed labels)
Renamed all four tyre labels to long values ("Lorry / Trailer Registration No.", "Customer / Transport Company Name", "Fitter / Mechanic in charge", "Helper / Tyre Fitting Labour"). Loaded the challan form, list, dashboard, both bonus pages and inventory at 390px and 1300px. No page scrolls sideways and nothing is clipped. Brand / model keys: nothing ever splits "brand:model", so odd characters in names can't mix up stock.

**Bug, reproduced in the browser:**
- **The worker bonus page ignored the tyre (and automobile) worker label.** With the label renamed to "Helper", the menu said "Helper Bonus" but the page title, table header, filters and review back-link said "Labour Bonus" / "Labour". The page read the radiator's `labels.worker`, while the menu read the tenant's own vertical labels. Fix: one helper, `workerLabel` / `workerBonusTitle` in `layout/navConfig.ts`, used by the menu, `Bonus/Labour.tsx` and `Bonus/LabourReview.tsx`. Automobile tenants get the same correction (their page now matches their menu). Test: `tyre: the worker bonus page uses the tyre worker label, like the menu` (old code: "Labour Bonus").

The session's command permission check failed during run 23, so the full gate couldn't run then. It was finished at the start of run 24. Gate: backend 101/101; tsc + build OK; e2e tyre 52, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 24 — finished run 23, then area (f) regressions, round 4
- **Run 23's fix:** the full gate was finished (all green, see above), then it was committed and pushed (757b147).
- **Regression check of that shared change:**
  - Radiator and engineering are unchanged (radiator still reads `labels.worker`).
  - Automobile and tyre tenants on default labels keep the page title "Labour Bonus".
  - Inside the page, the name column now says "Labour" (it was the radiator's "Labour Name") and the filter placeholder says "-- All Labours --". That is the tenant's own label being used, as intended.
  - e2e automobile 45/45.
- The other shared change since run 18, `test/helpers/fakeDb.js` (run 21), is test-only.

Nothing new found this run.

## Run 25 — area (a) money logic, round 5 (unusual numbers)
Checked how money inputs are read: three decimals, exponents, `Infinity`/`NaN`, negatives. `toMoney` rejects non-finite and negative values, but it didn't round. Plan amounts and payments were rounded to the paisa; the **tyre rate and the discount were not**.

**Bug, reproduced with the real DAO and in the browser:**
- **A rate typed with 3 decimals made the challan's figures disagree, and an installment plan with it could not be saved.** Rate ₹24,250.555 × 3:
  - The server stored the rate as 24250.555 and printed it as ₹24,250.56.
  - The form showed the tyre amount as ₹72,751.67, from the unrounded rate.
  - The server computed it from its own rounding.
  - So the plan check in the form and the server's "principals must equal the tyre amount" rule disagreed by a paisa, and no plan could pass both.
- A discount of ₹100.555 likewise printed as ₹100.56 while the total used 100.555.
- **Fix:**
  - The server rounds the rate and the discount to the paisa when they come in.
  - The form's line total uses the rate rounded the same way.
  - Both use the same `round2`, so they always agree.
- **Tests:**
  - "rates and discounts are kept to the paisa, so the printed rate × qty and totals add up" (old code: rate 24250.555).
  - e2e `tyre: a 3-decimal rate totals to the paisa the server saves` (old form: "of ₹72,751.67").

Gate: backend 102/102; tsc + build OK; e2e tyre 53, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Decision — Tamil text on printed challans (open since run 10)
User: "No Tamil, leave it". Names and addresses are entered in English, so the PDF keeps jsPDF's built-in Latin fonts and no Tamil font is added. Closed.

## Run 26 — area (b) challan form, round 5 (long tyre-number lists)
A line for a whole fleet carries one serial per tyre ("MRF-2026-778810, MRF-2026-778811, …").

**Bugs, both reproduced:**
1. **Tyre numbers past 120 characters were silently cut off on save.** Repro: 10 tyres with 15-character serials (168 characters). The challan was saved as "…MRF-2026-778816, M", so the last three and a half serials were lost with no message. Fix:
   - The server keeps up to 2,000 characters and refuses anything longer with "Tyre N: tyre numbers are too long", never cutting it.
   - The form field has the same limit.
   - Test: "tyre numbers for a 10-tyre line are saved in full, and a too-long entry is refused, never cut" (old code: cut at 120).
2. **On the printed challan the serials broke mid-serial across lines** in the narrow "Tyre no." column ("MRF-2026-7788 / 10, MRF-2026-7 / 78811"), which is hard to read on a delivery document. Fix:
   - One serial per line.
   - The column is widened from 22 to 26mm with slightly smaller serial text; "Tube, flap" goes from 20 to 18mm and already wrapped.
   - Trade-off: a long model name (e.g. "MRF 10.00-20 Steel Muscle") can take two lines.
   - Test: `tyre pdf: each tyre number prints whole`. The long e2e challan's first line now has ten 15-character serials (old code: all broken).

Checked with `pdftotext`: all 10 serials print whole, 0 overprints on the three sample challans.

Gate: backend 103/103; tsc + build OK; e2e tyre 54, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 27 — area (c) list + dashboard, round 5 (searching vehicle numbers)
**Bug, reproduced with the real DAO:**
- **Vehicle-number search missed challans when the number was typed with spaces on one and without on the other.** The form keeps what is typed, so one lorry can be saved as "TN 58 AB 1234" on one challan and "TN58AB1234" on the next. Searching "TN58AB1234" (or "tn58ab") didn't find the spaced one, so following up all of a customer's installment challans by lorry missed some. Fix: the list search and the vehicle filter match the typed characters in order with any spaces between them. Stored data is unchanged. Test: "vehicle-number search ignores spaces, so a lorry typed both ways is found either way" (old code: the spaced challan missing).

**Test-tool fix (not app code):** the fake test DB's `find()` had no `$or` or `$regex`, so every list search returned nothing in tests: search had never really been tested. It now handles both, matching any value at the path (array items included) as MongoDB does. All 103 earlier tests still pass with it.

Open (all verticals): automobile search behaves the same way (spaces kept as typed). Left alone.

Gate: backend 104/104; tsc + build OK; e2e tyre 54, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 28 — area (d) printed challan, round 5 (longest values the form accepts)
Printed a challan with a 200-character customer name, a 500-character address and three 60-character installment names (a payment recorded):
- Page 1: name and address wrap in the "Delivered to" column, with the details beside them; tyres and totals follow. 0 overprints.
- The installment schedule plus the signature block don't fit under it, so they move to page 2. Each long installment name wraps in its column, and the signature sits at the bottom.
- Both pages are numbered ("D.C. No 2 · Page n of 2").

Nothing new found. No code changed (last full gate: run 27, all green).

## Run 29 — area (e) settings, inventory, bonus, round 5 (unusual input)
- Mechanic and worker on a challan are picked from a list (no free typing), so bonus entries can't split over "Ramesh" vs "ramesh ".
- Inventory: whole tyres only (form and server). A 3-decimal buy price only feeds totals that are shown rounded, so nothing on screen disagrees.
- Seen, shared with automobile (same inventory code), not changed:
  - The API accepts a stock entry dated in the future (the form stops it).
  - An entry for a model later removed from the catalog can be deleted but not edited.
  - A fixed worker bonus split three ways rounds each share (₹100 → 3 × ₹33.33).

Nothing new found. No code changed (last full gate: run 27, all green).

## Run 30 — area (f) regressions in the other verticals, round 5
Since run 24 the only shared file changed is `test/helpers/fakeDb.js` (test-only: `$or` / `$regex`, null in date ranges). Full gate on the current head: backend 104/104; tsc + build OK; e2e tyre 54, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Nothing new found. **Third run in a row with nothing new (28, 29, 30):** stopping the hourly task is suggested to the user.

## Run 31 — area (a) money logic, round 6 (unusual dates)
- The server reads dates with `new Date(…)`. "2026-02-30" rolls over to 2 March, and a 5-digit year ("20260-01-05") is accepted. Through the app this can't happen: the form's date pickers only produce real dates, and Chromium's date box leaves the value empty when a fifth year digit is typed (checked). So only a hand-made API call could send one: logged, not changed.
- Also fine:
  - A due date before the challan date is allowed (a backdated plan).
  - An interest-only row (principal 0) is accepted.
  - Several part payments on one row can never total more than the row (the cap is checked against the rounded balance).

Nothing new found. No code changed (last full gate: run 30, all green). Fourth run in a row with nothing new (28–31).

## Run 32 — area (b) challan form, round 6 (double clicks on a slow network)
With a 600ms delay on the save (as on mobile data), real browser double-clicks:
- Double-click **Save challan** on a valid new challan: one challan saved (D.C. 1), not two.
- Double-click **Record Payment** for ₹100: received ₹100, one payment-log entry, not two.

Nothing new found. No code changed (last full gate: run 30, all green). Fifth run in a row with nothing new (28–32).

## Run 33 — area (c) list + dashboard, round 6 (paging)
- Deleting the only challan on the last page: the shared list hook (`useRemoteList` with `paging`) steps back a page when the current one comes back empty, so the list never shows an empty page while challans exist.
- Changing a filter, the sort or the page size goes back to page 1.
- The tyre list route returns `totalRecords` / `totalPages`, the names the list reads.

Nothing new found. No code changed (last full gate: run 30, all green). Sixth run in a row with nothing new (28–33).

## Run 34 — area (d) printed challan, round 6 (fully settled challans)
- Full payment cleared by part payments plus a discount: Discount − ₹1,500, Total ₹47,000, Received ₹47,000, Balance ₹0.
- Installments all paid: Amount to collect ₹49,300, Received ₹49,300, Balance ₹0; each schedule row's Paid equals its Total.
- 1 page, 0 overprints each.

Nothing new found. No code changed (last full gate: run 30, all green). Seventh run in a row with nothing new (28–34).

## Run 35 — area (e) bonus, round 6 (changing the bonus settings mid-way)
Extended the run-19 money + bonus fuzz: besides payments, payouts and edits, the owner randomly switches mechanic / labour bonus between % and ₹-per-challan with new rates, then presses Recalculate (`backfillTyre`). Same per-person checks after every step:
- one pending entry
- nothing negative
- paid + pending = the bonus payable under the current settings (or what was already paid)
- earned adds up

3 seeds: about 1,860 operations, 403 settings changes + recalculations, 638 payouts, **0 violations**.

Nothing new found. No code changed (last full gate: run 30, all green). Eighth run in a row with nothing new (28–35).

## Run 36 — area (f) regressions in the other verticals, round 6
No code has changed since run 30 (only this log). Full gate on the current head: backend 104/104; tsc + build OK; e2e tyre 54, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Nothing new found. Ninth run in a row with nothing new (28–36).

## Run 37 — area (a) money logic, round 7 (deleting a challan with payments and payouts)
An installment challan with 2 tyres from stock, both rows paid, and Kumar's labour bonus paid out part-way (so a "rest" entry exists), then deleted:
- Stock goes from 3 back to 5 (the tyres return).
- The pending mechanic entry and Kumar's pending rest entry are removed.
- Kumar's paid entry stays as settlement history.

Nothing new found. No code changed (last full gate: run 36, all green). Tenth run in a row with nothing new (28–37).

## Run 38 — area (b) challan form, round 7 (accessibility audit)
Ran axe-core 4.10.2 on the new-challan form (errors shown) at 1300px and 390px, light and dark. Only serious / critical issues were reported:

**Bug (tyre form), reproduced by axe and by a measured check:**
- **The "Amount to collect" label was too faint on its tinted box:** muted grey on brand-50 = 4.34:1, below the 4.5:1 minimum for small text. Fix: the label uses the strong text colour, 12.83:1. That colour doesn't depend on the brand colour a shop picks; the brand text colour would have given only 4.56:1 with the default brand. The large amount beside it keeps the brand colour (big text needs 3:1). Test: `tyre: the Amount to collect label is readable on its tinted box (≥ 4.5:1)` (old: 4.34:1).

**Open (shared app frame, all verticals):** the sidebar group titles ("MENU", "MANAGE") are 2.57:1 in light mode and 3.64:1 in dark mode. Not changed: it's the shared layout, a design choice for every company type.

Gate: backend 104/104; tsc + build OK; e2e tyre 55, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 39 — area (c) list + dashboard, round 7 (accessibility audit)
axe-core 4.10.2 on the challan list and the dashboard, with 6 real challans loaded (paid, part-paid and overdue), at 1300px and 390px, light and dark. Serious / critical only.

**Bug (tyre dashboard, phone), reproduced by axe and a computed-style check:**
- **The follow-up list's "D.C. N" link was indistinguishable from the text around it.** It was blue inside grey meta text of almost the same lightness (1.04:1 light, 1.17:1 dark; 3:1 needed) with no underline, so only the hue showed it was a link. Fix: underlined. Test: `tyre: the phone follow-up's D.C. link is underlined` (old: none). axe re-run: no issues on the phone dashboard.

Everything else on the tyre list and dashboard passed. The only remaining item is the shared sidebar group titles (logged in run 38).

Gate: backend 104/104; tsc + build OK; e2e tyre 56, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 40 — area (d) printed challan, round 7 (download file name)
The PDF's file name carries the vehicle number as typed:
- "TN 58 AB 1234" → `Challan-1-2026-10-05-TN 58 AB 1234.pdf`
- "TN58/AB/1234" → Chrome turns the slashes into `_` (`Challan-2-2026-10-05-TN58_AB_1234.pdf`), so there's no broken path.

Same pattern as the other verticals' invoices.

Nothing new found. No code changed (last full gate: run 39, all green).

## Run 41 — area (e) settings, inventory, bonus, round 7 (accessibility audit)
axe-core 4.10.2 on the three tyre Settings tabs (Tyre Catalog, Bonus, Labels & Challan), tyre Inventory, Mechanic Bonus and Labour Bonus, with real data, at 1300px and 390px, light and dark (24 screens).
- 0 serious / critical issues, apart from the shared sidebar group titles already logged in run 38.
- No page errors.

Nothing new found. No code changed (last full gate: run 39, all green).

## Run 42 — area (f) regressions in the other verticals, round 7
No shared (non-tyre) code has changed since run 36; the changes since then were tyre-only (form, dashboard, PDF, tyre.css). Full gate on the current head: backend 104/104; tsc + build OK; e2e tyre 56, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Nothing new found. Third run in a row with nothing new (40–42): stopping the hourly task is suggested again.

## Run 43 — area (a) money logic, round 8 (server time zone)
Ran all backend tests with the server clock in three time zones:
- Asia/Kolkata and Pacific/Auckland: 104/104.
- America/Los_Angeles: 102/104. The two failing tests are run 17's "bonus paid out part-way …" tests.

Cause (shared code, all verticals): bill dates are stored as UTC midnight (`new Date("YYYY-MM-DD")`, in tyre, radiator and automobile alike). But the bonus payout-by-date range (`bonus.dao.js`) and the list date filters use the server's local midnight (`moment(d).startOf("day")`). On a server west of UTC the range for "20 Sep" starts at 07:00 UTC, so it misses that day's entries and picks up the next day's. Correct on servers in UTC or east of it (India), which is where it runs today as far as is known. This is the same open item as run 15, now confirmed for bonus payouts too. Not changed here: it's shared code, and the fix belongs in all verticals at once.

The tyre-only money code (overdue, next due, follow-up) already compares calendar days and passed in all three zones.

No code changed (last full gate: run 42, all green).

## Run 44 — area (b) challan form, round 8 (accessibility: view page + payment popup)
axe-core 4.10.2 on the challan view page and the Record Payment popup, for an installment challan (initial amount paid, 1st month overdue) and a full-payment one, at 390px and 1300px, light and dark (16 screens). 0 serious / critical issues (the shared sidebar titles are excluded, as before).

Nothing new found. No code changed (last full gate: run 42, all green).

## Run 45 — area (c) list + dashboard, round 8 (every sort column)
30 random challans. For all 10 sortable columns × both directions, read 3 pages of 10 and checked the order and that the 30 rows are distinct.
- To collect, Received, Pending, Date, D.C. No, Type, Status and Mechanic: correctly ordered, no row repeated or missing across pages.
- Vehicle and Customer looked out of order in the fake test DB ("TN24AB29" before "TN24AB9"; "anand" after "Devi"). That's the test tool, not the app: production queries run with `SORT_COLLATION` (`numericOrdering: true, strength: 2`), so text sorts numbers by value and ignores case, but the fake DB's `find().sort()` ignores collation. Logged; text-sort tests should not rely on the fake DB.

Nothing new found in the app. No code changed (last full gate: run 42, all green).

## Run 46 — area (d) printed challan, round 8 (shop brand colour)
**Bug, reproduced in a printed PDF:**
- **A pale brand colour made the challan title nearly unreadable.** The title was printed in the raw brand colour from Settings. With gold `#FFD700` it came out 1.4:1 on white: hard to read, and it fades on a photocopy. Fix: the title uses `buildBrand(primaryColor, "light").brandText`, the same contrast-safe version of the brand colour the app already uses for on-screen text. Gold now prints as a dark gold (5.93:1); normal dark brand colours print as before. Test: `tyre pdf: the title stays readable with a pale brand colour (≥ 4.5:1)`. It reads the fill colour jsPDF writes just before "DELIVERY CHALLAN" in the PDF (old: 1.4:1).

**Open (engineering invoice):** `PrintEngInvoice.ts` prints its title in the raw brand colour the same way. Not changed here (outside the tyre work); the same one-line fix applies.

Gate: backend 104/104; tsc + build OK; e2e tyre 57, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 47 — area (e) settings, inventory, bonus, round 8 (pale brand colour on screen)
Following run 46's PDF fix, checked the screens with a pale brand colour (gold `#FFD700`):
- `tyre.css` only uses the brand tint (`--brand-50`, as a background) and the contrast-safe `--brand-text`; no tyre page uses the raw brand colour inline.
- axe-core on the three tyre Settings tabs, Inventory, Mechanic Bonus and Labour Bonus, with gold as the brand colour, at 1300px and 390px, light and dark (24 screens): 0 serious / critical issues (shared sidebar titles excluded, as before).

Nothing new found. No code changed (last full gate: run 46, all green).

## Run 48 — area (f) regressions in the other verticals, round 8
No shared (non-tyre) code has changed since run 42 (run 46's fix was in `PrintTyreChallan.ts` only). Full gate on the current head: backend 104/104; tsc + build OK; e2e tyre 57, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Nothing new found. No code changed.

## Run 49 — area (a) money logic, round 9 (payment mode)
The server's payment modes (`cash, upi, card, bank, other`) match the five the payment popup offers, and an unknown value is stored as cash.

Nothing new found. No code changed (last full gate: run 48, all green). Third run in a row with nothing new (47–49): stopping the hourly task is suggested again.

## Run 50 — area (b) challan form, round 9 (keyboard focus)
On the challan view, keyboard only:
- Enter on Record Payment opens the popup with the cursor in the amount box.
- Escape closes it.
- Focus returns to the Record Payment button (not to the top of the page).

Nothing new found. No code changed (last full gate: run 48, all green). Fourth run in a row with nothing new (47–50).

## Run 51 — area (c) list + dashboard, round 9 (dashboard filters)
6 challans across two mechanics. Picking a mechanic on the dashboard sends `mechanicName` with the date range, and the cards follow it: Challans 6 → 3, To collect ₹2,92,200 → ₹1,45,500, both equal to `getTyreAnalytics` for that mechanic. The "Installments to collect" card (Overdue ₹1,36,700) stays the same, by design ("across all challans": an old overdue installment still needs chasing whatever the filter).

Nothing new found. No code changed (last full gate: run 48, all green).

## Run 52 — area (d) printed challan, round 9 (long mechanic name)
**Bug: a mechanic's full name printed over the Payment line.** Repro: add "Thirunavukkarasu Subramaniam Pillai" to the mechanics in Settings, pick him on a challan, print. The name wraps in the 40mm Details value column, but each row stepped down a fixed 4.6mm, so "Pillai" printed on top of "Full payment" (pdftotext boxes overlap; seen on the PNG).
- Fix (`PrintTyreChallan.ts`): each Details value is split into lines first, and the next row starts below its last line. The block's height (and the tyre table under it) follows `dy`, which already pushed the table down.
- Test: `e2e/tyre.e2e.mjs` "a long mechanic name wraps without printing over the payment line". It fails before the fix ("Pillai" × "payment") and passes after.

Gate: backend 104/104; tsc + build OK; e2e tyre 58, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Open (not reproduced, not tyre code): `PrintInvoice.ts` and `PrintEngInvoice.ts` (and `PrintPayslip.ts`) use the same fixed 4.6mm step with a 50mm value column, so a value of roughly 45+ characters would do the same there.

## Run 53 — area (e) settings, inventory, bonus, round 9 (renamed catalog entries)
**Bug: after renaming a brand or model, a new one with the old name could not be added.** Repro: Settings → Tyre Catalog, rename "MRF" to "MRF (old stock)", type "MRF" in New brand, press Add brand → "MRF is already in the catalog", though no brand on screen is called MRF. A renamed model blocked a new model of its old name the same way. Cause: renaming keeps the stored value (`mrf`) on purpose, so old challans and stock stay linked; the add-time duplicate check compared the new name's slug with those stored values.
- Fix (`TyreSettingsTabs.tsx`): a duplicate is now judged by the names on screen. A new brand / model whose slug is still held by a renamed one gets the next free value (`mrf-2`). Removing a brand and adding it back still gets `mrf`, so it relinks to its old challans and stock as before. The backend matches catalog entries by value only, so the new values need no server change.
- Test: `e2e/tyre.e2e.mjs` "after renaming CEAT, a new CEAT brand and model can be added beside it". It fails before the fix (both adds refused) and passes after.

Gate: backend 104/104; tsc + build OK; e2e tyre 59, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 54 — area (f) regressions in the other verticals, round 9 (shared bill prints)
Followed up run 52's open item by printing the radiator, automobile and engineering bills with long values (functions imported straight from Vite, PDFs checked with `pdftotext -bbox` and looked at as PNG).

**Bug 1: a long "Billed to" name ran into the Details column** (radiator and automobile bills). Repro: transport / customer name "Sri Murugan Roadways & Logistics Private Limited" → "Limited" printed over "Truck Number" / "Vehicle Number". The name had no width limit.
- Fix (`PrintInvoice.ts`, both bills): the name wraps inside its column like the tyre challan's, the phone goes under its last line, and the items table starts below whichever side is taller.

**Bug 2: a long Details value printed over the next row** (radiator, automobile, engineering). Repro: mechanic "Thirunavukkarasu Subramaniam Pillai Junior" → "Junior" over the Radiator Model value; on engineering, over the "BS model" row when the challan has two BS models. A long first line also ran left into its own label ("Model" × "Tata"), because the 50mm value column starts left of where a label like "Radiator Model" ends.
- Fix (`PrintInvoice.ts`, `PrintEngInvoice.ts`, and the same width rule in `PrintTyreChallan.ts`): each value wraps in the room right of its label (at most the old 50mm / 40mm), and the next row starts below its last line.
- Test: `e2e/tyre.e2e.mjs` "shared pdf: long names and details wrap without printing over anything" prints all three bills. It fails before the fix (6+ overprints) and passes after.

Gate: backend 104/104; tsc + build OK; e2e tyre 60, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL. Closes run 52's open item for the bills. Open: `PrintPayslip.ts` was not changed. Its Details rows are short fixed values (period, days), but its employee name has the same missing width limit as bug 1; a name over about 40 characters would reach the Details labels (not reproduced, salary is outside the tyre work).
