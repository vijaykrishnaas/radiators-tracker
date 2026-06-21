import { FoodFormValues } from "../../../ItemMaster/Types/Index";

export type Order = {
    id: number;
    orderId: string;
    itemNames: string[];
    rollNo: string;
    orderedQty: number;
    status: string;
}
export type OrderHistoryListResponse = {
    status: "success" | "error";
    message?: string;
    data?: {
        orderList?: FoodFormValues[];
    };
}

export type FoodItem = {
    name: {
        english: string;
    };
    status: string;
};

export type OrderRecord = {
    userCode: string;
    orderNo: string;
    foodList: FoodItem[];
};