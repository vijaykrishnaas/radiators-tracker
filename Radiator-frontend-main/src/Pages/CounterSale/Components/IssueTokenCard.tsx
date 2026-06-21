import Icons from "../../../Components/Icons";
import FoodItemList from "./FoodItemList";
import { IssueToken, FoodItem } from "../Types/Index";

interface IssueTokenCardProps {
    token: IssueToken;
    onOpenModal: (token: IssueToken) => void;
    issueAll: () => void;
}

const IssueTokenCard: React.FC<IssueTokenCardProps> = ({ token, onOpenModal, issueAll }) => {
    console.log('token', token)

    const handleIssueItem = (item: FoodItem) => {
        console.log("Issued item:", item);
    };

    const handleIssueAll = () => {
        console.log("Issue all items for bill:", token.billNo);
    };

    return (
        <div className="col-md-12 col-lg-6 col-xl-4 issue-token-card-sec">
            <div className="card issue-token-card" onClick={() => onOpenModal(token)}>
                <div className="card-header d-flex justify-content-between align-items-center">
                    <div>
                        <span className="pe-2">Bill #{token.billNo}</span>
                        <span className="token-bill-item">
                            <Icons
                                iconName="Canteen_maintenance"
                                className="icon-16 icon-muster-yellow me-2"
                            />
                            Item {token.items.length}
                        </span>
                    </div>

                    <span
                        className={`status-badge ${token.status === "Pending"
                            ? "status-badge-warning"
                            : "status-badge-success"
                            }`}
                    >
                        {token.status}
                    </span>
                </div>

                <div className="card-body">
                    <div className="ordered-items-sec">
                        {token.items.map((item) => (
                            <FoodItemList
                                key={item.id}
                                item={item}
                                onIssue={handleIssueItem}
                            />
                        ))}
                    </div>
                </div>


                <div className="card-footer" onClick={(e) => e.stopPropagation()}>
                    <button
                        className="btn btn-token-issue w-100"
                        onClick={issueAll}
                    >
                        Issue all Items
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IssueTokenCard;
