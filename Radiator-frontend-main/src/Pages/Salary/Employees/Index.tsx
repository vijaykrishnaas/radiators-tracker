import { useState } from "react";
import { useForm } from "react-hook-form";

import Icons from "../../../Components/Icons";
import RowActions from "../../../Components/RowActions";
import Selector from "../../../Components/Selector";
import { PageHeader, Badge, Field } from "../../../Components/ui/Basics";
import Modal, { ConfirmDialog } from "../../../Components/ui/Modal";
import { FilterBar, SearchInput } from "../../../Components/ui/Filters";
import { DataList, MobileCard, emptyCopy, type Column } from "../../../Components/ui/DataList";
import { Switch } from "../../../Components/ui/Inputs";
import { useRemoteList } from "../../../Components/ui/useRemoteList";
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

const roleLabel = (r: string) => ROLE_OPTIONS.find((o) => o.value === r)?.label || r;
const emptyBank: BankDetails = { accountName: "", accountNumber: "", ifsc: "", bankName: "" };
const hasBank = (b?: BankDetails | null) => !!b && Object.values(b).some((v) => !!v);

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
    const { callAlertMsg } = useAlertMsg();

    const [saving, setSaving] = useState(false);
    const [searchText, setSearchText] = useState("");
    const [activeFilter, setActiveFilter] = useState("true");
    const [filtersKey, setFiltersKey] = useState(0);

    const [showModal, setShowModal] = useState(false);
    const [bankOpen, setBankOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<Employee | null>(null);
    const [removeTarget, setRemoveTarget] = useState<Employee | null>(null);

    const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<EmployeeForm>({
        defaultValues: defaultEmployee,
    });
    const watchRole = watch("role");
    const watchActive = watch("active");

    const list = useRemoteList<Employee>(async () => {
        const res = await getData("employees", { params: { active: activeFilter, search: searchText } });
        return { rows: res.employees || [] };
    }, [activeFilter, searchText]);

    const activeCount = (searchText ? 1 : 0) + (activeFilter !== "true" ? 1 : 0);
    const clearFilters = () => {
        setSearchText("");
        setActiveFilter("true");
        setFiltersKey((k) => k + 1);
    };

    const openAdd = () => {
        setEditTarget(null);
        reset(defaultEmployee);
        setBankOpen(false);
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
            bankDetails: e.bankDetails || emptyBank,
            notes: e.notes || "",
        });
        setBankOpen(hasBank(e.bankDetails));
        setShowModal(true);
    };

    const onSubmit = async (form: EmployeeForm) => {
        setSaving(true);
        try {
            if (editTarget) {
                await putData(`employees/${editTarget._id}`, form);
                callAlertMsg("Employee updated", "success");
            } else {
                await postData("employees", form);
                callAlertMsg("Employee saved", "success");
            }
            setShowModal(false);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to save employee", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!removeTarget) return;
        setSaving(true);
        try {
            const res = await deleteData(`employees/${removeTarget._id}`);
            callAlertMsg(res.message || "Employee removed", "success");
            setRemoveTarget(null);
            await list.reload();
        } catch (err: any) {
            callAlertMsg(err?.message || "Failed to remove employee", "error");
        } finally {
            setSaving(false);
        }
    };

    const rowMenu = (e: Employee) => (
        <RowActions ariaLabel={`Actions for ${e.name}`} items={[
            { label: "Edit", icon: <Icons iconName="edit" />, onClick: () => openEdit(e) },
            { label: "Remove", icon: <Icons iconName="delete" />, danger: true, onClick: () => setRemoveTarget(e) },
        ]} />
    );
    const statusBadge = (e: Employee) => <Badge tone={e.active ? "success" : "neutral"} dot>{e.active ? "Active" : "Inactive"}</Badge>;

    const columns: Column<Employee>[] = [
        { key: "si", header: "SI No", className: "nowrap tabular", cell: (_e, i) => i + 1 },
        { key: "name", header: "Name", className: "key text", cell: (e) => e.name },
        { key: "role", header: "Role", className: "nowrap", cell: (e) => <Badge tone="neutral">{roleLabel(e.role)}</Badge> },
        { key: "phone", header: "Phone", className: "nowrap tabular", cell: (e) => e.phone || "—" },
        { key: "salary", header: "Base Salary", className: "num", cell: (e) => money(e.baseSalary) },
        { key: "status", header: "Status", className: "nowrap", cell: statusBadge },
        { key: "act", header: <span className="visually-hidden">Action</span>, className: "cell-actions num", cell: rowMenu },
    ];

    const filterBar = (
        <FilterBar
            activeCount={activeCount}
            onClear={clearFilters}
            search={<SearchInput value={searchText} key={filtersKey} id="emp-search" label="Search" placeholder="Search by name..." onSearch={setSearchText} />}
            filters={[
                {
                    id: "emp-status", label: "Status", primary: true,
                    node: <Selector inputId="emp-status" options={ACTIVE_OPTIONS}
                        value={ACTIVE_OPTIONS.find((o) => o.value === activeFilter) || null}
                        onChange={(opt: any) => setActiveFilter(opt ? opt.value : "")} />,
                },
            ]}
        />
    );

    const addButton = (
        <button type="button" className="btn btn-primary" onClick={openAdd}>
            <Icons iconName="add" />Add Employee
        </button>
    );

    return (
        <>
            <PageHeader title="Employees" primary={addButton} />

            <DataList<Employee>
                caption="Employees"
                toolbar={filterBar}
                rows={list.rows}
                rowKey={(e) => e._id}
                columns={columns}
                status={list.status}
                refetching={list.refetching}
                onRetry={list.reload}
                errorTitle="Couldn't load employees"
                empty={emptyCopy({
                    filtered: activeCount > 0,
                    noun: "employees",
                    noDataText: "Add your first employee and they will show up here.",
                    noMatchText: "Try a different name or status.",
                    onClear: clearFilters,
                    action: addButton,
                })}
                mobileCard={(e) => (
                    <MobileCard
                        title={e.name}
                        onOpen={() => openEdit(e)}
                        badge={<><Badge tone="neutral">{roleLabel(e.role)}</Badge>{statusBadge(e)}</>}
                        menu={rowMenu(e)}
                        meta={[e.phone]}
                        right={money(e.baseSalary)}
                    />
                )}
            />

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title={editTarget ? "Edit Employee" : "Add Employee"}
                size="lg"
                busy={saving}
                as="form"
                onSubmit={handleSubmit(onSubmit)}
                footer={
                    <>
                        <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}
                            {saving ? "Saving..." : editTarget ? "Update" : "Save"}
                        </button>
                    </>
                }
            >
                <div className="form-grid">
                    <Field label="Name" htmlFor="emp-name" required error={errors.name && "Name is required"}>
                        <input id="emp-name" className="form-control" {...register("name", { required: true })} placeholder="Employee name" />
                    </Field>
                    <Field label="Role" htmlFor="emp-role">
                        <Selector inputId="emp-role" options={ROLE_OPTIONS}
                            value={ROLE_OPTIONS.find((o) => o.value === watchRole) || null}
                            onChange={(opt: any) => { if (opt) setValue("role", opt.value); }} />
                    </Field>
                    <Field label="Phone" htmlFor="emp-phone">
                        <input id="emp-phone" className="form-control" {...register("phone")} placeholder="Phone number" />
                    </Field>
                    <Field label="Join date" htmlFor="emp-join">
                        <input id="emp-join" type="date" className="form-control" max={today()} {...register("joinDate")} />
                    </Field>
                    <Field label="Base salary (₹)" htmlFor="emp-salary" required error={errors.baseSalary && "Valid amount required"}>
                        <input id="emp-salary" type="number" className="form-control" min={0} step="0.01"
                            {...register("baseSalary", { required: true, min: 0 })} placeholder="Monthly base salary" />
                    </Field>
                    <Field label="Status" htmlFor="emp-active">
                        <Switch id="emp-active" label="Active" checked={watchActive} onChange={(v) => setValue("active", v)} />
                    </Field>

                    <div className="span-2 collapsible">
                        <button type="button" className="collapsible-toggle" aria-expanded={bankOpen} aria-controls="emp-bank"
                            onClick={() => setBankOpen((o) => !o)}>
                            <span>Bank details (optional)</span>
                            <Icons iconName="chevron-down" />
                        </button>
                        {bankOpen && (
                            <div className="form-grid collapsible-body" id="emp-bank">
                                <Field label="Account name" htmlFor="emp-bank-name">
                                    <input id="emp-bank-name" className="form-control" {...register("bankDetails.accountName")} />
                                </Field>
                                <Field label="Account number" htmlFor="emp-bank-no">
                                    <input id="emp-bank-no" className="form-control" {...register("bankDetails.accountNumber")} />
                                </Field>
                                <Field label="IFSC" htmlFor="emp-bank-ifsc">
                                    <input id="emp-bank-ifsc" className="form-control" {...register("bankDetails.ifsc")} />
                                </Field>
                                <Field label="Bank name" htmlFor="emp-bank-bank">
                                    <input id="emp-bank-bank" className="form-control" {...register("bankDetails.bankName")} />
                                </Field>
                            </div>
                        )}
                    </div>

                    <Field label="Notes" htmlFor="emp-notes" className="span-2">
                        <textarea id="emp-notes" className="form-control" rows={2} {...register("notes")} />
                    </Field>
                </div>
            </Modal>

            <ConfirmDialog
                open={!!removeTarget}
                title="Remove Employee"
                message={removeTarget && <>Remove <span className="t-strong t-semibold">{removeTarget.name}</span>? If they have no
                    attendance, advance, or settlement history they'll be deleted outright;
                    otherwise they'll be marked inactive so their history stays intact.</>}
                confirmLabel="Remove"
                busyLabel="Removing..."
                busy={saving}
                onConfirm={handleRemove}
                onCancel={() => setRemoveTarget(null)}
            />
        </>
    );
};

export default Employees;
