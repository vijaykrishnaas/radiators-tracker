// Default application settings — seeded into the `settings` collection on first boot.
// Company identity / contact / workers start blank so each new client is white-label;
// the radiator-domain catalog, prices, and labels ship as an editable starting template.
// Every client fills these in via the Settings page (PUT /settings). Nothing here should
// be referenced directly by
// business logic — always read through settings.dao.js.

export const defaultSettings = {
  // `_id` is assigned per-client (the clientId) by settings.dao.js — not stored here.

  // Mirrors clients.businessType so the frontend learns the tenant's vertical
  // from GET /settings. Set at provisioning; super-admin-owned (updateSettings
  // strips it from client submissions). Missing ⇒ "radiator".
  businessType: "radiator",

  company: {
    name: "",
    address: "",
    phone1: "",
    phone2: "",
    upiId: "",
    upiDisplay: "",
    logoUrl: "",
    qrUrl: "",
    loginBgUrl: "",
    signatureUrl: "",
  },

  // Short rotating lines shown over the login background (client-editable).
  loginHighlights: [
    "Billing, expenses & bonuses in one place",
    "Every payment, tracked",
    "Your workshop, organized",
  ],

  // primaryColor drives the app theme (--primary) and PDF headers;
  // accentColor drives the login button and highlights (--accentColor).
  branding: {
    primaryColor: "#2264E5",
    accentColor: "#f47f6b",
    loginTextColor: "#FFFFFF",
  },

  catalog: {
    productTypes: [
      { label: "BS-II", value: "bs2" },
      { label: "BS-III", value: "bs3" },
      { label: "BS-IV", value: "bs4" },
      { label: "BS-VI", value: "bs6" },
    ],
    serviceTypes: [
      { label: "Service", value: "service" },
      { label: "New Radiator", value: "new" },
      { label: "Tank", value: "tank" },
      { label: "Cover", value: "cover" },
      { label: "Other", value: "other", requiresComment: true },
    ],
    priceMatrix: {
      bs2: { service: 1950, new: 9800, tank: 2500, cover: 800 },
      bs3: { service: 2100, new: 12000, tank: 2500, cover: 800 },
      bs4: { service: 2250, new: 13500, tank: 2500, cover: 800 },
      bs6: { service: 3000, new: 20000, tank: 2500, cover: 800 },
    },
  },

  labour: [],

  // Mechanic names — configured here and used as the source for the mechanic
  // dropdown in the bill form and all mechanic filters.
  mechanics: [],

  // Bonus configuration. Percentages of each service line's price.
  // mechanic: settled yearly (year window starts at yearStartMonth, 4 = April).
  // labour: settled daily, the bill's bonus is split equally among its workers.
  bonus: {
    mechanic: {
      matrix: {
        bs2: { service: 0, new: 0, tank: 0, cover: 0 },
        bs3: { service: 0, new: 0, tank: 0, cover: 0 },
        bs4: { service: 0, new: 0, tank: 0, cover: 0 },
        bs6: { service: 0, new: 0, tank: 0, cover: 0 },
      },
      defaultPercent: 0,
      yearStartMonth: 4,
    },
    labour: {
      matrix: {
        bs2: { service: 0, new: 0, tank: 0, cover: 0 },
        bs3: { service: 0, new: 0, tank: 0, cover: 0 },
        bs4: { service: 0, new: 0, tank: 0, cover: 0 },
        bs6: { service: 0, new: 0, tank: 0, cover: 0 },
      },
      defaultPercent: 0,
    },
  },

  // Automobile-vertical configuration. Only read when businessType is
  // "automobile"; radiator tenants never touch this block.
  automobile: {
    units: ["pcs", "set", "L", "kg", "hrs"],
    // Parts catalog: picking a part in the bill form auto-fills unit + rate.
    // [{ label: "Engine Oil 15W40", value: "engine-oil-15w40", unit: "L", rate: 450 }]
    parts: [],
    // Flat percentage of each bill's net (post-discount) total.
    bonus: { mechanicPercent: 0, labourPercent: 0, yearStartMonth: 4 },
    labels: {
      vehicleNo: "Vehicle Number",
      customer: "Customer Name",
      agent: "Mechanic",
      worker: "Labour",
    },
    invoice: {
      billTitle: "CASH / CREDIT BILL",
      footerNote: "Thank you for your business",
      showQr: false,
      showSignature: false,
    },
  },

  // Salary Management configuration. Applies to every tenant regardless of
  // businessType — employee base salary/attendance are unrelated to billing.
  salary: {
    payCycle: "monthly",
    // "allDays": workingDays = every calendar day in the period.
    // "excludeWeeklyOff": workingDays excludes weeklyOffDay (0=Sun..6=Sat).
    workingDayRule: "allDays",
    weeklyOffDay: 0,
    payslip: {
      title: "SALARY SLIP",
      footerNote: "",
    },
  },

  labels: {
    vehicleNo: "Truck Number",
    party: "Lorry Address",
    agent: "Mechanic Name",
    product: "Radiator Model",
    worker: "Labour Name",
  },

  invoice: {
    billTitle: "CASH / CREDIT BILL",
    footerNote: "Thank you for your business",
    showQr: false,
    showSignature: false,
  },
};
