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

    // Which company each part is for comes from the number it was sent to; unknown numbers are ignored. One delivery
    // can cover several numbers of the same Meta app, so each number is checked with its own company's app secret
    // and only changes that company's messages.
    const signature = req.get("X-Hub-Signature-256");
    const verified = [];
    let known = 0;
    for (const phoneNumberId of phoneNumberIds(json)) {
      const account = await getAccountByPhoneNumberId(phoneNumberId);
      if (!account) continue;
      known++;
      let ctx;
      try { ctx = accountContext(account); } catch { continue; }
      if (provider.verifyWebhook(ctx, raw, signature)) verified.push({ phoneNumberId, account });
    }
    if (!known) return res.sendStatus(200);
    if (!verified.length) return res.sendStatus(401);

    const { statuses, inbound } = provider.parseWebhook(json);
    for (const { phoneNumberId, account } of verified) {
      await applyStatuses(statuses.filter((s) => s.phoneNumberId === phoneNumberId), account.clientId);
    }
    res.sendStatus(200);
    // Replies go out after the provider has its answer.
    for (const { phoneNumberId, account } of verified) {
      for (const from of new Set(inbound.filter((i) => i.phoneNumberId === phoneNumberId).map((i) => i.from))) {
        autoReply(account, from).catch((e) => console.error("WhatsApp auto-reply failed:", e.message));
      }
    }
  } catch (error) {
    next(error);
  }
});

export default router;
