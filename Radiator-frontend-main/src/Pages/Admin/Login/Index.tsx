import React, { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import InputText from "../../../Components/InputText";
import Icons from "../../../Components/Icons";
import { setSession } from "../../../Services/Auth";
import { adminLogin } from "../../../Services/AdminApi";

type Values = { userId: string; password: string };

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
        <div className="section d-flex align-items-center justify-content-center min-vh-100 bg-light">
            <div className="login-card w-100 px-3" style={{ maxWidth: 420 }}>
                <div className="card border-0 shadow rounded-4 w-100">
                    <div className="card-body p-4 p-md-5">
                        <div className="text-center mb-4">
                            <Icons iconName="data_management" className="icon-32 mb-2" />
                            <h4 className="fw-semibold mb-0">Super Admin</h4>
                            <p className="text-muted font-s13 mb-0">Client management portal</p>
                        </div>
                        <form onSubmit={handleSubmit(onSubmit)}>
                            <div className="mb-4">
                                <Controller
                                    name="userId"
                                    control={control}
                                    rules={{ required: "User ID is required" }}
                                    render={({ field }) => (
                                        <InputText {...field} className="form-control login-input-height" placeholder="User ID" />
                                    )}
                                />
                                <div className="error-holder">
                                    {errors.userId && <small className="text-danger">{errors.userId.message}</small>}
                                </div>
                            </div>
                            <div className="mb-4">
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
                                                placeholder="Password"
                                            />
                                        )}
                                    />
                                    <span className="password-toggle" onClick={() => setShowPassword(!showPassword)}>
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
                                style={{ backgroundColor: "var(--accentColor)", color: "#fff" }}
                            >
                                {isSubmitting ? "Logging in..." : "LOGIN"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
