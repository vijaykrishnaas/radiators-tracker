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

## Run 55 — area (a) money logic, round 10 (edit paths, re-checked after runs 52–54)
The shell's permission check failed for the whole hour, so this run was code reading only; the fuzz below ran at the start of run 56.
- Plan edits: a row sent twice is refused; paid rows can't be removed, re-dated or re-priced; the payment type is locked once anything is paid.
- A full-payment challan still can't be edited below received + discount.
- The overdue list filter uses `nextDueDate`, the earliest unpaid due date (sorted), so rows out of date order still count.
- Old challans stay editable after their brand / model leaves the catalog (stored labels are kept).
- A full-payment overpayment is capped on the server rather than refused (installment rows refuse it). Not a bug through the app: the payment popup's limit is "pending − discount". Only a direct API call could hit it.
- Run-7 money fuzz on seeds 101, 202 and 303: 0 violations.

Nothing new found. No code changed.

## Run 56 — area (b) challan form, round 10 (editing after catalog changes)
- With the challan's brand removed from Settings (dark mode, 390px), the edit form still shows "MRF / 10.00-20", accepts new tyre numbers and saves; the stored line keeps its labels and ₹48,500.
- The stock warning on an edit adds back the challan's own saved quantity, so an unchanged challan doesn't warn about its own tyres.
- Cancel on an edit leaves without asking, even with changes typed in. This matches the engineering form (both ask only on a new challan), so it is left as the app's convention.

Nothing new found. No code changed (last full gate: run 54, all green).

## Run 57 — area (c) list + dashboard, round 10 (after the catalog and print changes)
- Search after a brand rename (run 53): the list matches the tyre names stored on each challan (`items.particulars`), which are also what the list shows, so a renamed brand's old challans are found by the name they show. The brand filter matches by stored value, so it keeps finding them under the renamed brand.
- Run 9's list-logic script re-run on the current code (real Mongo query semantics via mingo): overdue filter, serial / D.C. No / customer search, status, payment type, brand, date ranges, the follow-up list and paging all give the expected challans.
- Deleting from the last page was covered in run 33 (paging).

Nothing new found. No code changed (last full gate: run 54, all green). Third run in a row with nothing new (55–57): stopping the hourly task is suggested.

## Run 58 — area (d) printed challan, round 10 (long labels after run 54)
**Bug (a regression from run 54): a long vehicle label squeezed the plate to one character per line.** Repro: Settings → vehicle label "Lorry / Trailer / Tanker Vehicle Registration Number (RC)" (Settings has no length limit), print a challan → K / A / 0 / 1 / M / X … down the page. Run 54 gave each Details value only the room its label left; with a 58-character label that room was below zero. Before run 54 the same label made the plate print over the label instead. The radiator / automobile / engineering bills had the same code.
- Fix: one helper, `Utils/pdfDetails.ts` `fitDetail`, used by all four Details blocks (`PrintTyreChallan.ts`, both bills in `PrintInvoice.ts`, `PrintEngInvoice.ts`). The value keeps the room it needs (up to the old 40 / 50mm, wrapping past that); a label too long to sit beside it wraps into what is left (at least 18mm). A text that fits is never split. First try split "Payment" into "Paymen / t" and "TN04LONG" into "TN04LON / G", because `splitTextToSize` measures a hair wider than `getTextWidth`; both caught on the PNG and in e2e before pushing.
- Tests (`e2e/tyre.e2e.mjs`): "tyre pdf: a long vehicle label wraps and the plate prints whole" and "shared pdf: a long vehicle label wraps and the truck number prints whole". Both fail on the run-54 code and pass now. Run 23's labels ("Lorry / Trailer Registration No.", "Fitter / Mechanic in charge") still print on one line beside their values.

Gate: backend 104/104; tsc + build OK; e2e tyre 62, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 59 — area (e) settings, inventory, bonus, round 10 (after renaming and re-adding a brand)
- Inventory with run 53's values (DAO on the fake DB): "MRF (old stock)" (`mrf`) with 4 in and 1 sold, and the new "MRF" (`mrf-2`) with 10 in and 3 sold, show as two rows (3 left and 7 left). After the old brand is removed from Settings its row stays, keeps its name from the stock entries and is marked out of the catalog; the new brand's movements list shows only its own stock (in 10, out 3).
- Mechanic bonus page: the mechanic filter is built from names on the challans (`/tyre-mechanic`), so a mechanic later removed from Settings can still be filtered and paid.

Nothing new found. No code changed (last full gate: run 58, all green).

## Run 60 — area (f) regressions in the other verticals, round 10 (prints after run 58)
- Ordinary radiator, automobile and engineering bills (default labels, short names, two BS models) after run 58's `fitDetail`: every Details row is on one line beside its label, as before; 0 overprints.

**Bug: a long employee name ran into the payslip's Details column** (run 54's open item, now reproduced). Repro: payslip for "Muthukumaraswamy Venkatasubramanian Iyer Rajagopal" → "Iyer Rajagopal" printed over "Period". The name had no width limit.
- Fix (`PrintPayslip.ts`): the name wraps inside its column and the table starts below it; the Details rows use the shared `fitDetail`, like the bills.
- Test: the e2e check "shared pdf: long names and details wrap without printing over anything" now also prints this payslip. It fails before the fix ("Iyer" × "Period") and passes after.

Gate: backend 104/104; tsc + build OK; e2e tyre 62, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL. Closes run 54's open item.

