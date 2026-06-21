import { ReactNode } from "react";

export type CartAction =
    | { type: "ADD_ITEM"; payload: FoodItem }
    | { type: "INCREASE_QTY"; payload: number }
    | { type: "DECREASE_QTY"; payload: number }
    | { type: "REMOVE_ITEM"; payload: number }
    | { type: "CLEAR_CART" };

export interface FoodItem {
    id: number;
    name: string;
    category: string;
    price: number;
    image: ReactNode;
    qty?: number;
}
export interface CartItem extends FoodItem {
    qty: number;
}

export interface BillModalProps {
    cart: CartItem[];
    onClose: () => void;
    onSuccess: () => void;
}

export interface FoodCardProps {
    item: FoodItem;
    cart: CartItem[];
    dispatch: React.Dispatch<CartAction>;
}

export interface CartPanelProps {
    cart: CartItem[];
    dispatch: React.Dispatch<any>;
    setShowModal: (value: boolean) => void;
}

export interface CategoryTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
}

export interface FoodGridProps {
    foodList: FoodItem[];
    onAdd?: (item: FoodItem) => void;
}

export type loginModalType = "bill" | "success" | null;