import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Loader from "../../../Components/Loader";
import Search from "../../../Components/Search";
import Selector from "../../../Components/Selector";
import AlertComponent from "../../../Components/AlertComponent";
import { getData, postData, putData, deleteData } from "../../../Services/ApiServices";
import { useAlertMsg } from "../../../Services/AllServices";
import { money, today } from "../../../Utils/format";

type BankDetails = { accountName: string; accountNumber: string; ifsc: string; bankName: string };
type Employee = {
    _id: string;
    name: string;
    role: "mechanic" | "labour" | "other";
    phone?: string;
    joinDate?: string;
    active: boolean;
    baseSalary: number;
    bankDetails?: BankDetails | null;
    notes?: string;
};
type EmployeeForm = {
    name: string;
    role: "mechanic" | "labour" | "other";
    phone: string;
    joinDate: string;
    active: boolean;
    baseSalary: number;
    bankDetails: BankDetails;
    notes: string;
};

const ROLE_OPTIONS = [
    { value: "mechanic", label: "Mechanic" },
    { value: "labour", label: "Labour" },
    { value: "other", label: "Other" },
];

const ACTIVE_OPTIONS = [
    { value: "true", label: "Active" },
    { value: "false", label: "Inactive" },
];

const defaultEmployee: EmployeeForm = {
    name: "",
    role: "other",
    phone: "",
    joinDate: today(),
    active: true,
    baseSalary: 0,
    bankDetails: { accountName: "", accountNumber: "", ifsc: "", bankName: "" },
    notes: "",
};

