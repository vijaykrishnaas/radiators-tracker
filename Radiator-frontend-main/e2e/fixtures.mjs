// Shared mock API for browser checks and screenshots. Realistic data for every endpoint the
// frontend calls, per vertical, so screens render without a backend or database.
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { defaultSettings } = await import(pathToFileURL(join(here, "../../Radiator-backend-main/src/config/defaultSettings.js")).href);

export function settingsFor(type, overrides = {}) {
  const s = structuredClone(defaultSettings);
  s.businessType = type;
  s.company.name = overrides.companyName ?? "Sri Velavan Radiators";
  s.company.address = "12, Trichy Road, Coimbatore";
  s.company.phone1 = "98430 12345";
  s.mechanics = ["Ramesh", "Suresh Kumar", "Murugan"];
  s.labour = ["Kannan", "Selvam"];
  s.loginHighlights = ["Every payment, tracked"];
  if (s.automobile) {
    s.automobile.parts = [{ label: "Engine Oil 15W40", value: "engine-oil-15w40", unit: "L", rate: 450 }, { label: "Oil Filter", value: "oil-filter", unit: "pcs", rate: 320 }];
  }
  if (overrides.primary) s.branding.primaryColor = overrides.primary;
  if (overrides.accent) s.branding.accentColor = overrides.accent;
  const turbo = s.engineering?.serviceTypes?.find((t) => t.value === "turbo");
  if (turbo) {
    turbo.items.find((i) => i.value === "hold-set").prices.bs3 = 500;
    turbo.items.find((i) => i.value === "o-ring-kit-change").prices.bs3 = 2000;
  }
  if (s.engineering) s.engineering.quickAdd = [{ type: "compressor", item: "piston" }, { type: "turbo", item: "hold-set" }];
  return s;
}

const d = (n) => new Date(Date.UTC(2026, 8, 30 - n)).toISOString();
const statusOf = (net, rec) => (rec >= net ? "Received" : rec > 0 ? "Partial" : "Not Received");

export const radiatorBills = Array.from({ length: 10 }, (_, i) => {
  const total = [2250, 4800, 12450, 1500, 32000, 6800, 2250, 9100, 123456789, 3400][i];
  const rec = [1000, 4800, 8000, 0, 32000, 0, 2250, 4000, 50000000, 3400][i];
  return {
    _id: `r${i + 1}`, billDate: d(i), truckNumber: ["TN52R0001", "TN37AB1234", "KA01MX4521", "TN38C7788", "TN66Z0001", "TN52R0002", "TN09BB1200", "TN45Q9091", "TN99LONG1", "TN11P4040"][i],
    transportName: i === 2 ? "Sri Murugan Roadways & Logistics Pvt. Ltd, Salem" : ["Velu Transport", "KPN Travels", "ABT Parcel", "Arun Lorry Service"][i % 4],
    mechanicName: ["Ramesh", "Suresh Kumar", "Murugan"][i % 3], phoneNumber: i % 2 ? "9843012345" : "",
    radiatorType: ["BS-IV", "BS-VI", "BS-III"][i % 3], labourName: ["Kannan"],
    serviceInfo: i === 2 ? [{ type: "Service", price: 2250 }, { type: "Tank", price: 4200 }, { type: "Other", price: 6000, comments: "Core re-soldering and fan shroud repair" }] : [{ type: "Service", price: total }],
    status: statusOf(total, rec), totalAmount: total, discount: 0, receivedAmount: rec, pendingAmount: total - rec,
  };
});

export const autoBills = radiatorBills.map((b, i) => ({
  _id: `a${i + 1}`, billNo: 1201 + i, billDate: b.billDate, vehicleNumber: b.truckNumber, customerName: b.transportName,
  phoneNumber: b.phoneNumber, mechanicName: b.mechanicName, labourName: ["Kannan"],
  items: [{ particulars: "Engine Oil 15W40", partRef: "engine-oil-15w40", qty: 4, unit: "L", rate: 450, amount: 1800 }, { particulars: "Oil Filter", partRef: "oil-filter", qty: 1, unit: "pcs", rate: 320, amount: 320 }],
  notes: "", totalAmount: b.totalAmount, discount: 0, netAmount: b.totalAmount, receivedAmount: b.receivedAmount, pendingAmount: b.pendingAmount, status: b.status,
}));

