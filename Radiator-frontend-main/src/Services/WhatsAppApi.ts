// WhatsApp Business endpoints (tenant side). The PDF is built in the browser and posted as multipart/form-data.
import { api, getData } from "./ApiServices";
import type { AxiosError } from "axios";

export type WaVertical = "radiator" | "automobile" | "engineering" | "tyre";
export type WaStatus = "pending" | "awaiting_pdf" | "sent" | "delivered" | "read" | "failed";

/** The last-send summary kept on each bill by the backend. */
export type WaSummary = { status: WaStatus; at?: string; error?: string; kind?: string };

export type WaMessage = { _id: string; kind: string; to: string; status: WaStatus; error?: string; at: string; statusAt?: string };

const pdfForm = (pdf: Blob, name: string) => {
    const fd = new FormData();
    fd.append("pdf", pdf, name);
    return fd;
};

// Errors keep the server's reason ({ message }) so the caller can toast it.
const post = async (url: string, fd: FormData) => {
    try {
        // Axios sets the multipart boundary itself when it is given a FormData.
        return (await api.post(url, fd)).data;
    } catch (e) {
        const err = e as AxiosError<{ message?: string }>;
        throw { message: err.response?.data?.message || err.message || "Could not reach WhatsApp" };
    }
};

export const sendBillOnWhatsApp = (vertical: WaVertical, id: string, pdf: Blob, updated?: boolean): Promise<{ success: boolean; message?: string; whatsapp?: WaSummary }> =>
    post(`whatsapp/send/bill/${vertical}/${id}${updated ? "?updated=1" : ""}`, pdfForm(pdf, `${vertical}-${id}.pdf`));

export const sendReceiptPdf = (receiptId: string, pdf: Blob): Promise<{ success: boolean; message?: string }> =>
    post(`whatsapp/receipts/${receiptId}/pdf`, pdfForm(pdf, `receipt-${receiptId}.pdf`));

export const getWhatsAppMessages = async (refId: string): Promise<WaMessage[]> =>
    (await getData("whatsapp/messages", { params: { refId } })).messages || [];
