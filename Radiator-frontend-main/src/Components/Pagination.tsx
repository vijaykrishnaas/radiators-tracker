import React, { useState } from "react";

export type PaginationProps = {
    currentPage: number;
    totalPages: number;
    selectedDataList: number;
    paginationDataLimit: {
        limit: number;
    };
    response: {
        totalRecords: number;
    };
    setSelectedDataList: React.Dispatch<React.SetStateAction<number>>;
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handlePreviousPage: () => void;
    handleNextPage: () => void;
};

const Pagination: React.FC<PaginationProps> = (props) => {
    const [isInputFocused, setIsInputFocused] = useState(false);

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            props.handleInputChange(e as unknown as React.ChangeEvent<HTMLInputElement>);
            setIsInputFocused(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = Number(e.target.value);
        props.setSelectedDataList(value);

        const options = [10, 20, 30, 50, 100];
        if (options.includes(value)) {
            setIsInputFocused(false);
            props.handleInputChange(e);
        }
    };

    const handleReset = () => {
        props.setSelectedDataList(props.paginationDataLimit.limit);
    };

    return (
        <div className="card-footer table-pagination">
            <div className="row">
                <div className="d-flex align-items-center justify-content-sm-between col-xs-between">
                    <div className="col-sm-3 col-md-6 col-xl-9 col-xxl-9 me-3">
                        <span>
                            {props.currentPage === 1
                                ? 1
                                : (props.currentPage - 1) * props.paginationDataLimit.limit + 1}{" "}
                            -{" "}
                            {Math.min(
                                props.currentPage * props.paginationDataLimit.limit,
                                props.response.totalRecords
                            )}{" "}
                            of {props.response.totalRecords}
                        </span>
                    </div>
                    <div className="col-sm-5 col-md-4 col-xl-2 col-xxl-2 d-flex align-items-center justify-content-end">
                        Rows per page:
                        <div>
                            <input
                                className="form-control datalist"
                                name="dataLimit"
                                type="number"
                                list="datalistOptions"
                                id="exampleDataList"
                                value={props.selectedDataList}
                                onChange={handleInputChange}
                                onKeyDown={handleKeyPress}
                                onFocus={() => setIsInputFocused(true)}
                                onBlur={() => {
                                    setIsInputFocused(false);
                                    handleReset();
                                }}
                                min={1}
                            />
                            <datalist id="datalistOptions" className="datalistOptions">
                                <option value="10" />
                                <option value="20" />
                                <option value="30" />
                                <option value="50" />
                                <option value="100" />
                            </datalist>
                        </div>
                    </div>
                    <div className="col-sm-4 col-md-2 col-xl-1 col-xxl-1 pagination d-flex justify-content-center">
                        <button
                            className="btn navigation-left"
                            type="button"
                            disabled={props.currentPage === 1 || isInputFocused}
                            onClick={props.handlePreviousPage}
                        />
                        <div className="mx-2 d-flex align-items-center">
                            {props.currentPage} / {props.totalPages}
                        </div>
                        <button
                            className="btn navigation-right"
                            type="button"
                            disabled={props.currentPage === props.totalPages || isInputFocused}
                            onClick={props.handleNextPage}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Pagination;
