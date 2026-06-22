// Default application settings — seeded into the `settings` collection on first boot.
// These ship with Sri Velavan Radiators values; every deployment edits them via the
// Settings page (PUT /settings). Nothing here should be referenced directly by
// business logic — always read through settings.dao.js.

export const defaultSettings = {
  // `_id` is assigned per-client (the clientId) by settings.dao.js — not stored here.

  company: {
    name: "SRI VELAVAN RADIATORS",
    address: "MRL Complex, Vellivila Kattidam Opp, Salem Main Road, Sankagiri - 637 301",
    phone1: "97906 63151",
    phone2: "88700 43151",
    upiId: "",
    upiDisplay: "PhonePe 77080 93151",
    logoUrl: "",
    qrUrl: "",
    loginBgUrl: "",
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

  labour: ["Dinesh", "Naveen", "Sasi"],

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
    billNoPrefix: "",
    showQr: false,
  },
};
