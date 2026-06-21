import React, { useState } from 'react'
import Icons from '../../Components/Icons'
import CheckBox from '../../Components/CheckBox'
import IssueTokens from './IssueTokens';
import ConfirmOrderTick from '../../Assets/images/saleCounterImages/payment-confirm.svg';

const CounterSale = () => {

    type TokenType = "vegOnly" | "snacks" | "millet" | "juices";
    const [showOrderedItems, setShowOrderedItems] = useState<boolean>(false);
    const [orderConfirmModal, setOrderConfirmModal] = React.useState(false);

    const tokens = [
        { id: "1", label: "Veg Only", title: "Tea & Coffee" },
        { id: "2", label: "Snacks", title: "Snacks" },
        { id: "3", label: "Millet", title: "Millet" },
        { id: "4", label: "Juices", title: "Juices" },
    ];

    const [activeTokens, setActiveTokens] = useState<Record<TokenType, boolean>>({
        vegOnly: false,
        snacks: false,
        millet: false,
        juices: false,
    });

    const selectedTokensLength = Object.values(activeTokens).filter(Boolean).length;

    const handleToggle = (id: TokenType, checked: boolean) => {
        setActiveTokens((prev) => ({
            ...prev,
            [id]: checked,
        }));
    };

    const handleProceed = () => {
        setShowOrderedItems(true);
    };

    const handleOrderConfirmModalFn = () => {
        setOrderConfirmModal(true);
    }


    return (
        <div className='px-3'>
            <div className="counter-sale-header d-flex justify-content-between align-items-center">
                <div className='d-flex align-items-center'>
                    <div>
                        <div className='token-heading'>PSG ITech AB Canteen</div>
                        <span className='sub-heading-text'>Tuesday, 26 June, 2025</span>
                    </div>
                    {showOrderedItems && (
                        <div className='token-group-sec'>
                            <div className='text-secondary mb-2'>Token Group</div>
                            <div>
                                <span className='selected-items'>Tea & Coffee</span>
                                <span className='selected-items'>Drinks</span>
                                <span className='selected-items'>Snacks</span>
                                <a href='/#' className='edit-btn-white'>
                                    <Icons iconName="edit" className="icon-18 icon-success" />
                                </a>
                            </div>
                        </div>
                    )}
                </div>
                {showOrderedItems && (
                    <div className='queue-sec'>
                        <button className="btn btn-secondary me-2" onClick={handleOrderConfirmModalFn}>
                            <Icons iconName="Community_details_bold" className="icon-18 me-2" />
                            <span className='align-middle'>Queue : 6</span>
                        </button>
                        <button className="btn btn-secondary">
                            <Icons iconName="nest_clock_farsight_analog" className="icon-15 icon-danger me-2" />
                            <span className='align-middle'>9.00 AM</span>
                        </button>
                    </div>
                )}
            </div>

            {!showOrderedItems && (
                <>
                    <div className="row mt-5">
                        <div className="col">
                            <h5>Select Token Group {selectedTokensLength > 0 && `(${selectedTokensLength})`}</h5>
                        </div>
                    </div>

                    <div className="row token-card-sec mt-4">
                        {tokens.map((token) => (
                            <div className="col-md-4 col-lg-4 col-xl-3" key={token.id}>
                                <div className={`card token-card ${activeTokens[token.id as TokenType] ? "active" : ""}`} onClick={() =>
                                    handleToggle(token.id as TokenType, !activeTokens[token.id as TokenType])
                                }>
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                        <div className="icon-bg-square icon-bg-info">
                                            <Icons iconName="receipt" className="icon-20 icon-info-dark" />
                                        </div>

                                        <CheckBox
                                            id={token.id}
                                            value={token.label}
                                            checked={activeTokens[token.id as TokenType]}
                                            onChange={(e) =>
                                                handleToggle(token.id as TokenType, e.target.checked)
                                            }
                                        />
                                    </div>

                                    <div className="font-s18 mb-4">{token.title}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div>
                        <button className="btn btn-proceed px-5 font-s20" onClick={handleProceed}>
                            Proceed
                        </button>
                    </div>
                </>
            )}
            {showOrderedItems && (
                <IssueTokens />
            )}

            {orderConfirmModal && (
                <div className="modal fade order-confirm-modal show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-body">
                                <div className='confirm-modal-tick'>
                                    <img src={ConfirmOrderTick} alt="Confirm Order" className="tick-animate" />
                                </div>
                                <div className='font-bill-text mb-3'>Bill #123</div>
                                <p className='font-s18 mb-5'>Order has been <strong className='font-strong'>successfully Issued!</strong></p>
                                <button className="btn btn-orange w-100 mt-3" onClick={() => setOrderConfirmModal(false)}>Done</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
export default CounterSale
