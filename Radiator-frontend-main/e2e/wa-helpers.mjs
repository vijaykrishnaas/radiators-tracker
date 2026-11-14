// Shared by the tyre / automobile suites: records every /whatsapp/* request (with its raw body) and answers it.
// Register it AFTER the page's catch-all route (Playwright tries the latest route first).
export async function mockWhatsApp(page, { reply } = {}) {
  const wa = [];
  await page.route("http://localhost:5000/whatsapp/**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const buf = req.postDataBuffer();
    const entry = { method: req.method(), path: u.pathname, query: Object.fromEntries(u.searchParams), pdf: !!buf && buf.includes("%PDF"), type: req.headers()["content-type"] || "" };
    wa.push(entry);
    const r = reply?.(entry);
    await route.fulfill({ status: r?.status || 200, contentType: "application/json", body: JSON.stringify(r?.body || { success: true, message: "Sent", whatsapp: { status: "sent", at: new Date().toISOString() } }) });
  });
  return wa;
}

/** Waits (up to ~5 s) until `fn()` is truthy. */
export async function until(page, fn) {
  for (let i = 0; i < 50 && !fn(); i++) await page.waitForTimeout(100);
  return fn();
}
