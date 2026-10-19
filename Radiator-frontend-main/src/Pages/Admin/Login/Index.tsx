import React, { useState } from "react";
import { Field } from "../../../Components/ui/Basics";
import { PasswordInput } from "../../../Components/ui/Inputs";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import InputText from "../../../Components/InputText";
import { setSession } from "../../../Services/Auth";
import { adminLogin } from "../../../Services/AdminApi";

type Values = { userId: string; password: string };

import Icons from "../../../Components/Icons";

const AdminLogin: React.FC = () => {
    const navigate = useNavigate();
    const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
        defaultValues: { userId: "", password: "" },
    });
    const [loginError, setLoginError] = useState("");

    const onSubmit = async (data: Values) => {
        setLoginError("");
        try {
            const res = await adminLogin(data.userId, data.password);
            setSession(res.token, res.user);
            navigate(res.user?.mustChangePassword ? "/change-password" : "/admin/clients");
        } catch (err: any) {
            setLoginError(err?.message || "Login failed. Please try again.");
        }
    };

    return (
        <main className="auth-page">
            <div className="auth-card" style={{ maxWidth: 420 }}>
                <div className="text-center mb-4">
                    <span className="auth-tile" aria-hidden="true"><Icons iconName="shield" /></span>
                    <p className="auth-eyebrow">Super Admin</p>
                    <h1 className="auth-title mt-1">Console sign-in</h1>
                    <p className="auth-sub mb-0">Manage clients &amp; platform access</p>
                </div>
                <form onSubmit={handleSubmit(onSubmit)} noValidate className="d-grid gap-3">
                    <Field label="User ID" htmlFor="admin-user" error={errors.userId?.message}>
                        <Controller
                            name="userId"
                            control={control}
                            rules={{ required: "User ID is required" }}
                            render={({ field }) => (
                                <InputText {...field} id="admin-user" autoComplete="username" placeholder="Enter user ID" aria-invalid={!!errors.userId || undefined} />
                            )}
                        />
                    </Field>
                    <Field label="Password" htmlFor="admin-password" error={errors.password?.message}>
                        <Controller
                            name="password"
                            control={control}
                            rules={{ required: "Password is required" }}
                            render={({ field }) => (
                                <PasswordInput id="admin-password" value={field.value} onChange={field.onChange} autoComplete="current-password"
                                    placeholder="Enter password" invalid={!!errors.password} />
                            )}
                        />
                    </Field>
                    {loginError && <p className="field-error text-center m-0" role="alert">{loginError}</p>}
                    <button type="submit" className="btn btn-accent w-100 mt-1" disabled={isSubmitting}>
                        {isSubmitting && <span className="spinner" aria-hidden="true" />}
                        {isSubmitting ? "Signing in..." : "SIGN IN"}
                    </button>
                </form>
            </div>
        </main>
    );
};

export default AdminLogin;