export const engBills = radiatorBills.map((b, i) => ({
  _id: `e${i + 1}`, billNo: 802 + i, billDate: b.billDate, vehicleNo: i === 0 ? "TN52J2622" : b.truckNumber, lorryAddress: b.transportName, mechanic: b.mechanicName, phone: b.phoneNumber,
  services: [{ type: "turbo", typeLabel: "Turbo", bsModel: "bs3", items: [{ item: "hold-set", label: "Hold set", qty: 1, rate: 500, amount: 500 }, { item: "o-ring-kit-change", label: "O-ring kit change", qty: 1, rate: 2000, amount: 2000 }], subtotal: 2500 },
    ...(i % 2 ? [{ type: "compressor", typeLabel: "Air Compressor", bsModel: "bs3", items: [{ item: "piston", label: "Piston", qty: 2, rate: 900, amount: 1800 }], subtotal: 1800 }] : [])],
  typeTotals: { turbo: 2500 }, total: b.totalAmount, discount: 0, netTotal: b.totalAmount, amountReceived: b.receivedAmount, balance: b.pendingAmount, paymentMode: "cash", paymentStatus: b.status,
}));

const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep"];
const kpis = { totalBills: 248, totalRevenue: 1234567, totalCollected: 987654, totalPending: 246913, collectionRate: 80, avgBillValue: 4978.09 };
const byMonth = months.map((m, i) => ({ month: `${m} 2026`, revenue: 150000 + i * 32000, collected: 120000 + i * 28000, count: 30 + i }));
const byStatus = [{ status: "Received", count: 180, revenue: 900000 }, { status: "Partial", count: 40, revenue: 250000 }, { status: "Not Received", count: 28, revenue: 84567 }];
const topMechanics = [{ mechanic: "Ramesh", count: 90, revenue: 520000 }, { mechanic: "Suresh Kumar", count: 80, revenue: 410000 }, { mechanic: "Murugan", count: 78, revenue: 304567 }];

