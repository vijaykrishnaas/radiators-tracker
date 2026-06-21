export interface FoodItem {
    id: string;
    name: string;
    quantity: number;
    image: string;
}

export interface IssueToken {
    id: string;
    billNo: string;
    status: "Pending" | "Issued";
    items: FoodItem[];
}