const Employees = () => {
    const { alert, alertMessage, callAlertMsg } = useAlertMsg();

    const [loading, setLoading] = useState(false);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [searchText, setSearchText] = useState("");
    const [activeFilter, setActiveFilter] = useState("true");
    const [filtersKey, setFiltersKey] = useState(0);

    const [showModal, setShowModal] = useState(false);
    const [editTarget, setEditTarget] = useState<Employee | null>(null);
    const [removeTarget, setRemoveTarget] = useState<Employee | null>(null);

    const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<EmployeeForm>({
        defaultValues: defaultEmployee,
    });
    const watchRole = watch("role");
    const watchActive = watch("active");

    const getTableData = async () => {
        setLoading(true);
        try {
            const res = await getData("employees", { params: { active: activeFilter, search: searchText } });
            setEmployees(res.employees || []);
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to load employees", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        getTableData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFilter, searchText]);

    useEffect(() => {
        sessionStorage.removeItem("employee_search");
    }, []);

    const handleSearchData = () => {
        setSearchText(sessionStorage.getItem("employee_search") || "");
    };

    const clearFilters = () => {
        setSearchText("");
        setActiveFilter("true");
        setFiltersKey((k) => k + 1);
    };

    const openAdd = () => {
        setEditTarget(null);
        reset(defaultEmployee);
        setShowModal(true);
    };

    const openEdit = (e: Employee) => {
        setEditTarget(e);
        reset({
            name: e.name,
            role: e.role,
            phone: e.phone || "",
            joinDate: e.joinDate ? new Date(e.joinDate).toISOString().slice(0, 10) : today(),
            active: e.active,
            baseSalary: e.baseSalary,
            bankDetails: e.bankDetails || { accountName: "", accountNumber: "", ifsc: "", bankName: "" },
            notes: e.notes || "",
        });
        setShowModal(true);
    };

    const onSubmit = async (form: EmployeeForm) => {
        setLoading(true);
        try {
            if (editTarget) {
                await putData(`employees/${editTarget._id}`, form);
                callAlertMsg("Employee updated", "success");
            } else {
                await postData("employees", form);
                callAlertMsg("Employee saved", "success");
            }
            setShowModal(false);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to save employee", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleRemove = async () => {
        if (!removeTarget) return;
        setLoading(true);
        try {
            const res = await deleteData(`employees/${removeTarget._id}`);
            callAlertMsg(res.message || "Employee removed", "success");
            setRemoveTarget(null);
            await getTableData();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to remove employee", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="row">
            <Loader loading={loading} />
            <AlertComponent alertMessage={alertMessage} alert={alert} />

            <div className="col">
                <div className="w-100 d-flex justify-content-between my-4">
                    <h4 className="fw-semibold">Employees</h4>
                    <button type="button" className="btn btn-gradient btn-sm d-flex align-items-center"
                        onClick={openAdd}>
                        <Icons iconName="add" className="icon-12 icon-white me-2" />
                        Add Employee
                    </button>
                </div>

                <div className="card card-shadow mt-4">
                    <div className="card-body p-0">
                        <div className="table-header">
                            <div className="row table-accordion-header align-items-end g-3">
                                <div className="col-12 col-md-5 col-xl-4" key={`emp-search-${filtersKey}`}>
                                    <Search getData={handleSearchData} placeholder="Search by name..."
                                        storageKey="employee_search" />
                                </div>
                                <div className="col-6 col-md-4 col-xl-3">
                                    <label className="form-label font-w500 mb-1">Status</label>
                                    <Selector key={`emp-active-${filtersKey}`} options={ACTIVE_OPTIONS}
                                        value={ACTIVE_OPTIONS.find((o) => o.value === activeFilter) || null}
                                        onChange={(opt: any) => setActiveFilter(opt ? opt.value : "")} />
                                </div>
                                <div className="col-6 col-md-3 col-xl-2 d-flex align-items-end">
                                    <button type="button" className="btn btn-cancel btn-sm w-100" onClick={clearFilters}>Clear</button>
                                </div>
                            </div>
                        </div>

                        <div className="table-body">
                            <table className="table table-bordered font-s14">
                                <thead>
                                    <tr>
                                        <th>SI No</th>
                                        <th>Name</th>
                                        <th>Role</th>
                                        <th>Phone</th>
                                        <th>Base Salary</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.length ? employees.map((e, i) => (
                                        <tr key={e._id}>
                                            <td>{i + 1}</td>
                                            <td className="font-w500">{e.name}</td>
                                            <td className="text-capitalize">{e.role}</td>
                                            <td>{e.phone || "—"}</td>
                                            <td>{money(e.baseSalary)}</td>
                                            <td>
                                                <span className={`status-badge ${e.active ? "status-badge-success" : "status-badge-warning"}`}>
                                                    {e.active ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td>
                                                <RowActions ariaLabel="Employee actions" items={[
                                                    { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(e) },
                                                    { label: "Remove", icon: <Icons iconName="delete" />, danger: true, onClick: () => setRemoveTarget(e) },
                                                ]} />
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={7} className="text-center py-3 text-muted">No employees found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-lg modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">{editTarget ? "Edit Employee" : "Add Employee"}</span>
                                <button type="button" className="btn-close" aria-label="Close"
                                    onClick={() => setShowModal(false)} />
                            </div>
                            <form onSubmit={handleSubmit(onSubmit)}>
                                <div className="modal-body">
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Name *</label>
                                            <input className="form-control" {...register("name", { required: true })}
                                                placeholder="Employee name" />
                                            {errors.name && <span className="text-danger font-s12">Name is required</span>}
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Role</label>
                                            <Selector
                                                options={ROLE_OPTIONS}
                                                value={ROLE_OPTIONS.find((o) => o.value === watchRole) || null}
                                                onChange={(opt: any) => { if (opt) setValue("role", opt.value); }}
                                            />
                                        </div>
                                    </div>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Phone</label>
                                            <input className="form-control" {...register("phone")} placeholder="Phone number" />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Join Date</label>
                                            <input type="date" className="form-control" max={today()} {...register("joinDate")} />
                                        </div>
                                    </div>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Base Salary (₹) *</label>
                                            <input type="number" className="form-control" min={0} step="0.01"
                                                {...register("baseSalary", { required: true, min: 0 })}
                                                placeholder="Monthly base salary" />
                                            {errors.baseSalary && <span className="text-danger font-s12">Valid amount required</span>}
                                        </div>
                                        <div className="col-md-6 d-flex align-items-end">
                                            <div className="form-check">
                                                <input type="checkbox" className="form-check-input" id="emp-active"
                                                    checked={watchActive}
                                                    onChange={(e) => setValue("active", e.target.checked)} />
                                                <label className="form-check-label" htmlFor="emp-active">Active</label>
                                            </div>
                                        </div>
                                    </div>

                                    <p className="font-w600 font-s14 mb-2">Bank Details (optional)</p>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Account Name</label>
                                            <input className="form-control" {...register("bankDetails.accountName")} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Account Number</label>
                                            <input className="form-control" {...register("bankDetails.accountNumber")} />
                                        </div>
                                    </div>
                                    <div className="row g-3 mb-3">
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">IFSC</label>
                                            <input className="form-control" {...register("bankDetails.ifsc")} />
                                        </div>
                                        <div className="col-md-6">
                                            <label className="form-label font-w500">Bank Name</label>
                                            <input className="form-control" {...register("bankDetails.bankName")} />
                                        </div>
                                    </div>
                                    <div className="row g-3">
                                        <div className="col-12">
                                            <label className="form-label font-w500">Notes</label>
                                            <textarea className="form-control" rows={2} {...register("notes")} />
                                        </div>
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-cancel btn-sm"
                                        onClick={() => setShowModal(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
                                        {loading ? "Saving..." : editTarget ? "Update" : "Save"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Remove Confirm Modal */}
            {removeTarget && (
                <div className="modal fade show d-block" tabIndex={-1} role="dialog">
                    <div className="modal-dialog modal-dialog-centered" role="document">
                        <div className="modal-content">
                            <div className="modal-header">
                                <span className="modal-title">Remove Employee</span>
                                <button type="button" className="btn-close" aria-label="Close"
                                    onClick={() => setRemoveTarget(null)} />
                            </div>
                            <div className="modal-body">
                                <p className="font-s14 mb-0">
                                    Remove <span className="font-w600">{removeTarget.name}</span>? If they have no
                                    attendance, advance, or settlement history they'll be deleted outright;
                                    otherwise they'll be marked inactive so their history stays intact.
                                </p>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-cancel btn-sm"
                                    onClick={() => setRemoveTarget(null)}>Cancel</button>
                                <button type="button" className="btn btn-danger btn-sm"
                                    onClick={handleRemove} disabled={loading}>
                                    {loading ? "Removing..." : "Remove"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Employees;
