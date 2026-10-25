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
