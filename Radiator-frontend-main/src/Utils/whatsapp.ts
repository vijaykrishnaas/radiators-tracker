// Sending a bill / challan / receipt PDF on WhatsApp from the browser. The PDF is built with the same print
// function and arguments as the list pages' Print action, then posted; the server does the rest.
import { useCallback, useState } from "react";
import { getData } from "../Services/ApiServices";
import { toast } from "../Components/ui/Toast";
import { useAlertMsg } from "../Services/AllServices";
import { useSettings, type AppSettings } from "../Context/SettingsContext";
import { printInvoice, printAutoInvoice } from "../Components/PrintInvoice";
import { printEngInvoice } from "../Components/PrintEngInvoice";
import { printTyreChallan } from "../Components/PrintTyreChallan";
import type { WaSummary } from "../Services/WhatsAppApi";
import { sendBillOnWhatsApp, sendReceiptPdf as postReceiptPdf, type WaVertical } from "../Services/WhatsAppApi";

/** A 10-digit Indian mobile, with an optional +91 / 91 / 0 prefix (mirrors phoneDigits in the tyre form and the server's toWaNumber). */
export const waPhoneOk = (phone?: string | null): boolean => {
    let d = String(phone ?? "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    // A 10-digit Indian mobile starts with 6-9: the same rule the server applies (utils/waPhone.js), so the tick
    // is never offered for a number the server would refuse.
    return /^[6-9]\d{9}$/.test(d);
};

/** The phone on a saved bill (engineering bills call it `phone`, the others `phoneNumber`). */
export const billPhone = (b: any): string => String(b?.phoneNumber ?? b?.phone ?? "");

const GET_PATH: Record<WaVertical, string> = { radiator: "radiators", automobile: "autobills", engineering: "engbills", tyre: "tyrebills" };

/** Fetches one saved bill the way each view page does (engineering wraps it as { bill }). */
export const fetchBill = async (vertical: WaVertical, id: string): Promise<any> => {
    const res = await getData(`${GET_PATH[vertical]}/${id}`);
    return vertical === "engineering" ? res.bill : res;
};

/** Builds the PDF for a bill with the print function of its vertical. */
export const buildBillPdf = async (vertical: WaVertical, bill: any, settings: AppSettings): Promise<Blob> => {
    const opts = { output: "blob" as const };
    const pdf =
        vertical === "radiator" ? await printInvoice(bill, settings, opts)
        : vertical === "automobile" ? await printAutoInvoice(bill, settings, opts)
        : vertical === "engineering" ? await printEngInvoice(bill, settings, opts)
        : await printTyreChallan(bill, settings, opts);
    if (!pdf) throw new Error("Could not build the PDF");
    return pdf;
};

// Bills whose send is still on its way, shared by every screen, so a second click can't send the same bill twice.
const sending = new Set<string>();

export function useWhatsAppSend() {
    const { settings } = useSettings();
    const { callAlertMsg } = useAlertMsg();
    const enabled = !!settings.whatsappEnabled;

    /** Sends the bill PDF. Resolves true when the server accepted it; failures are toasted, never thrown. */
    const sendBill = useCallback(async (vertical: WaVertical, bill: any, opts: { updated?: boolean } = {}): Promise<boolean> => {
        if (!waPhoneOk(billPhone(bill))) { callAlertMsg("No valid phone on this bill", "error"); return false; }
        const key = `${vertical}:${bill._id}`;
        if (sending.has(key)) { callAlertMsg("This bill is already being sent", "info"); return false; }
        sending.add(key);
        try {
            const pdf = await buildBillPdf(vertical, bill, settings);
            const res = await sendBillOnWhatsApp(vertical, bill._id, pdf, opts.updated);
            if (res.success === false || res.whatsapp?.status === "failed") {
                callAlertMsg(res.whatsapp?.error || res.message || "WhatsApp message failed", "error");
                return false;
            }
            // "pending": WhatsApp didn't answer, and the server retries on its own.
            if (res.whatsapp?.status === "pending") callAlertMsg("WhatsApp is slow right now. The bill will be sent shortly.", "info");
            else callAlertMsg("Sent to WhatsApp", "success");
            return true;
        } catch (e: any) {
            callAlertMsg(e?.message || "Could not send on WhatsApp", "error");
            return false;
        } finally {
            sending.delete(key);
        }
    }, [settings, callAlertMsg]);

    /** Builds the (already updated) bill's PDF and attaches it to a pending receipt. */
    const sendReceiptPdf = useCallback(async (vertical: WaVertical, bill: any, receiptId: string): Promise<boolean> => {
        try {
            const res = await postReceiptPdf(receiptId, await buildBillPdf(vertical, bill, settings));
            if (res.success === false) { callAlertMsg(res.message || "Receipt not sent on WhatsApp", "error"); return false; }
            return true;
        } catch (e: any) {
            callAlertMsg(e?.message || "Receipt not sent on WhatsApp", "error");
            return false;
        }
    }, [settings, callAlertMsg]);

    /** After a payment: when the response carries a receipt id, fetch the updated bill and post its PDF in the background. */
    const sendReceiptAfterPayment = useCallback((vertical: WaVertical, billId: string, res: any) => {
        const receiptId = res?.whatsappReceiptId;
        if (!receiptId) return;
        void (async () => {
            try { await sendReceiptPdf(vertical, await fetchBill(vertical, billId), String(receiptId)); }
            catch (e: any) { callAlertMsg(e?.message || "Receipt not sent on WhatsApp", "error"); }
        })();
    }, [sendReceiptPdf, callAlertMsg]);

    return { enabled, sendBill, sendReceiptPdf, sendReceiptAfterPayment };
}

export const waDate = (s?: string) => (s ? new Date(s).toLocaleDateString("en-IN") : "");

/**
 * State of the "Send on WhatsApp" tick on a bill form. Default is the company setting for a new bill; a bill that has
 * already gone out starts unticked (ticking it sends the updated bill). `afterSave` posts the saved bill in the background.
 */
export function useWaTick({ isEdit, phone, saved }: { isEdit: boolean; phone: string; saved?: WaSummary | null }) {
    const { settings } = useSettings();
    const { enabled, sendBill } = useWhatsAppSend();
    const [choice, setChoice] = useState<boolean | null>(null);
    const alreadySent = isEdit && !!saved && ["sent", "delivered", "read"].includes(saved.status);
    const phoneOk = waPhoneOk(phone);
    const wanted = choice ?? (!alreadySent && !!settings.whatsapp?.billDefaultTick);
    const checked = enabled && phoneOk && wanted;
    const afterSave = (vertical: WaVertical, billId?: string) => {
        if (!checked || !billId) return;
        // Not awaited: the form navigates away, and the result arrives as a toast.
        void fetchBill(vertical, billId).then((b) => sendBill(vertical, b, { updated: alreadySent }))
            .catch((e) => toast.show("error", e?.message || "Could not send on WhatsApp"));
    };
    return { enabled, checked, setChecked: (v: boolean) => setChoice(v), phoneOk, sentAt: alreadySent ? saved?.at || "" : undefined, alreadySent, afterSave };
}
