
import { useEffect, useState } from 'react';
import { AxiosError } from 'axios';

import Selector from '../../Components/Selector';
import DateCalendar from '../../Components/DateCalendar';
import Icons from '../../Components/Icons';
import Pagination from '../../Components/Pagination';
import Loader from '../../Components/Loader';
import Search from '../../Components/Search';
import { usePagination } from '../../Services/CommonServices';
import { useAlertMsg } from '../../Services/AllServices';
import { PaginationData, PaginationQuery } from '../../Types/common';
import { OrderHistoryListResponse, OrderRecord } from './Types/Index';
import { getData, postData } from '../../Services/ApiServices';
import { CanteenOption } from '../TokenGroupManagement/Types/Index';
import AlertComponent from '../../Components/AlertComponent';
import { DeliveredStatus } from '../../Enums/Enum';

const OrderHistory = () => {

    const [response, setResponse] = useState<PaginationData>({ totalRecords: 0 });
    const [recordData, setRecordData] = useState<OrderRecord[]>([]);
    const [paginationDataLimit, setPaginationDataLimit] = useState<PaginationQuery>({
        skip: 0,
        limit: 15,
    });

    const {
        paginationFunction,
        handleNextPage,
        handlePreviousPage,
        handleInputChange,
        totalPages,
        pagination,
        setPagination,
        selectedDataList,
        setSelectedDataList,
        currentPage,
        setCurrentPage,
    } = usePagination(response, paginationDataLimit);

    //Loader
    const [loading, setLoading] = useState(false);

    //Alert
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [canteens, setCanteens] = useState([]);
    const [selectedCanteen, setSelectedCanteen] = useState<CanteenOption | null>(null)

    const [dateValue, setDateValue] = useState<Date | null>(new Date());
    const dateFormat = "dd/MM/yyyy";

    let paginationQuery: PaginationQuery;

    const queryFunction = (isFilter: boolean) => {
        if (isFilter) {
            setCurrentPage(1);
            paginationQuery = { skip: 0, limit: pagination.limit || 15 };
            setSelectedDataList(pagination.limit || 15);
            setPagination({
                ...paginationQuery,
                currentPage: 1,
                totalRecords: pagination.totalRecords
            });
            setPaginationDataLimit(paginationQuery);
        } else {
            paginationQuery = pagination.limit
                ? { skip: pagination.skip, limit: pagination.limit }
                : paginationDataLimit;
            setPaginationDataLimit(paginationQuery);
        }
    };

    useEffect(() => {
        sessionStorage.removeItem("filter");
        sessionStorage.removeItem("search");
    }, []);

    useEffect(() => {
        getTableData();
    }, [paginationFunction, selectedCanteen, dateValue]);

    const getTableData = async (isFilter = false) => {
        const url = `order/list`;
        setLoading(true);

        try {
            queryFunction(isFilter);
            const search = sessionStorage.getItem("search") || undefined;
            const query = {
                canteenId: selectedCanteen?.value,
                date: dateValue,
                search: search || "",
                ...paginationQuery,
            };
            const result: OrderHistoryListResponse = await postData(url, query);
            if (result.status === "success") {
                const foodList = result.data?.orderList || [];
                setResponse(result.data);
                setRecordData(foodList);
            } else {
                callAlertMsg(result.message || "Something went wrong", "error");
            }
        } catch (error: unknown) {
            const err = error as AxiosError<{ message?: string }>;
            callAlertMsg(err.response?.data?.message || err.message || "Error", "error");
        } finally {
            setLoading(false);
        }
    };

    const getCanteenData = async () => {
        setLoading(true);
        const url = "canteen/list";

        try {
            const result = await getData(url);
            if (result.status === "success") {
                const canteenOptions = (result.data?.canteenList || []).map(
                    (item: { _id: string; name: string }) => ({
                        value: item._id,
                        label: item.name.toUpperCase(),
                    })
                );
                setCanteens(canteenOptions);
                if (canteenOptions.length > 0) {
                    setSelectedCanteen(canteenOptions[0]);
                }
            } else {
                callAlertMsg(result?.message || "Something went wrong", "error");
            }
        } catch (error: unknown) {
            const err = error as AxiosError<{ message?: string }>;
            callAlertMsg(err.message || "Error", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getCanteenData();
        setDateValue(new Date());
    }, []);

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />
            <div className="col">
                <div className="row align-items-center mb-2">
                    <div className="col-12 col-lg-4 mb-2 mb-lg-0">
                        <span className="fs-6">Order History</span>
                    </div>
                    <div className="col-12 col-lg-8">
                        <div className="row g-2 justify-content-lg-end">
                            <div className="col-12 col-md-6 col-lg-3">
                                <Selector
                                    options={canteens}
                                    value={selectedCanteen}
                                    isMulti={false}
                                    isClearable={false}
                                    onChange={(selected) => {
                                        setSelectedCanteen(selected);
                                        setDateValue(new Date());
                                    }}
                                />
                            </div>
                            <div className="col-12 col-md-6 col-lg-3">
                                <DateCalendar
                                    customClass="daily-plan-date"
                                    value={dateValue}
                                    format={dateFormat}
                                    onChange={(date) =>
                                        setDateValue(Array.isArray(date) ? date[0] ?? null : date)
                                    }
                                    maxDate={new Date()}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="card card-shadow">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header">
                                <div className='col-12 col-md-4 col-xl-2'>
                                    <Search getData={getTableData} placeholder="" />
                                </div>
                            </div>
                        </div>
                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead className="table-light">
                                    <tr>
                                        <th>S.No</th>
                                        <th>Order ID</th>
                                        <th>Item Names</th>
                                        <th>Roll No / Faculty ID</th>
                                        <th>Ordered Qty</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recordData.length > 0 ? (
                                        recordData.map((order, index) => (
                                            <tr key={order.orderNo || index}>
                                                <td>{index + 1}</td>
                                                <td className="font-w500">{order.orderNo}</td>
                                                <td
                                                    dangerouslySetInnerHTML={{
                                                        __html: order.foodList
                                                            ?.map(item => item?.name?.english)
                                                            .filter(Boolean)
                                                            .join("<br/>"),
                                                    }}
                                                ></td>

                                                <td>{order.userCode}</td>
                                                <td>{order.foodList?.length || 0}</td>

                                                <td key={index}>
                                                    {order.foodList?.map((item, index) => (
                                                        <span
                                                            className={` me-2 status-badge ${item.status === DeliveredStatus.DELIVERED
                                                                ? "status-badge-success"
                                                                : "status-badge-danger"
                                                                }`}
                                                        >
                                                            {item.status === DeliveredStatus.DELIVERED
                                                                ? "Delivered"
                                                                : item.status === "ND"
                                                                    ? "Not Delivered"
                                                                    : ""}
                                                        </span>
                                                    ))}
                                                </td>
                                                <td className="action-dropdown">
                                                    <div className="dropdown">
                                                        <button className="btn" data-bs-toggle="dropdown">
                                                            <Icons iconName="Frame" className="icon-20" />
                                                        </button>
                                                        <ul className="dropdown-menu">
                                                            <li>
                                                                <button className="dropdown-item text-primary">
                                                                    View <Icons iconName="vieweye" className="icon-15 icon-primary ms-4" />
                                                                </button>
                                                            </li>
                                                            <li>
                                                                <button className="dropdown-item text-violet">
                                                                    Print <Icons iconName="print" className="icon-15 icon-item-master-internal ms-4" />
                                                                </button>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="text-center py-3">
                                                No records found
                                            </td>
                                        </tr>
                                    )}
                                </tbody>

                            </table>
                        </div>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        paginationDataLimit={paginationDataLimit}
                        response={response}
                        selectedDataList={selectedDataList}
                        setSelectedDataList={setSelectedDataList}
                        handleInputChange={handleInputChange}
                        handlePreviousPage={handlePreviousPage}
                        handleNextPage={handleNextPage}
                        totalPages={totalPages}
                    />
                </div>
            </div>
        </div>
    )

}

export default OrderHistory;