export const fixtures = {
  radiatorAnalytics: {
    kpis, byMonth, byStatus, topMechanics,
    byServiceType: [{ type: "Service", count: 140, revenue: 600000 }, { type: "New Radiator", count: 30, revenue: 400000 }, { type: "Tank", count: 50, revenue: 150000 }, { type: "Cover", count: 20, revenue: 50000 }, { type: "Other", count: 8, revenue: 34567 }],
    byProductType: [{ product: "BS-IV", count: 100, revenue: 500000 }, { product: "BS-VI", count: 90, revenue: 450000 }, { product: "BS-III", count: 58, revenue: 284567 }],
  },
  autoAnalytics: { kpis, byMonth, byStatus, topMechanics },
  engAnalytics: {
    kpis: { totalBills: 124, totalBilled: 1234567.5, totalReceived: 987654, totalOutstanding: 246913.5 },
    byMonth: months.map((m, i) => ({ month: `${m} 2026`, billed: 150000 + i * 32000, received: 120000 + i * 28000, count: 20 + i })),
    byServiceType: [{ type: "turbo", label: "Turbo", amount: 800000, count: 80 }, { type: "compressor", label: "Air Compressor", amount: 400000, count: 40 }, { type: "other", label: "Other", amount: 34567, count: 4 }],
    byMechanic: topMechanics.map((m) => ({ mechanic: m.mechanic, billed: m.revenue, count: m.count })),
  },
  expenseAnalytics: {
    totalExpenses: 184500, payrollTotal: 96000,
    byType: [{ type: "materials", count: 30, amount: 124500 }, { type: "others", count: 12, amount: 60000 }],
    byMonth: months.map((m, i) => ({ month: `${m} 2026`, count: 6 + i, amount: 22000 + i * 4000 })),
  },
  expenses: [
    { _id: "x1", expenseType: "materials", date: d(1), products: [{ name: "Copper tube 12mm", quantity: 10, unitPrice: 420, amount: 4200 }, { name: "Solder wire", quantity: 4, unitPrice: 350, amount: 1400 }], amount: 5600 },
    { _id: "x2", expenseType: "others", date: d(2), reason: "Electricity bill — September", amount: 8450 },
    { _id: "x3", expenseType: "others", date: d(4), reason: "Tea and snacks for staff", amount: 640 },
  ],
  bonusRows: [
    { beneficiary: "Ramesh", operations: 12, totalBusiness: 84500, totalCollected: 70200, accruedBonus: 4225, payableBonus: 3510, paidBonus: 0, status: "Pending",
      records: [{ billDate: d(1), billAmount: 12450, receivedAmount: 8000, accruedAmount: 622.5, payableAmount: 400, status: "pending" }, { billDate: d(3), billAmount: 32000, receivedAmount: 32000, accruedAmount: 1600, payableAmount: 1600, status: "pending" }] },
    { beneficiary: "Suresh Kumar", operations: 9, totalBusiness: 61200, totalCollected: 61200, accruedBonus: 3060, payableBonus: 3060, paidBonus: 0, status: "Pending", records: [] },
    { beneficiary: "Murugan", operations: 7, totalBusiness: 40500, totalCollected: 40500, accruedBonus: 2025, payableBonus: 0, paidBonus: 2025, status: "Paid", records: [] },
  ],
  review: {
    granularity: "weekly",
    summary: { totalBills: 42, totalOperations: 58, totalRevenue: 245000, totalCollected: 198000, collectionRate: 81, suggestedBonus: 12250 },
    byServiceType: [{ type: "Service", count: 30, revenue: 150000 }, { type: "Tank", count: 18, revenue: 60000 }, { type: "Other", count: 10, revenue: 35000 }],
    byProductType: [{ product: "BS-IV", count: 20, revenue: 120000 }, { product: "BS-VI", count: 22, revenue: 125000 }],
    timeline: Array.from({ length: 8 }, (_, i) => ({ date: `W${i + 1}`, count: 5 + i, revenue: 20000 + i * 3500 })),
    bills: radiatorBills.slice(0, 4).map((b) => ({ billDate: b.billDate, truckNumber: b.truckNumber, services: b.serviceInfo, totalAmount: b.totalAmount, receivedAmount: b.receivedAmount })),
  },
  employees: [
    { _id: "m1", name: "Ramesh", role: "mechanic", phone: "9843012345", joinDate: d(400), baseSalary: 18000, active: true },
    { _id: "m2", name: "Kannan", role: "labour", phone: "", joinDate: d(200), baseSalary: 12000, active: true },
    { _id: "m3", name: "Old Staff", role: "other", phone: "", baseSalary: 9000, active: false },
  ],
  audit: [
    { action: "radiator.create", actorUserId: "admin", at: d(0), details: { truckNumber: "TN52R0001", total: 2250 } },
    { action: "engbill.payment", actorUserId: "admin", at: d(1), details: { billNo: 802, amount: 1500 } },
    { action: "salary.settle", actorUserId: "owner", at: d(2), details: { employee: "Ramesh", net: 17400 } },
    { action: "settings.update", actorUserId: "admin", at: d(3), details: {} },
  ],
  clients: [
    { _id: "c1", name: "Sri Velavan Radiators", code: "velavan", businessType: "radiator", status: "active", adminUserId: "admin", lastLoginAt: d(0), createdAt: d(300) },
    { _id: "c2", name: "KPN Auto Works", code: "kpn-auto", businessType: "automobile", status: "active", adminUserId: "owner", lastLoginAt: d(5), createdAt: d(100) },
    { _id: "c3", name: "Arun Engineering Works", code: "arun-eng", businessType: "engineering", status: "suspended", adminUserId: "arun", lastLoginAt: null, createdAt: d(20) },
  ],
};

