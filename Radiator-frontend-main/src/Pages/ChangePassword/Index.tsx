import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { postData } from "../../Services/ApiServices";
import { getUser, getToken, setSession } from "../../Services/Auth";
import { useSettings } from "../../Context/SettingsContext";
import { Field } from "../../Components/ui/Basics";
import { PasswordInput } from "../../Components/ui/Inputs";
import { initialsOf, resolveAsset } from "../../layout/AppShell";
import Icons from "../../Components/Icons";

const ChangePassword: React.FC = () => {
    const navigate = useNavigate();
    const user = getUser();
    const forced = !!user?.mustChangePassword;
    const isAdmin = user?.role === "superadmin";
    const { settings } = useSettings();
    const logo = isAdmin ? "" : resolveAsset(settings.company.logoUrl);
    const initials = isAdmin ? "" : initialsOf(settings.company.name || "");

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
        <main className="auth-page">
            <div className="auth-card">
                <div className="mb-4">
                    {logo ? (
                        <img src={logo} alt="" className="auth-logo" />
                    ) : (
                        <span className="auth-tile is-40" aria-hidden="true">{initials || <Icons iconName={isAdmin ? "shield" : "key"} />}</span>
                    )}
                </div>
                <h1 className="auth-title">Change password</h1>
                <p className="auth-sub">
                    {forced
                        ? "For security, please set a new password before continuing."
                        : "Update your account password."}
                </p>
                <form onSubmit={submit} noValidate className="d-grid gap-3">
                    <Field label="Current password" htmlFor="cp-current">
                        <PasswordInput id="cp-current" value={current} onChange={setCurrent} placeholder="Current password" autoComplete="current-password" />
                    </Field>
                    <Field label="New password" htmlFor="cp-new">
                        <PasswordInput id="cp-new" value={next} onChange={setNext} placeholder="At least 6 characters" autoComplete="new-password" />
                    </Field>
                    <Field label="Confirm new password" htmlFor="cp-confirm">
                        <PasswordInput id="cp-confirm" value={confirm} onChange={setConfirm} placeholder="Re-enter new password" autoComplete="new-password" />
                    </Field>
                    {error && <p className="field-error m-0" role="alert">{error}</p>}
                    <div className="auth-actions mt-2">
                        {!forced && (
                            <button type="button" className="btn btn-secondary" onClick={home}>Cancel</button>
                        )}
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving && <span className="spinner" aria-hidden="true" />}
                            {saving ? "Saving..." : "Change Password"}
                        </button>
                    </div>
                </form>
            </div>
        </main>
    );
};

export default ChangePassword;
