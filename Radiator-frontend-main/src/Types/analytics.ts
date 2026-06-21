export type AnalyticsKpis = {
    totalBills: number;
    totalRevenue: number;
    totalCollected: number;
    totalPending: number;
    collectionRate: number;
    avgBillValue: number;
};

export type BillingAnalytics = {
    kpis: AnalyticsKpis;
    byMonth: Array<{ month: string; revenue: number; collected: number; count: number }>;
    byServiceType: Array<{ type: string; count: number; revenue: number }>;
    byProductType: Array<{ product: string; count: number; revenue: number }>;
    byStatus: Array<{ status: string; count: number; revenue: number }>;
    topMechanics: Array<{ mechanic: string; count: number; revenue: number }>;
};

export type ExpenseAnalytics = {
    totalExpenses: number;
    byType: Array<{ type: string; count: number; amount: number }>;
    byMonth: Array<{ month: string; count: number; amount: number }>;
};
