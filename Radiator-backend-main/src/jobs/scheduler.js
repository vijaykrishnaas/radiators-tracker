import { getSettings } from "../dao/settings.dao.js";
import { dueRetries, staleAwaitingPdf, listEnabledAccounts, saveAccount } from "../dao/whatsapp.dao.js";
import { retryMessage, fallbackReceiptToText, sendOwnerSummary, istYmd } from "../services/whatsapp/notify.js";

// One-minute tick (single API instance assumed): retries due messages, turns receipts that never got a PDF into
// text receipts, and sends each company's owner summary at its time in IST.
const TICK_MS = 60_000;
const PDF_WAIT_MS = 2 * 60_000;
const IST_MS = 5.5 * 3600 * 1000;

const guard = (what) => (e) => console.error(`WhatsApp scheduler (${what}):`, e?.message || e);

export async function tick(now = new Date()) {
  for (const m of await dueRetries(now)) await retryMessage(m).catch(guard("retry"));
  for (const m of await staleAwaitingPdf(new Date(now.getTime() - PDF_WAIT_MS))) await fallbackReceiptToText(m).catch(guard("receipt fallback"));

  const ymd = istYmd(now);
  const hhmm = new Date(now.getTime() + IST_MS).toISOString().slice(11, 16);
  for (const account of await listEnabledAccounts()) {
    try {
      if (account.lastSummaryDate === ymd) continue;
      const wa = (await getSettings(account.clientId))?.whatsapp || {};
      if (!wa.ownerSummary || hhmm < (wa.summaryTime || "20:00")) continue;
      // Marked first, so a crash or restart can never send the same day's summary twice.
      await saveAccount(account.clientId, { lastSummaryDate: ymd });
      await sendOwnerSummary(account.clientId, ymd);
    } catch (e) {
      guard("summary")(e);
    }
  }
}

let timer = null;
let running = false;

export function startScheduler() {
  if (timer) return timer;
  timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(); } catch (e) { guard("tick")(e); } finally { running = false; }
  }, TICK_MS);
  timer.unref();
  return timer;
}
