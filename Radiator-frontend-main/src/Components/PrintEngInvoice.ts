import type { AppSettings } from "../Context/SettingsContext";
import { printAutoInvoice } from "./PrintInvoice";
import type { EngBill } from "../Pages/Engineering/types";
import { bsLabel, itemText } from "../Pages/Engineering/types";

// Reuses the existing invoice layout (printAutoInvoice) by mapping an
// engineering bill onto its shape, so PrintInvoice.ts stays untouched.
export const printEngInvoice = async (bill: EngBill, settings: AppSettings) => {
    const eng = settings.engineering;
    const mappedSettings: AppSettings = {
        ...settings,
        automobile: {
            ...settings.automobile,
            invoice: eng?.invoice || settings.automobile.invoice,
            labels: { vehicleNo: "Truck No", customer: "Lorry Address", agent: "Mechanic", worker: "" },
        },
    };

    const items = (bill.services || []).flatMap((s) =>
        (s.items || []).map((i) => ({
            particulars: `${itemText(i)} (${[s.typeLabel || s.type, bsLabel(settings, s.bsModel)].filter(Boolean).join(" · ")})`,
            qty: i.qty,
            unit: "",
            rate: i.rate,
            amount: i.amount,
        }))
    );

    await printAutoInvoice(
        {
            billNo: bill.billNo,
            billDate: bill.billDate,
            vehicleNumber: bill.vehicleNo,
            customerName: bill.lorryAddress,
            phoneNumber: bill.phone,
            mechanicName: bill.mechanic,
            items,
            totalAmount: bill.total,
            discount: bill.discount,
            netAmount: bill.netTotal,
            receivedAmount: bill.amountReceived,
        },
        mappedSettings
    );
};
