import { Router } from "express";
import { getAccountByPhoneNumberId, accountContext } from "../dao/whatsapp.dao.js";
import { getProvider } from "../services/whatsapp/providers/index.js";
import { applyStatuses, autoReply } from "../services/whatsapp/notify.js";
import { phoneNumberIds } from "../services/whatsapp/providers/meta.js";

// Public endpoints the provider calls. The body arrives raw (see index.js) so the signature can be checked.
const router = Router();

router.get("/whatsapp/:provider", (req, res) => {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (req.query["hub.mode"] === "subscribe" && expected && req.query["hub.verify_token"] === expected) {
    return res.status(200).send(String(req.query["hub.challenge"] ?? ""));
  }
  res.sendStatus(403);
});

router.post("/whatsapp/:provider", async (req, res, next) => {
  try {
    const provider = getProvider(req.params.provider);
    const raw = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody ?? "");
    let json;
    try { json = JSON.parse(raw.toString("utf8") || "{}"); } catch { return res.sendStatus(400); }

    // Which company this is for comes from the number it was sent to; unknown numbers are ignored.
    const [phoneNumberId] = phoneNumberIds(json);
    const account = await getAccountByPhoneNumberId(phoneNumberId);
    if (!account) return res.sendStatus(200);

    let ctx;
    try { ctx = accountContext(account); } catch { return res.sendStatus(200); }
    if (!provider.verifyWebhook(ctx, raw, req.get("X-Hub-Signature-256"))) return res.sendStatus(401);

    const { statuses, inbound } = provider.parseWebhook(json);
    await applyStatuses(statuses);
    res.sendStatus(200);
    // Replies go out after the provider has its answer.
    for (const from of new Set(inbound.map((i) => i.from))) {
      autoReply(account, from).catch((e) => console.error("WhatsApp auto-reply failed:", e.message));
    }
  } catch (error) {
    next(error);
  }
});

export default router;
