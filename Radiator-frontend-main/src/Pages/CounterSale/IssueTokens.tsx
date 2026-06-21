import React from "react";
import IssueTokenCard from "./Components/IssueTokenCard";
import FootItem1 from "../../Assets/images/saleCounterImages/dose.jpg";
import FootItem2 from "../../Assets/images/saleCounterImages/snacks.jpg";
import FootItem3 from "../../Assets/images/saleCounterImages/briyani.jpg";
import { IssueToken } from "./Types/Index";
import Icons from "../../Components/Icons";
import Search from "../../Components/Search";


const IssueTokens = () => {

    const issueTokens: IssueToken[] = [
        {
            id: "t1",
            billNo: "123",
            status: "Pending",
            items: [
                { id: "1", name: "Kara Paniyaram", quantity: 2, image: FootItem2 },
                { id: "2", name: "Biryani", quantity: 2, image: FootItem3 },
                { id: "3", name: "Dosa", quantity: 1, image: FootItem1 },
                { id: "4", name: "Idly", quantity: 4, image: FootItem2 },
                { id: "5", name: "Dosa", quantity: 1, image: FootItem3 },
            ],
        },
        {
            id: "t2",
            billNo: "124",
            status: "Pending",
            items: [
                { id: "1", name: "Poori", quantity: 2, image: FootItem1 },
                { id: "2", name: "Paani Poori", quantity: 1, image: FootItem2 },
                { id: "3", name: "Biryani", quantity: 4, image: FootItem3 },
                { id: "4", name: "Biryani", quantity: 2, image: FootItem1 },
                { id: "5", name: "Biryani", quantity: 3, image: FootItem2 },
                { id: "6", name: "Biryani", quantity: 1, image: FootItem1 },
                { id: "7", name: "Biryani", quantity: 4, image: FootItem3 },
                { id: "9", name: "Biryani", quantity: 2, image: FootItem1 },
                { id: "10", name: "Biryani", quantity: 3, image: FootItem2 },
                { id: "11", name: "Biryani", quantity: 1, image: FootItem1 },
                { id: "12", name: "Biryani", quantity: 4, image: FootItem3 },
                { id: "13", name: "Biryani", quantity: 2, image: FootItem1 },
                { id: "14", name: "Biryani", quantity: 3, image: FootItem2 },
                { id: "15", name: "Biryani", quantity: 1, image: FootItem1 },
            ],
        },
        {
            id: "t3",
            billNo: "125",
            status: "Issued",
            items: [
                { id: "1", name: "Biryani", quantity: 1, image: FootItem1 },
                { id: "2", name: "Biryani", quantity: 1, image: FootItem2 },
                { id: "3", name: "Biryani", quantity: 1, image: FootItem3 },
                { id: "4", name: "Biryani", quantity: 1, image: FootItem1 },
            ],
        },
        {
            id: "t4",
            billNo: "126",
            status: "Pending",
            items: [
                { id: "1", name: "Biryani", quantity: 1, image: FootItem1 },
                { id: "2", name: "Biryani", quantity: 1, image: FootItem2 },
                { id: "3", name: "Biryani", quantity: 1, image: FootItem3 },
                { id: "4", name: "Biryani", quantity: 1, image: FootItem1 },
            ],
        },
    ];

    const [modal, setModal] = React.useState(false);
    const [selectedToken, setSelectedToken] = React.useState<IssueToken | null>(null);
    const [issuedItems, setIssuedItems] = React.useState<Record<string, boolean>>({});


    const handleOpenModal = (token: IssueToken) => {
        setSelectedToken(token);
        setModal(true);
    };

    const handleCloseModal = () => {
        setModal(false);
        setSelectedToken(null);
    };

    const handleGetData = () => {
        // Add your search logic here
    };

    const handleIssueItem = (itemId: string) => {
        setIssuedItems((prev) => ({
            ...prev,
            [itemId]: true,
        }));
    };

    const issueAll = () => {
        if (!selectedToken) return;

        const allIssuedItems = Object.fromEntries(
            selectedToken.items.map((item) => [item.id, true])
        );

        setIssuedItems(allIssuedItems);
    };

    return (
        <div className="px-3">
            <div className="row justify-content-center mt-5">
                {issueTokens.map((token) => (
                    <IssueTokenCard key={token.id} token={token} onOpenModal={handleOpenModal} issueAll={issueAll} />
                ))}
            </div>
            {/* Modal */}
            {modal && selectedToken && (
                <>
                    <div className="modal token-modal fade show" id="largeModal" data-bs-backdrop="static" data-bs-keyboard="false"
                        tabIndex={-1} aria-labelledby="largeModal" aria-hidden="true" style={{ display: "block" }}>
                        <div className="modal-dialog modal-xl">
                            <div className="modal-content">
                                <div className="modal-header">
                                    <div className="d-lg-flex d-md-block justify-content-between align-items-center w-100">
                                        <div className="d-lg-flex d-md-block align-items-center">
                                            <div className="mb-lg-0 mb-md-3 mb-3">
                                                <span className="pe-2">Bill #{selectedToken.billNo}</span>
                                                <span className="token-bill-item">
                                                    <Icons
                                                        iconName="Canteen_maintenance"
                                                        className="icon-16 icon-muster-yellow me-2"
                                                    />
                                                    Item {selectedToken.items.length}
                                                </span>
                                            </div>
                                            <div className="ms-md-0 ms-lg-4 mb-3 mb-lg-0 mb-md-3">
                                                <Search placeholder="Search items..." getData={handleGetData} />
                                            </div>
                                        </div>
                                        <div>
                                            <button className="btn btn-secondary me-2">
                                                <Icons iconName="Community_details_bold" className="icon-18 me-2" />
                                                <span className='align-middle'>Queue : 6</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="token-modal-close icon-bg cursor-pointer" onClick={handleCloseModal}>
                                        <Icons iconName="model_close" className="icon-gray" />
                                    </div>
                                </div>
                                <div className="modal-body modal-body-scroll">
                                    <div className="row token-modal-card-sec">
                                        {selectedToken.items.map((item) => {
                                            const isIssued = issuedItems[item.id];
                                            return (
                                                <div className="col-md-12 col-lg-6 col-xl-4 mb-4" key={item.id}>
                                                    <div className={`card food-card ${isIssued ? "issued" : ""}`}>

                                                        {/* Image wrapper */}
                                                        <div className="position-relative">
                                                            <img src={item.image} alt={item.name} className="card-img-top" />
                                                            {isIssued && (
                                                                <div className="tick-overlay">
                                                                    <span className="tick-circle">✓</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="card-body">
                                                            <div className="d-flex align-items-center justify-content-between mb-2">
                                                                <div className="d-flex align-items-center">
                                                                    <div className="status-box">
                                                                        <span className="status-dot-green"></span>
                                                                    </div>
                                                                    <div className="ms-2">{item.name}</div>
                                                                </div>
                                                                <span className={`status-badge ${isIssued ? "status-badge-success" : "status-badge-warning"}`}>
                                                                    {isIssued ? "Issued" : "Pending"}
                                                                </span>
                                                            </div>

                                                            <button className={`btn w-100 ${isIssued ? "btn-gray" : "btn-issue"}`} disabled={isIssued}
                                                                onClick={() => handleIssueItem(item.id)}>
                                                                {isIssued ? "Issued" : "Issue"}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-cancel me-2" onClick={handleCloseModal}> Cancel</button>
                                    <button type="button" className="btn btn-token-issue" onClick={issueAll}>Issue all Items</button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="modal-backdrop fade show"></div>
                </>
            )}
        </div>
    );
};

export default IssueTokens;
