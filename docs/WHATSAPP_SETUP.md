# WhatsApp setup (official WhatsApp Business API)

Bills, delivery challans and payment receipts can be sent to customers on WhatsApp from the shop's own number, and the
owner can get a daily billing summary. It uses Meta's official WhatsApp Business (Cloud) API. Nothing is sent until the
super admin enables WhatsApp for a company and that company switches on the messages it wants.

## 1. One-time server setup (platform)
Add to the API's `.env` (see `deploy/.env.example`):

| Variable | What it is |
|---|---|
| `WHATSAPP_ENC_KEY` | 32-byte key that encrypts each shop's access token and app secret in the database. Generate with `openssl rand -hex 32`. Keep it safe: if it is lost, every shop's token must be entered again. |
| `WHATSAPP_VERIFY_TOKEN` | Any long random text. You type the same value into Meta when setting the webhook. |
| `WHATSAPP_GRAPH_VERSION` | Optional, defaults to `v21.0`. |

The webhook address is `https://<API_DOMAIN>/webhooks/whatsapp/meta` (the API must be reachable over HTTPS — it is, behind Caddy, per `DEPLOYMENT.md`).

## 2. Per shop: get a WhatsApp Business API number (in Meta)
Done once per shop, by the shop owner or by you on their behalf.

1. **Choose the number.**
   - *New dedicated number* (simplest): a SIM that is not on WhatsApp. The shop keeps using its usual WhatsApp as before.
   - *Existing number*: only through Meta's "coexistence" onboarding (keeps the WhatsApp Business app working on the phone).
     Without coexistence, moving a number to the API removes it from the phone app.
2. **Meta Business account**: business.facebook.com → create (or use) the shop's business. Business verification
   (documents) raises the daily sending limit; sending works before it at a lower limit.
3. **App**: developers.facebook.com → My Apps → Create app → type *Business* → add the **WhatsApp** product. This creates a
   WhatsApp Business Account (WABA). Under *WhatsApp › API Setup* add the shop's phone number and verify it by SMS/call.
4. **Permanent token**: Business settings → Users → *System users* → add a system user (Admin) → *Add assets*: the app and
   the WhatsApp account (full control) → *Generate token* for the app with permissions `whatsapp_business_messaging` and
   `whatsapp_business_management`, expiry *Never*. Copy it.
5. **Copy the IDs** from *WhatsApp › API Setup*: **Phone number ID** and **WhatsApp Business Account ID**. Copy the
   **App ID** and **App secret** from *App settings › Basic*.
6. **Webhook**: *WhatsApp › Configuration › Webhook* → Callback URL `https://<API_DOMAIN>/webhooks/whatsapp/meta`,
   Verify token = `WHATSAPP_VERIFY_TOKEN` → Verify and save → *Manage* → subscribe to **messages**.
7. **Payment method**: add one in the WhatsApp account (Meta charges per message; see Meta's current pricing for India).

## 3. Enable it for the company (super admin)
Admin › Clients › ⋮ › **WhatsApp**:
1. Turn on **Enable WhatsApp**, choose the provider and number type, and paste Phone number ID, WhatsApp Business Account
   ID, App ID, Access token and App secret. (App ID is optional for sending, but the bill and receipt-with-PDF templates
   can only be approved with it: the app uploads a sample PDF to Meta through it.)
2. Press **Enable**. The connection is tested live first; if Meta refuses (wrong ID or token), its message is shown and
   nothing is enabled.
3. Press **Create / sync templates**. Meta reviews each message template (usually minutes, sometimes up to a day). A message
   type sends only after its template shows **Approved**. Press it again later to refresh the statuses.
4. The dialog shows this month's message counts and failures. **Disable** stops all sending at once and keeps the details;
   **Remove details** deletes them.

The token and app secret are stored encrypted and are never shown again (only the last 4 characters).

## 4. Choose the messages (the company's admin)
Settings › **WhatsApp** (this tab appears only after the super admin enables WhatsApp):
- **Tick "Send on WhatsApp" by default** — the bill/challan form has a *Send on WhatsApp* tick next to Save; this sets its default.
- **Payment receipt** — every recorded payment sends "Received ₹X by <mode>, balance ₹Y" (tyre: also the installment and next due date).
  **Attach the updated bill PDF** adds the bill to the receipt.
- **Daily summary to owner** — one message at the chosen time (default 8:00 pm) with today's bills, billed, collected,
  pending and overdue. Not sent on days with no activity.
- **Send test message to owner** checks the whole setup.

Customer replies are answered automatically, once a day per customer: "This number only sends bills from <company>.
For any query please call <Company phone 1>."

## 5. Day to day
- The bill's view shows the WhatsApp status (Sent / Delivered / Read / Failed with the reason) and **Resend**.
- Bill lists have a **WhatsApp failed** filter. Network or Meta outages are retried automatically (after 30 s, 2 min and 10 min).
- A company can send at most 30 WhatsApp messages a minute from the app; beyond that it is asked to wait a minute.
- An edited bill that was already sent shows "Already sent on <date>"; tick *Send on WhatsApp* to send the updated bill.

## Troubleshooting
| Shown | Fix |
|---|---|
| "Template … is not approved yet" | Wait for Meta's review, then *Create / sync templates* to refresh. |
| "No valid WhatsApp number" | The bill's phone must be a 10-digit Indian mobile number. |
| Bill template shows "Add the App ID…" | Enter the App ID (step 2.5) in the WhatsApp dialog, save, then *Create / sync templates* again. |
| Enabling fails with an auth error | Token expired or missing permissions: generate a new permanent system-user token (step 2.4). |
| Old challans can't be sent ("No valid WhatsApp number") | Run `npm run check:tyre-phones` on the server for a list of challans whose phone needs correcting. |
| Statuses stay "Sent" | Webhook not set or not subscribed to *messages* (step 2.6). |
