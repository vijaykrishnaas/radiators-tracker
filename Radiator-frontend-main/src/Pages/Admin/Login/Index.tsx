import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import InputText from "../../../Components/InputText";
import Icons from "../../../Components/Icons";
import { setSession } from "../../../Services/Auth";
import { adminLogin } from "../../../Services/AdminApi";

type Values = { userId: string; password: string };

const ShieldMark = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
    </svg>
);

const AdminLogin: React.FC = () => {
    const navigate = useNavigate();
    const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<Values>({
        defaultValues: { userId: "", password: "" },
    });
    const [showPassword, setShowPassword] = useState(false);
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
        <div className="admin-login-shell">
            <div className="admin-login-card">
                <div className="text-center mb-4">
                    <div className="admin-emblem"><ShieldMark /></div>
                    <div className="admin-eyebrow">Super Admin</div>
                    <h4 className="fw-semibold mb-0 mt-1">Console sign-in</h4>
                    <p className="text-muted font-s13 mb-0">Manage clients &amp; platform access</p>
                </div>
                <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <div className="mb-3">
                        <label className="u-label d-block mb-1">User ID</label>
                        <Controller
                            name="userId"
                            control={control}
                            rules={{ required: "User ID is required" }}
                            render={({ field }) => (
                                <InputText {...field} className="form-control login-input-height" placeholder="Enter user ID" />
                            )}
                        />
                        <div className="error-holder">
                            {errors.userId && <small className="text-danger">{errors.userId.message}</small>}
                        </div>
                    </div>
                    <div className="mb-2">
                        <label className="u-label d-block mb-1">Password</label>
                        <div className="position-relative">
                            <Controller
                                name="password"
                                control={control}
                                rules={{ required: "Password is required" }}
                                render={({ field }) => (
                                    <InputText
                                        {...field}
                                        type={showPassword ? "text" : "password"}
                                        className="form-control login-input-height pe-5"
                                        placeholder="Enter password"
                                    />
                                )}
                            />
                            <span className="password-toggle" style={{ position: "absolute", top: "50%", right: 6, transform: "translateY(-50%)", cursor: "pointer" }}
                                onClick={() => setShowPassword(!showPassword)}>
                                <Icons iconName={showPassword ? "eye_closed" : "eye_open"} className="icon-18 bill-date-icon me-2" />
                            </span>
                        </div>
                        <div className="error-holder">
                            {errors.password && <small className="text-danger">{errors.password.message}</small>}
                        </div>
                    </div>
                    <div className="error-holder text-center mb-2">
                        {loginError && <small className="text-danger">{loginError}</small>}
                    </div>
                    <button
                        type="submit"
                        className="btn w-100 rounded-pill py-2"
                        disabled={isSubmitting}
                        style={{ backgroundColor: "var(--accentColor)", color: "#fff", fontWeight: 600, letterSpacing: "0.04em" }}
                    >
                        {isSubmitting ? "Signing in..." : "SIGN IN"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AdminLogin;
