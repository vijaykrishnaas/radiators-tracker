import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import Logo from "../../../Assets/images/logo/svr.png";
import InputText from "../../../Components/InputText";
import Icons from "../../../Components/Icons";
import LoginBannerImage from '../../../Assets/images/issueCounter/login_banner.png'
import { useNavigate, useParams } from "react-router-dom";
import { LoginFormValues } from "./Types/Index";
import { getData, postData } from "../../../Services/ApiServices";
import { setSession } from "../../../Services/Auth";
import { useSettings } from "../../../Context/SettingsContext";

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";

type LoginBranding = { companyName: string; logoUrl: string; primaryColor: string; accentColor: string };

const Login: React.FC = () => {
    const navigate = useNavigate()
    // When reached via /t/:code/login, the business code is in the URL.
    const { code: codeFromUrl } = useParams<{ code: string }>();
    const { refreshSettings } = useSettings();
    const [branding, setBranding] = useState<LoginBranding | null>(null);

    // On a per-client login URL, fetch that client's branding to theme the page.
    useEffect(() => {
        if (!codeFromUrl) return;
        getData(`public/clients/${codeFromUrl}`)
            .then((res) => {
                const c = res.client;
                setBranding({
                    companyName: c.companyName || c.name,
                    logoUrl: c.logoUrl ? `${BACKEND}${c.logoUrl}` : "",
                    primaryColor: c.branding?.primaryColor || "#2264E5",
                    accentColor: c.branding?.accentColor || "#f47f6b",
                });
                const root = document.documentElement;
                root.style.setProperty("--primary", c.branding?.primaryColor || "#2264E5");
                root.style.setProperty("--accentColor", c.branding?.accentColor || "#f47f6b");
            })
            .catch(() => { /* unknown code → generic page */ });
    }, [codeFromUrl]);
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<LoginFormValues>({
        defaultValues: {
            code: codeFromUrl || "",
            userId: "",
            password: "",
            canteen: null,
        },
    });

    const [showPassword, setShowPassword] = useState(false);
    const [loginError, setLoginError] = useState("");

    const onSubmit = async (data: LoginFormValues) => {
        setLoginError("");
        try {
            const res = await postData("auth/login", {
                code: (data.code || "").trim().toLowerCase(),
                userId: data.userId,
                password: data.password,
            });
            setSession(res.token, res.user);
            await refreshSettings();
            navigate(res.user?.mustChangePassword ? "/change-password" : "/issueCounter/dashboard");
        } catch (err: any) {
            setLoginError(err?.message || "Login failed. Please try again.");
        }
    };

    return (
        <>
            <div className="issue-counter section d-flex align-items-center justify-content-center min-vh-100">
                <div className="container-fluid p-0">
                    <div className="row align-items-center min-vh-100 g-0">
                        <div className="col-lg-7 d-none d-lg-flex justify-content-center align-items-center min-vh-100">
                            <img
                                src={LoginBannerImage}
                                className="img-fluid login-banner w-100 h-100 object-fit-cover"
                                alt="Login Banner"
                                style={{ objectFit: "cover", maxHeight: "100vh" }}
                            />
                        </div>
                        <div className="col-12 col-lg-5 d-flex justify-content-center align-items-center min-vh-100">
                            <div className="login-card w-100 px-3 px-md-4 px-lg-5">
                                <div className="card border-0 shadow rounded-4 w-100">
                                    <div className="card-body p-3 p-sm-4 p-md-5">

                                        <div className="text-center mb-3 mb-md-5">
                                            <img src={branding?.logoUrl || Logo} height={80} className="img-fluid" style={{ maxHeight: "120px" }} alt="Logo" />
                                            {branding?.companyName && (
                                                <h5 className="fw-semibold mt-3 mb-0" style={{ color: "var(--titleColor)" }}>{branding.companyName}</h5>
                                            )}
                                        </div>

                                        <form onSubmit={handleSubmit(onSubmit)}>
                                            <div className="mb-3 mb-md-4 mb-lg-5">
                                                <Controller
                                                    name="code"
                                                    control={control}
                                                    rules={{ required: "Business code is required" }}
                                                    render={({ field }) => (
                                                        <InputText
                                                            {...field}
                                                            className="form-control login-input-height"
                                                            placeholder="Business Code"
                                                            readOnly={!!codeFromUrl}
                                                        />
                                                    )}
                                                />

                                                <div className="error-holder">
                                                    {errors.code && (
                                                        <small className="text-danger">
                                                            {errors.code.message}
                                                        </small>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mb-3 mb-md-4 mb-lg-5">
                                                <Controller
                                                    name="userId"
                                                    control={control}
                                                    rules={{ required: "User ID is required" }}
                                                    render={({ field }) => (
                                                        <InputText
                                                            {...field}
                                                            className="form-control login-input-height"
                                                            placeholder="Enter User ID"
                                                        />
                                                    )}
                                                />

                                                <div className="error-holder">
                                                    {errors.userId && (
                                                        <small className="text-danger">
                                                            {errors.userId.message}
                                                        </small>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mb-3 mb-md-4 mb-lg-5">
                                                <div className="position-relative">
                                                    <Controller
                                                        name="password"
                                                        control={control}
                                                        rules={{
                                                            required: "Password is required",
                                                            minLength: {
                                                                value: 6,
                                                                message: "Minimum 6 characters",
                                                            },
                                                        }}
                                                        render={({ field }) => (
                                                            <InputText
                                                                {...field}
                                                                type={showPassword ? "text" : "password"}
                                                                className="form-control login-input-height pe-5"
                                                                placeholder="Password"
                                                            />
                                                        )}
                                                    />

                                                    <span className="password-toggle"
                                                        onClick={() => setShowPassword(!showPassword)} >
                                                        <Icons iconName={showPassword ? "eye_closed" : "eye_open"} className="icon-18 bill-date-icon me-2" />
                                                    </span>
                                                </div>

                                                <div className="error-holder">
                                                    {errors.password && (
                                                        <small className="text-danger">
                                                            {errors.password.message}
                                                        </small>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="error-holder text-center mb-2">
                                                {loginError && (
                                                    <small className="text-danger">{loginError}</small>
                                                )}
                                            </div>

                                            <button
                                                type="submit"
                                                className="btn w-100 rounded-pill py-2 py-md-3 login-btn"
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

                    </div>
                </div>

            </div>

            {/* Add this CSS to your global stylesheet or component */}
            <style>{`
                @media (max-width: 768px) {
                    .login-card {
                        max-width: 90%;
                        margin: 1rem auto;
                    }
                    .login-input-height {
                        height: 45px !important;
                        font-size: 14px !important;
                    }
                    .login-btn {
                        font-size: 14px !important;
                    }
                }
                
                @media (min-width: 769px) and (max-width: 1024px) {
                    .login-card {
                        max-width: 80%;
                    }
                    .login-input-height {
                        height: 50px !important;
                    }
                }
                
                @media (min-width: 1025px) {
                    .login-card {
                        max-width: 100%;
                    }
                    .login-input-height {
                        height: 55px !important;
                    }
                }
                
                .object-fit-cover {
                    object-fit: cover;
                }
                
                .min-vh-100 {
                    min-height: 100vh;
                }
            `}</style>
        </>
    );
};

export default Login;