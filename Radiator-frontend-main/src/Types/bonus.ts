export type ReviewSummary = {
    totalBills: number;
    totalOperations: number;
    totalRevenue: number;
    totalCollected: number;
    collectionRate: number;
    suggestedBonus: number;
};

export type ReviewData = {
    granularity: "daily" | "weekly" | "monthly";
    summary: ReviewSummary;
    byServiceType: Array<{ type: string; count: number; revenue: number }>;
    byProductType: Array<{ product: string; count: number; revenue: number }>;
    timeline: Array<{ date: string; count: number; revenue: number }>;
    bills: Array<{
        billDate: string;
        truckNumber: string;
        services: Array<{ type: string; price: number; comments?: string }>;
        totalAmount: number;
        receivedAmount: number;
    }>;
};