## Run 61 — area (a) money logic, round 11 (adding a tyre after installments are paid)
Real inputs on the DAO: 2 tyres at ₹24,250.50 on a 3-row plan (₹300.25 interest on the monthly rows), ₹20,000 paid on the first row and ₹5,000.33 on the second; then the challan is edited to 3 tyres, paid rows sent back unchanged plus a new ₹24,250.50 + ₹500 row, and that row paid in full.
- Totals: tyre ₹72,751.50, interest ₹1,100.50, to collect ₹73,852, received ₹49,750.83 (= the payment log), pending ₹24,101.17, status Partial.
- Rows: Initial Paid, M1 Overdue with ₹9,550.42 left (that is the next due and the overdue amount), M2 Due, M3 Paid.
- Bonus: 2% of the tyre amount = ₹1,455.03 accrued, ₹995.02 payable (accrued × received ÷ tyre amount). The plan's first note said "received ÷ amount to collect" (₹980.19), but commit 46fa15e (2026-10-22) changed it on purpose so the bonus is fully ready once the tyre price is collected, even while interest is still owed. Interest money counts toward that. Left as decided.
- (A first try sent the paid rows' due dates through `String(date)` and was refused as "changed"; that was the script, not the app, which sends ISO dates.)

Nothing new found. No code changed (last full gate: run 60, all green).

## Run 62 — area (b) challan form, round 11 (paise in the payment popup)
- A row whose balance has paise (₹20,301.25) and a full-payment challan of ₹24,250.50, paid from the popup in the browser: the popup pre-fills the exact balance and the payment posts with the paise (20301.25 / 24250.5). The amount box has no `step`, so the browser counts a paise value as "not valid", but the popup's form is `noValidate` and no style marks invalid boxes, so nothing shows and nothing is blocked. Only the arrow keys step in whole rupees; not counted.
- The popup opens on the earliest unpaid installment (or the one the user clicked) and pre-fills what is left on it.
- Installment principals are typed by hand (no auto-split), so there is no rounding gap for the form to leave.

Nothing new found. No code changed (last full gate: run 60, all green).

## Run 63 — area (c) list + dashboard, round 11 (paise on screen)
Run 3's list / dashboard script with paise in every amount (rates ₹19,000.25 and ₹24,250.50, half-plans and part-payments to the paisa), at 1300px and 390px: every rupee figure on the challan list and the dashboard (cards, follow-up table) prints with exactly two decimals (₹28,500.38, ₹87,850.50, ₹3,98,353.24); none shows ".5" or more than two decimals.

Nothing new found. No code changed (last full gate: run 60, all green). Third run in a row with nothing new (61–63): stopping the hourly task is suggested.

## Run 64 — area (d) printed challan, round 11 (long label and long value in one row)
- Run 58's `fitDetail` in its hardest case: mechanic label "Fitter / Mechanic in charge of this vehicle" with mechanic "Thirunavukkarasu Subramaniam Pillai", next to the long vehicle label and a full plate. The label wraps in its 18mm minimum (4 lines), the name wraps beside it (2 lines), and the Payment row starts below both; 0 overprints on the full-payment and installment challans.
- The tyre Settings have no QR switch (only "Show signature"), so there is no toggle that does nothing on the challan.

Nothing new found. No code changed (last full gate: run 60, all green). Fourth run in a row with nothing new (61–64): stopping the hourly task is suggested.

## Run 65 — area (e) settings, inventory, bonus, round 11 (typing into number boxes)
**Bug: clearing "First D.C. number" and typing 501 saved 1501.** Repro: Settings → Tyre Catalog → First D.C. number, select all, delete, type 501, Save → `billStartNumber: 1501`. The box forced 1 back in the moment it was emptied, so the typed digits went after the 1. The D.C. counter only ever moves up ("numbers already used are never reused"), so one such slip jumps every later challan number for good. The engineering "Bill numbering" box had the same code and the same result.
- Fix (`TyreSettingsTabs.tsx`, `EngCatalogTab.tsx`): the box may be empty while typing; left empty, it goes back to 1 when the cursor leaves. The server already reads an empty value as 1.
- Same pattern, smaller effect: clearing a model's rate showed "0" and typing gave "024250.50" (the saved rate was right). The rate box now shows empty with a "0" placeholder, like the bonus amount box.
- Tests (`e2e/tyre.e2e.mjs`): "settings number boxes take what is typed after clearing (first D.C. no., rate)" fails before the fix ("start 1501", box "021500.50") and passes after; "an emptied first D.C. number goes back to 1" guards the new blur rule. Engineering checked by hand in the browser: 501 → 501, emptied → 1.

Not counted: the labour bonus is split equally with each share rounded to the paisa (₹100 among three → 3 × ₹33.33), the same in every vertical.

Gate: backend 104/104; tsc + build OK; e2e tyre 64, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 66 — area (f) regressions in the other verticals, round 11 (run 65's pattern elsewhere)
Searched every screen for number boxes that put a value back into an emptied box (the cause of run 65's 501 → 1501):
- Only the tyre "First D.C. number" and engineering "Bill numbering" boxes forced a non-zero value (both fixed in run 65).
- The radiator / automobile / engineering / tyre bonus amount boxes already show empty with a "0" placeholder, so clearing and typing gives what was typed.
- Quantity boxes on the tyre, automobile and engineering bill forms and the stock entry form keep the typed text as is.
Run 65's e2e gate already covered the engineering suite (168/168) with its changed settings box.

Nothing new found. No code changed (last full gate: run 65, all green).

## Run 67 — area (a) money logic, round 12 (an edit and a payment at the same moment)
Run 7 raced two payments; this run raced an edit (customer name changed, plan sent back unchanged) against a payment on the same challan, for a full-payment and an installment challan. Both reads happen before either write. In both cases the payment is kept (received ₹10,000 / ₹28,500, logged once) and the edit is refused with a 409, "This challan was changed by someone else just now", so the person editing reloads and nothing is silently lost or overwritten.

Nothing new found. No code changed (last full gate: run 65, all green).

## Run 68 — area (b) challan form, round 12 (a payment lands while the edit form is open)
In the browser: open a full-payment challan's edit form, record ₹10,000 on it from elsewhere (as at the counter), then change the tyre numbers and press Update. The save succeeds and goes back to the list. The stored challan keeps the ₹10,000 (logged once) and has the new tyre numbers. The form never sends the received amount; the server reads the challan fresh at save time. On an installment challan, changing a row that got paid meanwhile is refused with "… already has a payment, so its amounts and due date can't change" (runs 14 and 55).

Nothing new found. No code changed (last full gate: run 65, all green). Third run in a row with nothing new (66–68): stopping the hourly task is suggested.

## Run 69 — area (c) list + dashboard, round 12 (Excel export with the overdue filter)
12 challans (full and installment, some part-paid, due dates before and after today, two mechanics). With "Installments: overdue only" alone, with a mechanic, and with installment + Partial, the list and the Excel export return the same challans in the same order when a sort is picked (`sortBy` / `sortDir`), and every exported row has an overdue installment. Both use the same filter parameters and the same server query (`buildTyreQuery`).
- With no sort picked, the screen shows newest-entered first and the export goes by bill date, newest first. Automobile and radiator do the same (list `createdAt`, export `billDate`), so this is the app's convention for a report, not a tyre bug.

Nothing new found. No code changed (last full gate: run 65, all green). Fourth run in a row with nothing new (66–69): stopping the hourly task is suggested.

## Run 70 — area (d) printed challan, round 12 (the largest challan the server accepts)
A challan at both limits (`MAX_ITEMS` 100 tyre lines, each with a serial; `MAX_ROWS` 120 installments with paise principals; the first row paid), printed from the app: 13 pages, 0 overprints, every page carries "D.C. No 1 · Page n of 13", and the installment table's header repeats on each page. Page 12 is filled with installment rows down to the footer, so the receiver / authorised signature block moves to page 13 on its own (run 10's rule: a new page only when the block truly doesn't fit).

Nothing new found. No code changed (last full gate: run 65, all green). Fifth run in a row with nothing new (66–70): stopping the hourly task is suggested.

## Run 71 — area (e) settings, inventory, bonus, round 12 (a brand renamed to nothing)
**Bug: Settings saved a tyre brand / model with an empty name, and every new challan picking it was then refused.** Repro: Settings → Tyre Catalog, clear the "Brand name" box (or a model's name), Save All Settings → saved as `{ label: "" }`. The challan form then offers a blank brand, and saving a challan with it fails with "Tyre 1: choose a brand" though one was chosen (`buildItems` takes the catalog's empty label). Settings are saved with no checks on screen or on the server.
- Fix (`Pages/Settings/Index.tsx`, `handleSave`): on a tyre tenant, Save is refused while any brand or model has no name, with "Every tyre brand and model needs a name (Tyre Catalog). Type a name or remove it, then save." Nothing is sent.
- Test: `e2e/tyre.e2e.mjs` "a brand with no name is not saved". It fails before the fix (1 save, no message) and passes after.

Gate: backend 104/104; tsc + build OK; e2e tyre 65, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 72 — area (f) regressions in the other verticals, round 12 (run 71's blank names elsewhere)
Looked for run 71's failure (a catalog entry renamed to nothing, then every bill using it refused) in the other catalogs whose names can be edited in place:
- Automobile parts (Settings → parts): a bill line carries its own `particulars` text from the form; the part name is only the picker's label, so a blank part name does not block a bill.
- Engineering items (Service Catalog): `engbill.dao.js` takes the catalog name, else the submitted label, else the item's code (`itemDef?.label || it.label || itemKey`), so a bill is never refused for it.
Only the tyre catalog refused bills (`buildItems` requires a brand / model name), and run 71 now stops it at Save.

Nothing new found. No code changed (last full gate: run 71, all green).

## Run 73 — area (a) money logic, round 13 (paise sums on a full-payment challan)
**Bug: a full-payment challan paid in parts could stay "Partial" with ₹0 pending.** Repro: a ₹10,000.37 challan paid ₹5,000.19, then ₹5,000.18 → stored `receivedAmount` 10000.369999999999, `pendingAmount` 0, status "Partial". The received amount was the previous one plus the new payment, never rounded, and the status compares it with the total. The challan then showed in the Partial filter forever (nothing left to pay, so no later payment would rewrite it), and its bonus stayed a hair short of fully payable. Installment rows were safe (`sumPaid` rounds).
- Fix (`tyrebill.dao.js` `computeTotals`): the full-payment received amount is rounded to the paisa, so every write stores and compares whole paise.
- Test: `test/tyrebill.dao.test.js` "a full-payment challan paid in paise parts ends Received, not Partial with nothing pending". It fails before the fix and passes after.
- Already-saved tyre challans with this float noise keep their stored "Partial" until they are next edited (an edit recomputes the totals). The tyre type is new on `staging`, so no data migration was written.

Open (found here, not changed in this run): automobile bills have the same pattern (`autobill.dao.js` `recordPayment`: `current + amount`, unrounded, then `deriveStatus`). To be reproduced and fixed with its own test in the next regressions (f) run.

Gate: backend 105/105; tsc + build OK; e2e tyre 65, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Runs 74–75 — carry-over from run 73: the same paise-sum bug on automobile and radiator bills (area f)
Run 74 did this work, but the shell's permission check failed, so it could not test or commit. Run 75 finished it.
**Bug: an automobile or radiator bill paid in parts could stay "Partial" with ₹0 pending.** Repro (both verticals): a ₹10,000.37 bill paid ₹5,000.19, then ₹5,000.18 → stored `receivedAmount` 10000.369999999999, status "Partial", nothing left to pay. `recordPayment` added the new payment to what was received and never rounded the sum (`autobill.dao.js`, `radiator.dao.js`); the status compares it with the total.
- Fix: the received amount is rounded to the paisa in both `recordPayment`s (radiator gets the same small `round2` helper the automobile file has). Engineering bills never keep a running received sum, so they are unaffected.
- Tests: `test/autobill.bonus.test.js` "payment in paise parts…" and `test/radiator.dao.test.js` "recordPayment: paid in paise parts…". Both fail on the old code and pass now.
- As with run 73, bills already stored with the float noise keep their stored status until their next edit or payment. Unlike tyre, automobile and radiator are in use, so the user may want those checked; the affected bills show "Partial" with ₹0.00 pending.

Gate: backend 107/107; tsc + build OK; e2e tyre 65, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL. Closes run 73's open item.

## Run 76 — area (b) challan form, round 13 (a long plan on a phone)
Edit form of a 12-row installment challan at 390px, dark, scrolled to the end with the mouse wheel as a user would: the last row, "Add month" and the green "Principal ₹48,500.00 of ₹48,500.00 · Matches the tyre amount" check all sit above the sticky "Amount to collect ₹49,700.00" footer (last card bottom 653px, footer top 677px). Nothing is hidden behind the footer. (A first try used `window.scrollTo` and left the page half-scrolled with a gap above the header; that was the script's jump-scroll, not the app.) The form has no "received now" box; money is only taken through the payment popup.

Nothing new found. No code changed (last full gate: run 75, all green).

## Run 77 — area (c) list + dashboard, round 13 (sales by brand after a rename)
**Bug: a renamed brand showed as two bars in "Sales by brand", on the dashboard and on the bonus review page.** Repro: sell MRF tyres while the brand is called "M.R.F", rename it in Settings to "MRF Tyres" (run 53: the stored value `mrf` stays), sell more → the dashboard shows "M.R.F" (1 tyre, ₹1,000) and "MRF Tyres" (2 tyres, ₹2,000) as different brands, and so does the mechanic's bonus review. Both grouped by the name printed on each challan, while the brand filter and the inventory group by the stored value.
- Fix: `getTyreAnalytics` groups `byBrand` by the brand's stored value (lines without one fall back to their name) and shows the brand's current name from Settings; a brand removed from Settings keeps the name on its challans. `getTyreReviewData` (bonus review) does the same. The output shape (`brand` / `product`, `qty` / `count`, `revenue`) is unchanged for the screens.
- Test: `test/tyrebill.dao.test.js` "sales by brand keeps a renamed brand as one bar, under its current name" (dashboard and bonus review). It fails with neither fix and with only the dashboard fix, and passes with both.

Gate: backend 108/108; tsc + build OK; e2e tyre 65, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 78 — area (d) printed challan, round 13 (an address typed on several lines)
The challan form's address is a multi-line box. A challan whose address was typed as four lines ("Door No. 221/4 / Omalur Main Road / Near New Bus Stand / Salem 636004") keeps the line breaks when saved and prints them in "Delivered to" as four lines, with the phone below and the tyre table after; 0 overprints. `getTextDimensions` counts the typed line breaks, so the block below is placed correctly.

Nothing new found. No code changed (last full gate: run 77, all green).

## Run 79 — area (e) settings, inventory, bonus, round 13 (a bonus percentage over 100)
**Bug: Settings saved a bonus percentage of 250% without a word.** Repro: Settings → tyre Bonus, mechanic "% of tyre amount" → type 250 (a typo for 25), Save All Settings → `mechanicPercent: 250` saved, no message. The box's `max={100}` is only a hint (the Settings form does not use the browser's checks). The bonus code then quietly clamps to 100%, so the mechanic is owed the whole tyre amount while Settings shows "250%". The automobile, engineering and radiator percentage boxes (the shared `pctField` and the radiator bonus grid) accept it the same way.
- Fix (`Pages/Settings/Index.tsx`, `handleSave`): Save is refused while any bonus percentage (flat ones and the radiator grid, every vertical) is outside 0–100, with "A bonus percentage must be between 0 and 100 (Bonus tab). Fix it, then save." Nothing is sent.
- Test: `e2e/tyre.e2e.mjs` "a bonus percentage over 100 is not saved". It fails before the fix (1 save) and passes after. The automobile, engineering and radiator suites, which save their own settings, still pass.

Gate: backend 108/108; tsc + build OK; e2e tyre 66, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## Run 80 — area (f) regressions, round 13 (engineering bills and paise sums)
**Correction to runs 74–75:** engineering bills *do* keep a running received amount (`recordEngPayment` passes `prevReceived + pay` into `computeTotals`), so they had the same bug. Repro: a ₹10,000.37 engineering bill paid ₹5,000.19, then ₹5,000.18 → `amountReceived` 10000.369999999999, status "Partial", balance ₹0.
- Fix (`engbill.dao.js` `computeTotals`): the received amount is rounded to the paisa.
- Test: `test/engbill.dao.test.js` "recordEngPayment: paid in paise parts…". It fails before the fix and passes after.

User report received during this run: "In settings, at tyre catalog is not working". Driven in the browser on a fresh tyre tenant (add brand, add model with rate, change rate, Save): every step works and the saved catalog is right; the server stores the `tyre` section as sent. Not reproduced yet; waiting on what the user sees.

Gate: backend 109/109; tsc + build OK; e2e tyre 66, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## User request (2026-10-27) — "In settings, at tyre catalog is not working" (user: "changes disappear")
**Cause:** in the Tyre Catalog (and every Settings tab), adding a brand or model, changing a rate or renaming only changes the form; it is kept only when Save All Settings is pressed. Leaving the page or reloading dropped the changes with no warning. Repro in the browser: add brand JK with a 10.00-20 model, go to another page and come back → JK is gone. With Save All Settings pressed first, JK survives a reload (the server stores the catalog as sent).
- Fix (`Pages/Settings/Index.tsx`): the page tracks unsaved changes (the form compared with the last loaded / saved settings; image links are left out, as uploads save at once). While there are unsaved changes the footer shows "Unsaved changes — Press Save All Settings to keep them", clicking any link in the app asks "You have unsaved changes in Settings. Leave without saving them?" (Cancel stays), and reloading or closing the tab gets the browser's leave warning. After Save the note clears.
- Test: `e2e/tyre.e2e.mjs` "unsaved catalog changes are flagged, and leaving asks first". The old code leaves without asking, so the suite cannot pass on it.

Gate: backend 109/109; tsc + build OK; e2e tyre 67, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

Other user requests from the same message (in progress): bill tables sorted by latest bill date first and the date filter checked (all company types); bonus in ₹ only, no % (all company types); engineering print without the subtitle; tyre challan form and print without address, mechanic, labour and note, and no tyre bonus (user's answer: "No bonus for tyre").

## User request (2026-10-27) — tyre challan without address, mechanic, labour, notes; no tyre bonus
User: "In create bill and print — remove address, mechanic name, labour name, note"; asked about the bonus, they chose "No bonus for tyre".
- Challan form (`Pages/Tyre/Dashboard/Create.tsx`): the delivery address, mechanic (was required), labour and notes fields are gone and are no longer sent. The shop's own address in the header is kept.
- Printed challan (`PrintTyreChallan.ts`): no delivery address and no mechanic row, also for older challans that stored them.
- Challan list: no mechanic filter; the Excel export has no Address / Mechanic columns. Dashboard: no mechanic filter and no "Top mechanics" chart (Top brands now spans the row).
- Bonus: the tyre sidebar has no Bonus menu; Settings has no tyre Bonus tab, no "Mechanic & Labour" people tab and no mechanic / worker label boxes. The server needed no change: a challan without names creates no bonus entries.
- Tests (`e2e/tyre.e2e.mjs`): "sidebar has Challans, Inventory, Expenses, Salary and no Bonus", "the challan form has no address, mechanic, labour or notes", "the challan prints no address or mechanic". The tyre bonus page and tyre bonus % checks were removed with the feature.

Gate: backend 109/109; tsc + build OK; e2e tyre 66, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## User request (2026-10-27) — bill tables: date filter behaviour and latest date first (all company types)
User's answer on "current date sort": "Latest bill date first".
- Order: radiator, automobile and tyre bill lists showed the most recently *entered* bill on top (`createdAt`), so a back-dated bill typed today sat above today's bills. They now list by bill date, newest first, with same-day bills newest entered first; their Excel exports use the same order. Engineering already listed by bill date (bill no. as the tie-break) and is unchanged.
- Date filter: checked on all four company types with the server clock in UTC and in Indian time. From and To are both included, a From-only or To-only filter works, and only bills on those days come back. No change was needed.
- Test: `test/billorder.test.js` (8 tests, one order test and one filter test per company type, list and export). Before the change the radiator, automobile and tyre order tests fail (their filter tests failed only on the order of the same bills); after it all pass in both time zones.

Gate: backend 117/117; tsc + build OK; e2e tyre 66, automobile 45, engineering 168, radiator 17, salary 7, 0 FAIL.

## User request (2026-10-27) — bonus in rupees only, no percentages (radiator, automobile, engineering)
User: "Remove percentage wise bonus, only with rupees"; for radiator they chose "₹ per service in grid". (Tyre has no bonus any more.)
- Radiator (`bonus.dao.js` `computeRoleBonus`): each role is "₹ per service" (default: a fixed ₹ for each service line from the product × service grid, stored in the new `bonus.<role>.amountMatrix`, with "Default ₹ per service" for anything not in the grid) or "₹ per bill" (unchanged). The old `matrix` of percentages and `defaultPercent` are ignored, so an old 10% is never read as ₹10.
- Automobile (`computeFlatRoleBonus`): a fixed ₹ per bill for the mechanic (`mechanicAmount`) and for the workers (`labourAmount`, split equally). The old `mechanicPercent` / `labourPercent` are ignored.
- Engineering (`engbonus.dao.js`): a fixed ₹ per bill (`mechanicAmount`); the % mode is gone.
- Fixed amounts are not reduced by a discount (as the existing ₹ per bill already worked); they still become payable in step with collection. Bills with a zero total earn nothing.
- Settings: radiator bonus type "₹ per service" / "₹ per bill" with ₹ cells; automobile two ₹ boxes; engineering one ₹ box (no type switch). The admin client view shows the ₹ grid. Run 79's "0–100%" Save check is removed: no percentages remain, and old stored % values must not block saving.
- **Existing tenants must enter their ₹ amounts once.** Until then their bonus works out to ₹0. Pending (not yet paid) bonus entries are re-priced when a bill is next saved or paid, or with Recalculate on the Bonus page. Paid entries never change.
- Tests: backend bonus tests converted to ₹ (automobile, radiator, radiator dao, engineering bonus and profit), plus "bonus is rupees only: an old % grid (or no mode) is never read as rupees" and the engineering "an old % setting is ignored" case; e2e: radiator "₹ per service grid, with no % anywhere" and "saves labour ₹40 per BS-3 service line", engineering "only a mechanic ₹ per bill (no %)".

Gate: backend 118/118; tsc + build OK; e2e tyre 66, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## User request (2026-10-27) — tyre company without Expenses, Bonus and Salary
Asked which tyre parts to remove, the user picked the Salary, Bonus and Expense pages (form fields, tyre line fields and the printed challan stay as they are).
- Menu (`layout/navConfig.ts`): a tyre tenant sees Dashboard, Challans, Inventory, Settings and Activity Log only.
- Pages (`App.tsx`): a new `NotForTyre` guard on the expenses, bonus (mechanic, labour and both reviews) and salary (employees, settle) routes sends a tyre tenant to the tyre dashboard, also when the address is typed in.
- Settings: no Salary tab for tyre.
- Tests (`e2e/tyre.e2e.mjs`): "sidebar has Challans and Inventory, and no Expenses, Bonus or Salary" and "expenses, bonus and salary pages send a tyre tenant to its dashboard". The other company types are unchanged (their suites pass).

Gate: backend 118/118; tsc + build OK; e2e tyre 67, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 81 — area (f) regressions after today's requested changes
- Unsaved-changes note (added today): Settings opened as a radiator, automobile, engineering and tyre tenant whose stored settings predate today (old % bonus fields, no ₹ grid, no engineering bonus block). Every tab was visited without editing: the note never appears and a sidebar link leaves without asking. No false warnings.
- Rupees-only bonus on an old radiator tenant: the old 10% grid cell shows empty (never "10"); typing ₹150 saves `amountMatrix.bs3.service = 150`; adding a radiator model "BS-VII" adds it to both ₹ grids even though the tenant had no `amountMatrix` yet; no page errors.

Nothing new found. No code changed (last full gate: the tyre Expenses/Bonus/Salary change, all green).

## Run 82 — area (b) challan form, round 14 (the form after today's field removals)
New challan form at 1300px (light) and 390px (dark): "Delivered to" now holds Date*, Vehicle Number*, Customer Name and Phone number, as a 2 × 2 grid on a laptop and one column on a phone; no gaps where the removed fields were, no sideways scrolling. Saving without a mechanic works (the tyre e2e create flow, 67/67 last run).

Nothing new found. No code changed (last full gate: the tyre Expenses/Bonus/Salary change, all green).

## Run 83 — area (c) list + dashboard, round 14 (search after the field removals)
**Bug: the challan list found older challans by text they no longer show.** Repro: a challan saved before today with mechanic "Ramesh" (or labour "Siva", address "Anna Nagar", notes "urgent"); search "Ramesh" on the challan list → it is listed, though nothing on the challan or the list says Ramesh. The search still looked in the address, mechanic, labour and notes fields that were removed from the challan today.
- Fix (`tyrebill.dao.js` `searchClause`): the search looks only at what a challan shows: D.C. No, vehicle number, customer, phone, tyre brand / model and tyre numbers. Customer and vehicle searches work as before.
- Test: `test/tyrebill.dao.test.js` "list search matches only what a tyre challan shows". It fails before the fix (found by hidden "Ramesh") and passes after.

Gate: backend 119/119; tsc + build OK; e2e tyre 67, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 84: 2026-10-27 (area d, printed challan)
- Printed two challans made after today's field removals: an installment challan (customer + phone, 2 rows) and a bare full-payment one (vehicle only). Both fit on one page with 0 overprints. No address or mechanic is left on either. The Details block shows only Vehicle and Payment. A blank customer falls back to the vehicle number under "Delivered to".
- No bugs found. Quiet run.

## Run 85: 2026-10-27 (area e, settings + tyre inventory)
- Bug: after a brand was renamed in Settings (e.g. MRF → MRF Tyres), the Inventory purchases list still showed earlier stock entries under the old name ("MRF 10.00-20"), and searching for the new name didn't find them. The stock summary already showed the new name, so the two tables disagreed. Automobile parts had the same problem.
- Fix (`inventory.dao.js` `listStockEntries`): each entry is shown under its part's current catalog name, and the search also matches parts by their current name. The stored value doesn't change on a rename, so stock counts were never affected.
- Test: `test/tyrebill.dao.test.js` "after a brand rename the purchases list shows and finds the tyre under its current name". It fails before the fix and passes after.
- Left open (minor): sorting that list by part still orders by the stored name.

Gate: backend 120/120; tsc + build OK; e2e tyre 67, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 86: 2026-10-27 (area f, regression in the other company types)
- Lead from run 85, checked and dropped: searching challans by a renamed brand's new name doesn't find older challans. Those challans show the brand name as it was when they were made, and search matches what's shown. The brand filter finds them by brand.
- Rupees-only bonus with settings saved in the older shape: an old "percent" mode falls back to the ₹ grid, an old % grid is never read as ₹, and grids that don't exist yet are handled when a product is added or removed.
- Bonus settings at 390px (radiator, automobile, engineering, light; radiator dark): no page-level sideways scroll, and the radiator ₹ grid scrolls inside its own box.
- Noted, not changed: the radiator labour card's heading reads "Labour Name bonus" because it uses the worker label stored in Settings (wording the user owns).
- No bugs found. Quiet run (1 of 3).

## Run 87: 2026-10-27 (area a, challan money logic)
- Due dates: "YYYY-MM-DD" is stored as UTC midnight on servers in both India and US Pacific time, so the day-based overdue check reads the right day.
- Negative amounts are refused by `toMoney`, so a payment can't lower what was received, even together with a discount change.
- A seeded fuzz (150 challans, a mix of full and installment, up to 6 random payments, discounts or edits each, including overpay attempts) checked after every step:
  - received equals the sum of the payment log;
  - pending equals what's left to collect, never below 0;
  - status matches what was received;
  - no installment is paid beyond its total.
  All held. The fuzz was a scratch test and isn't committed.
- No bugs found. Quiet run (2 of 3).

## Run 88: 2026-10-28 (area b, challan form UI)
- An installment challan with a paid row, an overdue part-paid row (₹4,000 of ₹10,400) and an unpaid row. Checked the edit and view pages at 1300px light and 390px dark:
  - no sideways scroll;
  - paid and part-paid rows are locked (no date picker, no remove);
  - only the unpaid row can be edited or removed;
  - status chips read Paid / Overdue / Due;
  - the totals (₹49,300 to collect, ₹32,500 received, ₹16,800 pending) and the principal check match.
- The date boxes show MM/DD only because the test browser uses US date order; a browser set to Indian dates shows DD/MM.
- No bugs found. Quiet run (3 of 3 in a row): suggest the user stop the hourly task.

## Run 89: 2026-10-28 (area c, challan list + dashboard)
- Dashboard with 8 mixed challans adds up: overdue ₹1,24,750 = the sum of the four overdue row balances; collection rate 4.6% = ₹15,000 / ₹3,22,950; ₹0 due this month is correct (next rows fall on 15 Nov). No sideways scroll at 1300 or 390.
- Bug (screenshot, 390px): on the phone list, "Not Received" cards dropped the status chip and ⋮ menu onto a second line under the vehicle number, while "Partial" and "Overdue" stayed on the title line. That made the cards uneven. Cause: the shared card title had a fixed 140px minimum (`.m-card-key { flex: 1 1 140px }`), so a short title plus the widest chip and the menu didn't fit the row.
- Fix (`styles/components/ui.css`): the title takes its own width (`flex: 1 1 auto`). A short vehicle number keeps any chip on its line; a long title still pushes the chip group to the next line as before. The card is shared by every company type.
- Test: `e2e/tyre.e2e.mjs` "a short vehicle number keeps its badge on the same line". It failed on all 3 "Not Received" cards before the fix and passes after.

Gate: backend 120/120; tsc + build OK; e2e tyre 68, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 90: 2026-10-28 (area d, printed challan)
- Stress print: 12 tyre lines with up to 4 long serials each, an 80-character customer name, two phone numbers, 24 installments and a paise payment. Three pages, 0 overprints. Names and serials wrap, table headers repeat on each page, and the signatures stay on the last page.
- Bug (screenshot): with a seven-digit total, the bold "Amount to collect" ran into its amount and printed as "Amount to collecRs 7,56,088.50". The overprint check missed it: the words touch rather than overlap enough to count. Cause: the totals' label column started at a fixed 62mm from the edge, which leaves about 52mm for the label and amount.
- Fix (`PrintTyreChallan.ts`): the totals rows are collected first, the widest label + amount pair is measured at its own font, and the label column moves left only as far as that needs. Ordinary totals print exactly where they did.
- Test: `e2e/tyre.e2e.mjs` "a seven-digit amount to collect does not run into its label" (40 tyres at ₹24,999.50 plus interest). Gap −8.2pt before the fix, +11.1pt after.
- Left open (minor, app-wide): whole-rupee amounts print without paise ("Rs 7,27,695") next to amounts with paise ("Rs 28,393.50").

Gate: backend 120/120; tsc + build OK; e2e tyre 69, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 91: 2026-10-28 (area e, tyre inventory page)
- Inventory with real stock and challans (3 tyres: one short, one unsold, one in stock). Every figure checks: Apollo bought 6 / sold 8 = short by 2; MRF 13 left × ₹21,000.50 = ₹2,73,006.50; profit = sales − sold × average cost; units in stock 15; 1 tyre out of stock. No page-level sideways scroll at 1300 or 390.
- Bug (screenshot, 1300px): in "Stock by tyre", short names broke in the middle of the size: "MRF 10.00-" / "20". The name cell also holds the expand button, so the text got less than the column's minimum width.
- Two rejected attempts: the wide column class (220px) and a 190px cell both made the table wider, and 190px still broke the name.
- Fix (`Pages/Automobile/Inventory/Index.tsx`, shared by tyre and automobile): a name of 24 characters or fewer stays on one line, and longer names wrap as before. The table is no wider than it was.
- Test: `e2e/tyre.e2e.mjs` "inventory keeps a short tyre name on one line". The e2e now serves the real inventory summary instead of an empty stub. "Apollo 9.00-20 XT-7 (2 lines)" before the fix; passes after. The check fails if it finds no names to check.
- Open, needs the user (same as the earlier wide-lists question): at 1300px with the sidebar open, the stock table is 65px wider than its card. The last column, the ⋮ row menu, is off-screen until the table is scrolled sideways. This was like this before this run.

Gate: backend 120/120; tsc + build OK; e2e tyre 70, automobile 45, engineering 166, radiator 17, salary 7, 0 FAIL.

## Run 92: 2026-10-28 (area f, regression in the other company types)
- Checked every phone card that shares the header changed in run 89 (`.m-card-key`), comparing screenshots before and after that change.
- Regression found (caused by run 89, screenshots at 390px):
  - Radiator Expenses: "Electricity bill — September" pushed its amount and ⋮ menu down, and the menu ended up alone on a line, which the card was built to prevent.
  - Admin › Clients: "Arun Engineering Works" pushed its "Suspended" badge and menu onto a second line, where before the name wrapped beside them.
- Root cause: run 89 removed the title's minimum width altogether (`flex: 1 1 auto`). The real problem was only that the 140px minimum was about 8px too big for a vehicle number beside "Not Received".
- Fix (`styles/components/ui.css`): the title wraps beside the badges and menu down to 100px (`flex: 1 1 100px`). A vehicle number still fits beside "Not Received", and expense and client cards look exactly as they did before run 89 (side-by-side screenshots).
- Test: `e2e/radiator.e2e.mjs` "phone expense cards keep the ⋮ menu beside the title" (390px, shared fixtures). It fails with run 89's CSS on "Electricity bill — September" and passes now. The tyre check "a short vehicle number keeps its badge on the same line" still passes.

Gate: backend 120/120; tsc + build OK; e2e tyre 70, automobile 45, engineering 166, radiator 18, salary 7, 0 FAIL.

## Run 93: 2026-10-28 (area a, challan money logic: plan edits)
- Run 87's fuzz never edited an installment plan. This one does: 120 installment challans, 8 random steps each, mixing payments with plan edits. Edits drop or keep unpaid rows, add rows, re-split principals, change the tyre quantity, and are sometimes deliberately wrong.
- Checked after every step:
  - received = payment log = sum of the rows' paid amounts;
  - principals = tyre amount;
  - to collect = tyre amount + interest;
  - pending and status follow what was received;
  - no row is overpaid;
  - every row that had a payment keeps its principal, interest and due date, and never loses a payment.
- Result: 373 edits, 336 payments and 125 refused (all as intended, with the challan unchanged). All checks held. The fuzz was a scratch test and isn't committed.
- No bugs found.

## Run 94: 2026-10-28 (area b, payment dialog)
- Record Payment on an installment challan (paid row, overdue part-paid row, unpaid row) and on a full-payment challan with a part payment, at 1300px light and 390px dark. Figures are right (₹49,300 / ₹32,500 / ₹16,800; ₹76,002 = 4 × ₹19,000.50). No sideways scroll.
- Behaviour, checked in the browser against the real DAO:
  - only rows with a balance are offered (the paid row isn't);
  - the overdue row is picked first, with its ₹6,400 balance filled in;
  - switching to the 2nd month fills ₹10,400;
  - ₹99,999 is refused before sending ("Only ₹10,400 is left on 2nd month");
  - ₹400.50 is posted to the chosen row, which becomes "Partly paid" with ₹9,999.50 left.
- No bugs found. Quiet run (2 in a row).

## Run 95: 2026-10-28 (area c, list + dashboard data)
- Filter consistency: 24 challans across 6 days (full and installment, two brands, unpaid / part-paid / paid). Checked 480 combinations of date range (single day, month, open-ended on either side), status, payment type, brand and overdue.
- For every combination, the list total, the export and the dashboard's challan count match each other and a hand count from the stored dates, with both ends of a date range included. Run with the server on UTC and on India time.
- Note (not a finding): the date filter starts each day at the server's local midnight while bill dates are stored as UTC midnight. That's correct on UTC or India-time servers; a server west of UTC would shift the range edges by a day. Not changed: the app isn't run that way.
- No bugs found. Quiet run (3 in a row: 93, 94, 95).

## Run 96: 2026-10-28 (area d, printed challan totals)
- Printed the totals blocks not yet checked, each one page with 0 overprints:
  - full payment with a ₹500 discount and a part payment: ₹48,500 − ₹500 = ₹48,000, received ₹20,000, balance ₹28,000;
  - full payment settled with a discount: ₹24,250 − ₹250 = ₹24,000, received ₹24,000, balance ₹0;
  - installment plan paid off: ₹24,550 collected, with each row's Paid column equal to its total.
- In the text extract, PLAN's totals looked further right than DISC's. The rendered pages show both columns at the same position, so it's only pdftotext's layout.
- No bugs found. Quiet run (4 in a row: 93–96).

## Run 97: 2026-10-28 (area e, tyre settings)
- Bug (exact steps): in Settings › Tyre Catalog, rename CEAT to " mrf " (any case or spacing of an existing brand) and press Save All Settings. It saved two brands both called MRF, so the challan form offered two identical "MRF" choices and inventory listed two "MRF …" rows. Adding a duplicate was already refused, but renaming had no check.
- Fix: `catalogDuplicate()` in `Pages/Tyre/Settings/TyreSettingsTabs.tsx` compares names the way the add boxes do (case, spaces and punctuation ignored). `Settings/Index.tsx` `handleSave` refuses a brand used twice, or a model used twice under one brand, with a message naming it ("mrf is in the Tyre Catalog twice. Give each brand its own name, then save.").
- Test: `e2e/tyre.e2e.mjs` "a brand renamed to another brand's name is not saved". It saved once before the fix; 0 saves and the message after.
- Checked, fine: removing a brand only takes effect on Save, and leaving with unsaved changes asks first. Re-adding a brand under its old name gets its old value back, so its earlier stock re-links.

Gate: backend 120/120; tsc + build OK; e2e tyre 71, automobile 45, engineering 166, radiator 18, salary 7, 0 FAIL.

## Run 98: 2026-10-28 (area f, regression: automobile parts catalog)
- Checked whether the catalog bugs fixed for tyre (runs 53, 71, 97) also exist in the automobile parts catalog, which tyre inventory was built from. All three did (reproduced in the browser):
  1. Add "Air Filter", rename it "Air Filter (old)", then add "Air Filter" again: nothing happens and no message. Duplicates were judged by the stored value, which the renamed part still holds.
  2. Rename "Brake Shoe" to "oil filter " and save: two parts named Oil Filter are saved.
  3. Clear a part's name and save: a part with no name is saved.
- Fix (`Pages/Settings/Index.tsx`):
  - `addPart` judges duplicates by the names on screen and says so; a new part gets the next free value.
  - `handleSave` refuses a blank part name, or the same name twice ("oil filter is in the parts catalog twice. Give each part its own name, then save.").
- Tests: `e2e/automobile.e2e.mjs` "a part can be added under a renamed part's old name", "two parts with the same name are not saved", "a part with no name is not saved". All 3 failed before the fix and pass after. The suite now captures settings saves.
  - First attempt at check 1 passed without the fix: the fixture's values ("oil-filter") aren't what this page's slugify makes ("oilfilter"). The check now adds its own part through the screen.
- Not changed: radiator products and service types can't be renamed. Adding an exact duplicate there is silently ignored, which is minor.

Gate: backend 120/120; tsc + build OK; e2e tyre 71, automobile 48, engineering 166, radiator 18, salary 7, 0 FAIL.

## Run 99: 2026-10-28 (area a, full-payment edits)
- Fuzz on the one money path not yet fuzzed: full-payment challans edited after payments and discounts. 150 challans, 8 random steps each: part payments and overpay attempts, discount changes, and edits moving qty and rate between 30% and 170%.
- Checked after every step:
  - received = payment log;
  - total = tyre amount − discount, with the discount between 0 and the tyre amount;
  - pending = total − received, never below 0;
  - status matches what was received;
  - an edit never changes what was received or the discount.
- Result: 422 edits, 430 payments and 215 refusals, all checks held. Every refusal was a legitimate guard: 178 edits below received + discount, 27 discounts above what was owed, 10 payments on paid challans. The fuzz was a scratch test and isn't committed.
- No bugs found.

## Run 100: 2026-10-28 (area b, create form: installment plan flow at 390px light)
- Drove a new challan against the real DAO:
  - MRF × 2 → Installments: 3 empty rows, "Still to schedule ₹48,500".
  - Fill ₹28,500 + ₹20,000 (+₹400 interest): "Matches the tyre amount ✓".
  - Change qty to 3: "Still to schedule ₹24,250", shown in orange.
  - Save: refused before sending, with "Principal is ₹24,250.00 short of the tyre amount. Add it to an installment." The empty third row is flagged "Enter an amount (or remove this row)".
  - Set row 2 to ₹44,250 and remove the empty row: saves, with 3 × ₹24,250, ₹28,500 due today and ₹44,250 + ₹400 due a month later.
- Layout at 390px light: no sideways scroll; the header and footer stay pinned on screen.
- No bugs found.

## Run 101: 2026-10-28 (area c, list sorting)
- Every challan list sort key (D.C. no, date, vehicle, customer, payment type, next due, to collect, received, pending, status), both directions, read page by page (7 per page) over 23 mixed challans:
  - each challan appears exactly once across the pages;
  - numbers and dates are in order;
  - next due keeps challans with nothing scheduled last both ways;
  - the export comes in the same order as the list.
- Looked like a bug, isn't: customer A→Z put "Zeta Lorry" before "anand" in the test. The real queries all pass `SORT_COLLATION` (case-insensitive, numeric-aware), which MongoDB honours and the in-memory test DB ignores. So text order can't be checked here, and nothing was changed.
- No bugs found. Quiet run (3 in a row: 99, 100, 101).

## Run 102: 2026-10-28 (area d, printed challan with a bare company profile)
- Printed with only a company name: no address, phone, email, logo, QR or signature image; signature and QR switched off; no footer note. Both challans (with and without customer details) are one page with 0 overprints.
- The header closes up with no empty gap, since the subtitle takes the address's place. The signature lines and "For Kannan Tyres / Authorised signatory" stay, and the footer shows just the company name.
- No bugs found. Quiet run (4 in a row: 99–102).

## Run 103: 2026-10-28 (area e, tyre Add stock form at 390px dark)
- Drove Add stock against the real inventory DAO:
  - 1.5 tyres is refused on screen ("Whole tyres only") and nothing is sent;
  - 4 tyres at ₹23,000 is sent with the brand:model key, and the stock for that tyre goes from 2 to 6 at the same average cost;
  - the form closes after saving;
  - the Purchases tab lists the new entry first, under the tyre's current name.
- An apparent open dialog after saving was the hidden phone sidebar (it has the dialog role); the Add stock form had closed.
- No bugs found. Quiet run (5 in a row: 99–103).

## Run 104: 2026-10-28 (area f, salary screens at 390px)
- Employees and Settle salary captured at 390px with `e2e/screens.mjs` (mocked API): no page errors, no sideways scroll.
- Employee cards keep name + salary on one line, with the badges and ⋮ on the next, the same as before runs 89/92.
- The settle page's figures (September attendance marks against an October period, 30 working days in a 28-day period) are fixture values from the mocked responses, not computed by the app, so they aren't a finding.
- No bugs found. Quiet run (6 in a row: 99–104).

## Run 105: 2026-10-29 (area a, D.C. numbering)
- The session's worker restarted repeatedly. 23 hourly firings (2026-10-28 18:11 to 2026-10-29 16:19 UTC) arrived together, so this one run covers them; repeating the same checks 23 times would find nothing more.
- D.C. numbers (real `nextBillNo` on the fake DB):
  - 101, 102; deleting 102 and creating again gives 103 (never reused);
  - raising "First D.C. number" to 500 gives 500 next;
  - lowering it to 1 gives 501 (no reuse);
  - another tenant starts its own counter at 1.
  The scratch test isn't committed.
- No bugs found. Quiet run (7 in a row: 99–105).

## Run 106: 2026-10-29 (area b, edit form on a paid full-payment challan, 390px)
- Full-payment challan (₹48,500) with ₹10,000 received, opened in Edit:
  - clicking "Installments" doesn't switch, and no plan appears;
  - the note "A payment is recorded, so the payment type can't change." is shown;
  - saving sends paymentType "full", and the challan keeps ₹10,000 received, ₹38,500 pending, status Partial.
- No bugs found. Quiet run (8 in a row: 99–106).

## Run 107: 2026-10-29 (area c, dashboard "Installments to collect" at the month end)
- One plan with rows due Oct 1 (part paid ₹400 of ₹1,000), Oct 29 (today), Oct 30 (paid), Oct 31 (₹1,000 + ₹50 interest) and Nov 1; "now" = Oct 29, on UTC and India time:
  - overdue ₹600 on 1 challan (Oct 1 only);
  - due this month ₹2,050 (today's row is due, not overdue; the Oct 31 row is included; the paid row and the Nov 1 row are left out);
  - the follow-up list shows the three open rows in date order.
  The scratch test isn't committed.
- No bugs found. Quiet run (9 in a row: 99–107).

## Run 108: 2026-10-29 (area d, unusual tyre numbers on the printed challan)
- Printed a 40-character tyre number with no separators, and two serials joined with ";" instead of a comma. One page, 0 overprints.
- The unbroken number wraps onto three lines inside the Tyre no. column. The ";" pair wraps mid-serial ("SN-A" / "/2026/0002") but stays in its column. Comma-separated serials (what the form suggests) already break cleanly between serials (run 52).
- No bugs found. Quiet run (10 in a row: 99–108).

## Run 109: 2026-10-29 (area e, editing tyre stock entries)
- Real inventory DAO on the fake DB:
  - moving an entry from model A (6) to model B with qty 4 leaves A 0 and B 4;
  - an edit to 2.5 tyres is refused ("qty must be a whole number") and changes nothing;
  - another tenant's edit is refused ("Stock entry not found").
- Delete couldn't be run here: the in-memory test DB has no `findOneAndDelete`. By reading, `deleteStockEntry` filters on the tenant the same way and returns 404 otherwise. The scratch tests aren't committed.
- No bugs found. Quiet run (11 in a row: 99–109).

## Run 110: 2026-10-29 (area f, full gate on the current staging head)
- The full gate hasn't run since run 98 (runs 99–109 changed only this log), so it was rerun on efd3e01: backend 120/120; tsc + build OK; e2e tyre 71, automobile 48, engineering 166, radiator 18, salary 7, 0 FAIL.
- No bugs found. Quiet run (12 in a row: 99–110).

## Run 111: 2026-10-29 (area a, paisa-level amounts)
- An installment of ₹0.10 + ₹0.20 interest paid with ₹0.30: the row is Paid with ₹0 left (no 0.1 + 0.2 float noise).
- ₹0.005 is kept as ₹0.01. ₹999.996 rounds to ₹1,000, more than the ₹999.99 left, so it's refused with a clear message.
- Full payment ₹100.30: a ₹0.10 then ₹0.30 discount gives ₹100 to collect; ₹100.004 paid rounds to ₹100, and the challan is Received with ₹0 pending.
- The scratch test isn't committed.
- No bugs found. Quiet run (13 in a row: 99–111).

## Run 112: 2026-10-29 (area b, challan form at 1300px dark)
- The one theme/width pair not yet captured: an installment challan (paid / overdue part-paid / due rows) in Edit and View at 1300px dark. No sideways scroll; chips, paid amounts, the locked rows and the green principal check all read clearly; totals ₹49,300 / ₹32,500 / ₹16,800.
- No bugs found. Quiet run (14 in a row: 99–112).

## Run 113: 2026-10-30 (area c, challan Excel export after the field removals)
- The export writes three sheets (challans, tyre lines, installments). The challan sheet has D.C. No, Date, Vehicle, Customer, Phone, Tyres, Payment, Tyre amount, Interest, Discount, To collect, Received, Pending, Overdue and Status: no Address, Mechanic or Labour column remains.
- `getAllTyreBillsForExport` enriches every challan, so Overdue and the per-row totals and statuses are filled, in the list's order (run 101).
- No bugs found. Quiet run (15 in a row: 99–113).

## Run 114: 2026-10-30 (area d, page breaks before the signatures)
- Printed installment challans with 5 to 14 tyre lines and a 3-row plan: 0 overprints in all.
- Bug (screenshot): with 5 tyres the whole challan fit on page 1, yet the signature lines alone were printed on a second page. The fit check reserved room for a signature image (from `sy + 4`) even when none is printed (Show signature off, or no image uploaded). That's 16mm reserved for nothing, and the plan ended about 1–2mm into it.
- Fix (`PrintTyreChallan.ts`): the image's room is reserved only when an image is printed; otherwise the block starts just above its signature lines. 5 and 6 tyres now print on one page. 7+ still break, and then the plan moves to page 2 together with the signatures. With a signature image switched on, its room is still kept (5 tyres then take 2 pages, with the image on page 2).
- Test: `e2e/tyre.e2e.mjs` "5 tyres and a 3-row plan fit one page without a signature image". 2 pages before the fix, 1 after.

Gate: backend 120/120; tsc + build OK; e2e tyre 72, automobile 48, engineering 166, radiator 18, salary 7, 0 FAIL.

## Run 115: 2026-10-30 (area f, run 114's signature bug in the other PDFs)
- Checked whether the other prints share run 114's bug (signature-image space reserved when no image prints, pushing the signatures onto their own page). They don't:
  - PrintInvoice (radiator + automobile) and PrintEngInvoice draw the signature block in the flow at `sectionY`, below the totals, with no fit check that reserves image space;
  - PrintEngInvoice's only page-break check (`ty + 22 > H - 46`) is for its totals block and doesn't depend on the image;
  - PrintPayslip has no signature block.
- No bugs found. (Area e moves to the next run.)

## Run 116: 2026-10-30 (area e, Labels & Challan: custom field names)
- The vehicle and customer labels from Settings › Labels & Challan are used everywhere those fields appear:
  - challan form (label, placeholder, "is required" message);
  - list column headers and the Excel export columns;
  - the dashboard follow-up table;
  - the printed challan's Details block (falling back to "Vehicle").
  The only fixed wording is the list search hint ("Search D.C. no, vehicle…"), which is fine as a generic hint.
- No bugs found.

## Run 117: 2026-10-30 (area f, engineering bonus Recalculate after the rupees-only change)
- Two engineering bills at ₹200 per bill; one entry marked paid. Bonus changed to ₹500 and `backfillEng` (the Recalculate button) run:
  - the pending entry is repriced to ₹500 accrued, ₹250 payable (half collected);
  - the paid entry stays at ₹200 (locked) with no duplicate.
  The scratch test isn't committed.
- No bugs found. Quiet run (3 in a row: 115–117).

## Run 118: 2026-10-30 (area a, overdue filter after payments)
- The list's Overdue filter reads the stored next due date, while the dashboard works it out live. They stay in step as payments come in:
  - two past-due rows (₹2,000 overdue): paying the oldest leaves the challan Overdue (₹1,000); paying the second takes it off the filter, with ₹0 overdue on the dashboard;
  - paying a later, not-yet-due row first doesn't hide an earlier unpaid one, so the challan stays Overdue.
  The scratch test isn't committed.
- No bugs found. Quiet run (4 in a row: 115–118).

## Run 119: 2026-10-30 (area b, editing an installment plan that has payments, 390px dark)
- Challan with ₹48,500 of tyres, ₹28,500 initial (paid), 1st month ₹10,400 (₹5,000 paid), 2nd month ₹10,400. In Edit:
  - adding a row, removing the 2nd month and changing the challan date renumber and re-date only the unpaid rows; the saved plan keeps both payments (₹33,500 received). No bug.
  - Lowering the quantity below the paid principal blocks Save with "Principal is ₹14,250.00 more than the tyre amount." That's correct, since paid rows can't shrink.
- **Bug:** the form's Pending card showed the saved pending amount, while Amount to collect beside it updates as you type. After any plan or tyre change, the cards stopped adding up (₹24,650 to collect, ₹33,500 received, ₹15,800 pending).
  - Repro: edit a challan with a payment and raise an unpaid row's interest by ₹500. Amount to collect goes up by ₹500, but Pending stays the same.
  - Fix: Pending is now worked out live as amount to collect less received, with ₹0 as the floor (the server's own formula).
  - Test: e2e/tyre.e2e.mjs "edit form's Pending is amount to collect less received" (failed with ₹38,900 instead of ₹39,400 before the fix).
- Gate: backend 120/120; tsc and build OK; e2e tyre 73, automobile 48, engineering 166, radiator 18, salary 7, all 0 FAIL.

## Run 120: 2026-10-30 (area c, list and dashboard after editing a plan that has payments)
- Following run 119: an installment challan two months old, initial row paid and the overdue 1st month part-paid (₹3,000). Checked the challan, list row, Overdue filter, dashboard figures and the "Installments to collect" panel against each other at three points:
  - before editing: ₹49,300 / ₹31,500 / ₹17,800 pending, ₹7,400 overdue;
  - after raising the 2nd month's interest and splitting it into a new 3rd month: ₹49,900 / ₹31,500 / ₹18,400, still ₹7,400 overdue;
  - after paying off the 1st month: ₹38,900 received, ₹11,000 pending; the challan leaves the Overdue filter and the panel shows ₹0 overdue.
  All five views match at every point. The scratch test isn't committed.
- No bugs found. Quiet run (1 in a row).

## Run 121: 2026-10-30 (area d, printing a challan whose plan was edited after payments)
- Printed through the app's Print button (real DAO), rendered to PNG and checked for overprints:
  - **Edited installment challan:** paid initial row, part-paid 1st month (₹3,000), a renamed long row "Pongal festival instalment (after harvest)", an added 3rd month, and an interest-only "Late fee" row (₹0 principal, ₹250 interest).
    - One page, no overprints. The long name wraps inside its column.
    - Paid column: ₹28,500 / ₹3,000 / "-". Totals ₹48,500 + ₹1,650 interest = ₹50,150; ₹31,500 received; ₹18,650 balance. All match the challan.
  - **Full-payment challan with a discount:** ₹97,000, ₹1,500 discount, ₹50,000 received. Prints "- Rs 1,500", total ₹95,500, balance ₹45,500.
    - With no customer name, "Delivered to" shows the vehicle number. That's a deliberate fallback (PrintTyreChallan.ts:106).
- No bugs found. Quiet run (2 in a row: 120–121).

## Run 122: 2026-10-30 (area e, tyre stock through challan edits and deletes)
- Bought 10 MRF and 5 Apollo, then followed the inventory summary and the MRF movements through one challan:
  - sold 3 MRF + 1 Apollo: 7 / 4 left;
  - edited to 1 MRF + 2 Apollo: 9 / 3 left;
  - edited to drop the MRF line entirely: MRF back to 10, and its movements list only the purchase;
  - deleted the challan: 10 / 5;
  - a challan for 4 MRF in another company doesn't touch this stock.
  The scratch test isn't committed.
- No bugs found. Quiet run (3 in a row: 120–122).

## Run 123: 2026-10-30 (area f, does run 119's stale-Pending bug exist in the other verticals?)
- Radiator, automobile and engineering bill forms show no Received or Pending summary, so they can't drift. Their Pending/Balance figures appear only in the list, dashboard and payment dialog, which all read the saved, server-worked-out values.
- The engineering form loads the saved discount only to show the net total. There's no discount field, and an edit leaves the payment fields out so the server keeps them (Create.tsx:276). Consistent.
- No bugs found. Quiet run (4 in a row: 120–123).

## Run 124: 2026-10-30 (area a, odd payment inputs straight to the DAO)
- Installment payments:
  - "1000", " 1000 " and "1e3" are taken as ₹1,000; "₹1,000", "-5", "NaN" and objects are refused.
  - ₹1e15 is refused as more than the row's balance; "0.004" rounds to ₹0 and is refused; 0.005 rounds to ₹0.01.
  - An unknown payment mode is stored as cash; another company's challan is "not found".
- Full-payment challans:
  - An installment id is ignored; "500" works as a discount; a negative discount is refused.
  - Paying ₹48,500 when ₹47,900 is owed caps at what's owed. The payment log records only the ₹47,900 applied, so the log and the received amount agree. That's the intended clamp.
- A bad challan id is refused with 400 by the route's `validId` before the DAO sees it.
- `true` and `[500]` are coerced to numbers, but the app never sends them (the dialog posts numbers). Not worth code.
- The scratch test isn't committed.
- No bugs found. Quiet run (5 in a row: 120–124).

## Run 125: 2026-10-30 (area b, payment dialog: paying more than is owed)
- **Bug:** on a full-payment challan with ₹47,900 owed, typing ₹48,500 and pressing Record Payment said "Payment recorded". The server quietly kept only ₹47,900, with no word about the ₹600 extra.
  - The amount box has `max`, but the shared Modal renders its form with `noValidate`, so the browser never enforced it.
  - Installment payments were already checked in `submitTyrePayment`. Full payments weren't, and nor were the radiator/automobile/engineering bills, whose servers clamp the same way.
- Fix (Components/RecordPaymentModal.tsx, used by every vertical): the dialog checks before sending.
  - An amount above what is left shows "Only ₹X is left to collect" (or "… on <installment>") under the field and sends nothing.
  - A discount above the pending amount shows "The discount can't be more than the ₹X pending".
  - Errors clear as you type.
- Checked in the browser against the real DAO:
  - ₹48,500 when ₹47,900 is owed: blocked, nothing sent.
  - ₹47,900 with a ₹500 discount: blocked, since ₹47,400 is left.
  - Exactly ₹47,900: recorded.
- Test: e2e/tyre.e2e.mjs "paying more than a full-payment challan owes is refused". Before the fix it failed with the challan at ₹24,250 received and no message.
- Gate: backend 120/120; tsc and build OK; e2e tyre 74, automobile 48, engineering 166, radiator 18, salary 7, all 0 FAIL. The automobile, engineering and radiator suites drive this dialog.

## Run 126: 2026-10-30 (area c, payment from the challan list after run 125's dialog checks)
- Record Payment from the list's ⋮ menu, at 390px dark and 1300px light, against the real DAO:
  - full challan, ₹48,500 typed with ₹47,900 owed: "Only ₹47,900.00 is left to collect";
  - full challan, ₹48,000 discount: "The discount can't be more than the ₹47,900.00 pending";
  - installment challan, ₹99,999 on the initial row: "Only ₹28,500.00 is left on Initial amount".
- In every case nothing is sent, and the error shows under its field in the modal, readable in dark mode. No sideways scroll.
- No bugs found. Quiet run (1 in a row).

## Run 127: 2026-10-30 (area f, run 125's payment-dialog checks in the other verticals; area d moves to the next run)
- Every vertical's dialog gets its pending from the server and treats the dialog's discount as an extra discount, so the run 125 limits mean the same everywhere.
- **Bug (from run 125):** radiator and automobile send `pendingAmount` unrounded (`Math.max(net − received, 0)`), e.g. 1234.56 − 1000.01 = 234.54999999999995. A discount of exactly the ₹234.55 left (writing off the rest) was refused as "more than the pending", and nothing was sent.
  - Amounts were fine, because `upTo` was already rounded; only the discount check compared against the raw value.
  - Fix: the dialog rounds pending to the paisa (`owed`) once and uses it for both checks.
- Test: e2e/radiator.e2e.mjs "a discount of exactly the pending amount is accepted". Before the fix it failed with no payment sent.
- Gate: backend 120/120; tsc and build OK; e2e tyre 74, automobile 48, engineering 166, radiator 19, salary 7, all 0 FAIL.

## Run 128: 2026-10-30 (area d, long installment plans across pages, with a signature image)
- Printed installment challans with Show signature on, the initial row paid, and plans of 12 rows (2 tyres), 24 rows (2 tyres), 36 rows (4 tyres) and 120 rows (6 tyres, the plan maximum).
  - They come out at 2, 2, 3 and 7 pages, all with 0 overprints.
- Looked at the 12- and 36-row pages:
  - the installments table breaks between rows and repeats its header on each new page;
  - the signature image and signature lines sit only at the foot of the last page;
  - every page has the "D.C. No · Page x of y" footer;
  - the last row carries the rounding remainder (₹2,710 against ₹2,694), and the totals add up (₹97,000 + ₹5,250 = ₹1,02,250).
- No bugs found. Quiet run (1 in a row).

## Run 129: 2026-10-30 (area e, other dialogs that relied on the browser's own form checks)
- Following run 125 (the shared Modal renders forms with `noValidate`, so `min`/`max` are only hints), I listed every `as="form"` dialog and checked that its numbers are validated in code:
  - payment, stock entry, salary and expense dialogs are covered;
  - Bonus › Edit and Bonus › Add manual check in code.
- **Bug (radiator/automobile/engineering bonus pages):** Bonus › Issue with a negative amount (e.g. −500) was sent as is. `settlePending` spread it across the pending entries and saved them as paid with negative paid amounts, which pulls the person's "paid" total down.
  - Repro (backend): `markPaidByRange(…, -500)` marked the entry paid.
  - Fix:
    - `settlePending` refuses an amount below 0 with a 400 ("The bonus amount must be 0 or more"); this covers Bonus › Issue and Labour review, which both post to /bonus/payout;
    - the Issue dialog checks first, like Edit does.
  - Test: test/bonus.radiator.test.js "issuing a bonus with a negative amount is refused and nothing is marked paid" (failed before the fix).
- Left as is: the stock dialog's date has `max={today()}`, but a typed future date is saved. Low impact, since stock counts don't depend on the date; noted only.
- Gate: backend 121/121; tsc and build OK; e2e tyre 74, automobile 48, engineering 166, radiator 19, salary 7, all 0 FAIL.

## Run 130: 2026-10-30 (area f, other money inputs after run 129's negative-payout bug)
- Bonus routes:
  - /manual needs an amount above 0 and /adjust needs 0 or more (both checked in the route);
  - /payout is fixed (run 129), and the engineering bonus uses the same /bonus/payout;
  - /cancel takes no amount.
- Salary:
  - advances, adjustments and settlement deductions go through `toMoney`, which refuses negatives;
  - the settlement *preview* sums deductions without that check, so a negative deduction shows a higher net in the preview. Settling then refuses it with a message, and nothing is stored. Display only, so not worth code.
- No bugs found. Quiet run (1 in a row).

## Run 131: 2026-10-30 (area a, mixed-operation fuzz)
- 60 random challans (full or a 1–4 row plan; rates ₹24,250 / ₹19,000.50 / ₹999.99), each put through 8 random steps (480 in all):
  - pay 30%, 100% or 120% of a row or of what's pending;
  - add a discount (₹10, ₹500, or all of what's left);
  - change the quantity (keeping paid rows and re-planning the rest);
  - switch payment type.
- 210 steps were refused, all with a 4xx message (overpaying a row, switching type after a payment, shrinking below what's paid). No step failed with a server error.
- After every step:
  - received = the payment log = the sum paid on the rows;
  - pending = payable − received, never below 0;
  - received ≤ payable;
  - no row paid above its total;
  - plan principals = the tyre amount.
- The only flags were challans written off entirely by discount (payable ₹0) showing "Received". That's intended (settled), and the check's own rule was wrong.
- The scratch test isn't committed.
- No bugs found. Quiet run (2 in a row: 130–131).

## Run 132: 2026-10-30 (area b, accessibility re-check after runs 119–127)
- After a payment, the challan View reloads the challan (`onPay` → `loadBill`), so Received and Pending update at once.
- axe-core 4.10.2 (serious / critical) at 1300px and 390px, light and dark:
  - new-challan form: no issues apart from the shared sidebar group titles, already logged as a design choice in run 38;
  - challan View and the payment dialog (installment and full): none;
  - the payment dialog showing run 125's new errors ("Only ₹10,400.00 is left on 1st month" / "Only ₹24,250.00 is left to collect"): none.
- No bugs found. Quiet run (3 in a row: 130–132).

## Run 133: 2026-10-30 (area c, challan list with a challan in every state)
- Five challans on the list (installments all paid; installments with one row overdue; full written off by discount; full unpaid; full part-paid) at 390px and 1300px:
  - figures match the challans, and there's no sideways scroll;
  - the written-off challan reads To collect ₹0 / Received, as intended;
  - the table's Next due column shows "All paid" and "₹5,200.00 · date / 1 overdue · ₹5,200.00".
- **Bug (phone):** the challan cards had no next due at all, though the table has a Next due column and the phone's Sort menu offers "Next due ↑/↓". A phone user could sort by a value no card showed, and couldn't see which installment to chase.
  - Fix (Billing/Index.tsx): installment cards show "Next due …", using the same `NextDue` cell as the table, so overdue rows come out red with the overdue count and amount. Full-payment cards are unchanged.
  - Test: e2e/tyre.e2e.mjs "phone installment cards show the next due" (failed before the fix).
- Gate: backend 121/121; tsc and build OK; e2e tyre 75, automobile 48, engineering 166, radiator 19, salary 7, all 0 FAIL.

## Run 134: 2026-10-30 (area d, printed challan: header options and renamed brands)
- A long company name and a long challan title were already covered (runs 10 and 20, with tests). The tyre challan has no logo or QR option to collide with them, and run 102 covered the bare profile.
- After a brand rename, an older challan's print, its View and its row in the list all show the name stored on the challan (`items.brandLabel` / `particulars`). That's consistent, and right for a record of what was delivered.
- The dashboard's brand chart groups by the stored brand value and shows the brand's *current* name (`getTyreAnalytics` maps `_id` back to the catalog). Its `$last` label is only the fallback for brands removed from Settings.
- No bugs found. Quiet run (1 in a row).
