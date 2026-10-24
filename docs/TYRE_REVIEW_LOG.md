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
