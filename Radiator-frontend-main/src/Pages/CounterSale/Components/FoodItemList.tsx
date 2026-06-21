import React from "react";
import { FoodItem } from "../Types/Index";

interface FoodItemListProps {
    item: FoodItem;
    onIssue?: (item: FoodItem) => void;
}

const FoodItemList: React.FC<FoodItemListProps> = ({ item, onIssue }) => {
    return (
        <div className="food-item-sec" >
            <div className="d-flex align-items-center">
                <img className="item-image" src={item.image} alt={item.name} />

                <div className="d-inline-block">
                    <div className="food-name">{item.name}</div>
                    <div className="food-quantity">X {item.quantity}</div>
                </div>
            </div>

            <div>
                <button
                    className="btn btn-issue px-4 py-1"
                    onClick={(e) => {
                        e.stopPropagation();
                        onIssue?.(item);
                    }}>
                    Issue
                </button>
            </div>
        </div>
    );
};

export default FoodItemList;

