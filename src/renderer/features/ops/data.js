// Legacy in-memory shape (not wired to SQLite). Kept minimal so no demo rows ship with the app.

const DB = {
  meta: {
    estateAcres: 0,
    currentSeason: "",
    selectedGrade: "",
    currency: "UGX",
    exchangeRate: 1,
    user: { name: "", role: "", initials: "" },
  },

  blocks: [],
  batches: [],

  finance: {
    seasons: [],
    current: {
      totalRevenue: 0,
      totalExpenses: 0,
      netProfit: 0,
      costPerKg: 0,
      sellingPricePerKg: 0,
      categories: [],
      lineItems: [],
      seasonal: [],
    },
  },

  exports: [],

  workforce: {
    totalWorkers: 0,
    permanent: 0,
    seasonal: 0,
    departments: [],
    payrollMtd: 0,
  },

  aiInsights: [],
};

DB.computed = {
  totalGreenBeanOutput: () => DB.blocks.reduce((s, b) => s + (b.kgProcessed || 0), 0),
  avgConversion: () => {
    const b = DB.batches.filter((x) => x.conversion != null);
    if (!b.length) return "0.0";
    return (b.reduce((s, x) => s + x.conversion, 0) / b.length).toFixed(1);
  },
  activeBatches: () => DB.batches.filter((x) => x.status === "Processing" || x.status === "Alert").length,
  alertBatches: () => DB.batches.filter((x) => x.status === "Alert").length,
  seasonHealthScore: () => {
    const conv = Number(DB.computed.avgConversion()) || 0;
    const alerts = DB.computed.alertBatches();
    const base = 55 + Math.min(30, (conv - 62) * 2) - alerts * 8;
    return Math.max(35, Math.min(98, Math.round(base)));
  },
};

export { DB };