/** Installs the mock API on a Playwright page. Returns a log of mutating calls. */
export async function mockApi(page, type, opts = {}) {
  const settings = opts.settings || settingsFor(type, opts);
  const calls = [];
  await page.route("http://localhost:5000/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const m = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (m !== "GET") calls.push({ m, p, body: req.postData() ? (() => { try { return req.postDataJSON(); } catch { return null; } })() : null });
    if (opts.fail && opts.fail.test(p)) return json({ message: "Server unavailable" }, 500);
    if (opts.empty && opts.empty.test(p)) {
      return json({ success: true, radiatorData: [], autoBillData: [], bills: [], expenses: [], rows: [], entries: [], employees: [], clients: [], totalPages: 1, totalRecords: 0, total: 0, periodTotal: 0 });
    }
    if (p.startsWith("/public/clients/")) return json({ client: { name: settings.company.name, companyName: settings.company.name, branding: settings.branding, loginHighlights: settings.loginHighlights } });
    if (p === "/settings" && m === "GET") return json({ settings });
    if (p === "/mechanic" || p === "/auto-mechanic") return json({ success: true, mechdata: settings.mechanics });
    if (p === "/engbills/mechanics") return json({ mechanics: settings.mechanics });
    if (p === "/radiators/analytics") return json(fixtures.radiatorAnalytics);
    if (p === "/autobills/analytics") return json(fixtures.autoAnalytics);
    if (p === "/engbills/analytics") return json(fixtures.engAnalytics);
    if (p === "/expenses/analytics") return json(fixtures.expenseAnalytics);
    if (p === "/radiators" || p === "/radiators/export") return json({ success: true, currentPage: 1, totalPages: 25, totalRecords: 245, radiatorData: radiatorBills });
    if (/^\/radiators\/r\d+$/.test(p) && m === "GET") return json(radiatorBills.find((b) => b._id === p.split("/")[2]));
    if (p === "/autobills" || p === "/autobills/export") return json({ success: true, totalPages: 3, totalRecords: 24, autoBillData: autoBills });
    if (/^\/autobills\/a\d+$/.test(p) && m === "GET") return json(autoBills.find((b) => b._id === p.split("/")[2]));
    if (p === "/engbills" && m === "GET") return json({ bills: engBills, totalPages: 3, totalRecords: 24 });
    if (p === "/engbills/export") return json({ bills: engBills });
    if (p === "/engbills/lookup-vehicle") return json({ match: { lorryAddress: "Velu Transport", phone: "9843012345" } });
    if (/^\/engbills\/e\d+$/.test(p) && m === "GET") return json({ bill: engBills.find((b) => b._id === p.split("/")[2]) });
    if (p === "/expenses" && m === "GET") return json({ expenses: fixtures.expenses, totalRecords: 3, totalPages: 1, periodTotal: 14690 });
    if (p === "/expenses/export") return json({ expenses: fixtures.expenses });
    if (p === "/bonus/pending") return json({ rows: fixtures.bonusRows });
    if (p === "/bonus/review") return json(fixtures.review);
    if (p === "/employees" && m === "GET") return json({ employees: fixtures.employees });
    if (p === "/salary/attendance" && m === "GET") return json({ days: [{ _id: "d1", date: d(1), status: "present" }, { _id: "d2", date: d(2), status: "half" }, { _id: "d3", date: d(3), status: "absent" }, { _id: "d4", date: d(4), status: "leave" }] });
    if (p === "/salary/advances" && m === "GET") return json({ advances: [{ _id: "v1", date: d(6), amount: 2000, reason: "Festival advance", status: "unapplied" }] });
    if (p === "/salary/preview") return json({ employeeName: "Ramesh", workingDays: 30, presentDaysComputed: 26, presentDaysMode: "daily", presentDaysUsed: 26, baseSalary: 18000, grossAmount: 15600, advancesApplied: [], advancesDeducted: 2000, advancesCarriedForward: 0, netAmount: 13600 });
    if (p === "/salary/history") return json({ rows: [{ _id: "h1", employeeName: "Ramesh", periodStart: d(60), periodEnd: d(31), periodKey: "2026-08", netAmount: 17400, status: "paid", paidAt: d(30), adjustments: [{ at: d(20), type: "correction", amount: 500 }] }], total: 1, totalPages: 1, page: 1 });
    if (p === "/audit") return json({ entries: fixtures.audit, total: 4, totalPages: 1 });
    if (p === "/admin/clients" && m === "GET") return json({ clients: fixtures.clients });
    if (p === "/admin/audit") return json({ entries: fixtures.audit.map((e) => ({ ...e, clientCode: "velavan" })), total: 4, totalPages: 1 });
    if (/^\/admin\/clients\/c\d\/settings$/.test(p)) return json({ client: { id: "c1", name: "Sri Velavan Radiators", code: "velavan", status: "active", adminUserId: "admin", lastLoginAt: d(0), createdAt: d(300) }, settings });
    if (p === "/auth/login" || p === "/admin/login") return json({ token: "x", user: { userId: "admin", name: "Admin", role: p === "/admin/login" ? "superadmin" : "admin", code: "velavan" } });
    return json({ success: true, message: "Saved", data: [], mechdata: [], records: [] });
  });
  return calls;
}

export async function loginAs(page, base, role = "admin") {
  await page.goto(base + (role === "superadmin" ? "/admin/login" : "/issueCounter/login"));
  await page.evaluate((r) => {
    localStorage.setItem("svr_token", "x");
    localStorage.setItem("svr_user", JSON.stringify({ userId: r === "superadmin" ? "root" : "admin", name: r === "superadmin" ? "Platform Admin" : "Vijay Krishna", role: r, clientId: "c1", code: "velavan" }));
  }, role);
}
