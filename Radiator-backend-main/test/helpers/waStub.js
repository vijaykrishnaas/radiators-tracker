// Stands in for the Graph API: records every call to graph.facebook.com and answers like Meta does.
// Other URLs (a test's own local server) still go through the real fetch.
export function installGraphStub() {
  const realFetch = globalThis.fetch;
  const s = {
    calls: [],
    handler: null, // (call) => { status, body } | throws to emulate a network failure
    templates: [], // what GET message_templates returns
    n: 0,
    reset() { s.calls = []; s.handler = null; s.templates = []; s.n = 0; },
    // Calls that went to /messages (template or text), with the JSON body parsed.
    messages() { return s.calls.filter((c) => c.url.endsWith("/messages")); },
    uploads() { return s.calls.filter((c) => c.url.endsWith("/media")); },
    // Body parameter texts of a template call.
    params(call) { return call.body.template.components.find((c) => c.type === "body").parameters.map((p) => p.text); },
    restore() { globalThis.fetch = realFetch; },
  };
  const defaults = (call) => {
    const path = new URL(call.url).pathname.replace(/^\/v[\d.]+/, "");
    if (call.method === "GET" && /^\/\d+$/.test(path)) return { status: 200, body: { display_phone_number: "+91 90000 00001", verified_name: "Sri Murugan Tyres" } };
    if (call.method === "POST" && path.endsWith("/media")) return { status: 200, body: { id: "media-1" } };
    if (call.method === "POST" && path.endsWith("/messages")) return { status: 200, body: { messages: [{ id: `wamid.${++s.n}` }] } };
    if (call.method === "GET" && path.endsWith("/message_templates")) return { status: 200, body: { data: s.templates } };
    if (call.method === "POST" && path.endsWith("/message_templates")) {
      s.templates.push({ name: call.body.name, status: "PENDING" });
      return { status: 200, body: { id: "t1" } };
    }
    return { status: 404, body: { error: { message: "Unknown path" } } };
  };
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.startsWith("https://graph.facebook.com")) return realFetch(url, init);
    const call = { url: u, method: init.method || "GET", headers: init.headers || {}, body: typeof init.body === "string" ? JSON.parse(init.body) : init.body };
    s.calls.push(call);
    const r = s.handler ? await s.handler(call, defaults) : defaults(call);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  return s;
}
