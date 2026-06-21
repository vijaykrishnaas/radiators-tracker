import Scanner from '../../../../Assets/images/issueCounter/scanner.png';
import Icons from '../../../../Components/Icons';
import { BillModalProps } from '../Types/Index';

const BillModal = ({ cart, onClose, onSuccess }: BillModalProps) => {
    return (
        <div
            className="modal fade"
            id="billModal"
            data-bs-backdrop="static"
            data-bs-keyboard="false"
            tabindex="-1"
            aria-labelledby="billModal" aria-hidden="true"
            onClick={onClose}
        >
            <div className="issue-counter-bill modal-dialog modal-dialog-centered failure-modal">
                <div
                    className="modal-content"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="modal-body text-center pb-0">
                        <div className="d-flex flex-column justify-content-between">
                            <div className="bill-counter pt-4 px-5 pb-3">
                                <div className="d-flex justify-content-between mb-1">
                                    <p className="font-s14"><Icons iconName='bill_group_creations' className='icons-18 bill-icon' />Canteen Bill</p>
                                    <div className="cursor-pointer fw-bold">#1235</div>
                                </div>
                                <div className="d-flex justify-content-start align-items-center gap-3">
                                    <p className="font-s14 mb-0 d-flex align-items-center">
                                        <Icons
                                            iconName="calendar_issue_counter"
                                            className="icon-14 icon-gray me-2"
                                        />
                                        20/11/2025
                                    </p>

                                    <p className="font-s14 mb-0 d-flex align-items-center">
                                        <Icons
                                            iconName="nest_clock_farsight_analog"
                                            className="icon-14 icon-gray me-2"
                                        />
                                        9.00 AM
                                    </p>
                                </div>

                            </div>
                            <div className="p-3 px-5">
                                <div className="pb-2 d-flex justify-content-between">
                                    <span className="fw-bold">Item</span>
                                    <span className="fw-bold">Qty</span>
                                </div>
                                {cart.map(item => (
                                    <div
                                        key={item.id}
                                        className="pb-2 d-flex justify-content-between align-items-center"
                                    >
                                        <span className="fw-medium">{item.name}</span>
                                        <span className="fw-medium">× {item.qty}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="border-top-dotted py-3 ">
                                <div className="p-3 px-5">
                                    <img src={Scanner} alt="scanner" />
                                    <button
                                        data-bs-dismiss="modal"
                                        aria-label="Close"
                                        className="btn w-100 border rounded-pill py-3 mt-4 login-btn"
                                        onClick={onClose}
                                        style={{ backgroundColor: "#F9F9F9", color: "#242323" }}
                                    >
                                        Cancel Order
                                    </button>
                                    <button
                                        data-bs-dismiss="modal"
                                        aria-label="Close"
                                        className="btn w-100 rounded-pill py-3 mt-3 login-btn"
                                        style={{ backgroundColor: "#f47f6b", color: "#fff" }}
                                        onClick={() => onSuccess()}
                                    >
                                        Print Bill
                                    </button>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default BillModal;
