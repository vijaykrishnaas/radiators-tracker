import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import InputText from "../../Components/InputText";
import { postData } from "../../Services/ApiServices";
import { getUser, getToken, setSession } from "../../Services/Auth";

const ChangePassword: React.FC = () => {
    const navigate = useNavigate();
    const user = getUser();
    const forced = !!user?.mustChangePassword;
    const isAdmin = user?.role === "superadmin";

    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const home = () => navigate(isAdmin ? "/admin/clients" : "/issueCounter/dashboard");

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (next.length < 6) return setError("New password must be at least 6 characters");
        if (next !== confirm) return setError("New passwords do not match");
        setSaving(true);
        try {
            await postData("auth/change-password", { currentPassword: current, newPassword: next });
            // Clear the forced-change flag in the stored session.
            const token = getToken();
            if (token && user) setSession(token, { ...user, mustChangePassword: false });
            home();
        } catch (err: any) {
            setError(err?.message || "Could not change password");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="section d-flex align-items-center justify-content-center min-vh-100 bg-light">
            <div className="w-100 px-3" style={{ maxWidth: 440 }}>
                <div className="card border-0 shadow rounded-4">
                    <div className="card-body p-4 p-md-5">
                        <h4 className="fw-semibold mb-1">Change Password</h4>
                        <p className="text-muted font-s13 mb-4">
                            {forced
                                ? "For security, please set a new password before continuing."
                                : "Update your account password."}
                        </p>
                        <form onSubmit={submit}>
                            <div className="mb-3">
                                <label className="form-label font-w500">Current Password</label>
                                <InputText type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" />
                            </div>
                            <div className="mb-3">
                                <label className="form-label font-w500">New Password</label>
                                <InputText type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 6 characters" />
                            </div>
                            <div className="mb-3">
                                <label className="form-label font-w500">Confirm New Password</label>
                                <InputText type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter new password" />
                            </div>
                            {error && <div className="text-danger font-s13 mb-2">{error}</div>}
                            <div className="d-flex gap-2 mt-4">
                                {!forced && (
                                    <button type="button" className="btn btn-cancel btn-sm flex-grow-1" onClick={home}>Cancel</button>
                                )}
                                <button type="submit" className="btn btn-primary btn-sm flex-grow-1" disabled={saving}>
                                    {saving ? "Saving..." : "Change Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ChangePassword;
