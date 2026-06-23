import React, { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import InputText from "../../../Components/InputText";
import Icons from "../../../Components/Icons";
import { useNavigate, useParams } from "react-router-dom";
import { LoginFormValues } from "./Types/Index";
import { getData, postData } from "../../../Services/ApiServices";
import { setSession } from "../../../Services/Auth";
import { useSettings } from "../../../Context/SettingsContext";

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";

type LoginBranding = {
    companyName: string;
    logoUrl: string;
    loginBgUrl: string;
    loginHighlights: string[];
    primaryColor: string;
    accentColor: string;
};

const DEFAULT_HIGHLIGHTS = [
    "Billing, expenses & bonuses in one place",
    "Every payment, tracked",
    "Your workshop, organized",
];

const greetingFor = (hour: number) =>
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

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
                    loginBgUrl: c.loginBgUrl ? `${BACKEND}${c.loginBgUrl}` : "",
                    loginHighlights: Array.isArray(c.loginHighlights) ? c.loginHighlights.filter(Boolean) : [],
                    primaryColor: c.branding?.primaryColor || "#2264E5",
                    accentColor: c.branding?.accentColor || "#f47f6b",
                });
                const root = document.documentElement;
                root.style.setProperty("--primary", c.branding?.primaryColor || "#2264E5");
                root.style.setProperty("--accentColor", c.branding?.accentColor || "#f47f6b");
                document.title = (c.companyName || c.name || "Radiator Management");
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

    // --- Dynamic background + contextual presentation (no auth logic) ---
    const greeting = useMemo(() => greetingFor(new Date().getHours()), []);
    // White-label: use the client's uploaded background if present, otherwise a
    // clean brand-colour gradient (no Sri Velavan default image).
    const hasBg = !!branding?.loginBgUrl;
    const initials = (branding?.companyName || "")
        .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    const highlights = branding?.loginHighlights?.length ? branding.loginHighlights : DEFAULT_HIGHLIGHTS;
    const [hi, setHi] = useState(0);
    useEffect(() => {
        if (highlights.length <= 1) return;
        const id = setInterval(() => setHi((i) => (i + 1) % highlights.length), 4200);
        return () => clearInterval(id);
    }, [highlights.length]);

    return (
        <div className="login-shell">
            <div
                className={`login-bg${hasBg ? "" : " login-bg--gradient"}`}
                style={hasBg ? { backgroundImage: `url("${branding!.loginBgUrl}")` } : undefined}
                aria-hidden="true"
            />
            <div className="login-bg-overlay" aria-hidden="true" />

            <div className="login-content">
                {/* Left brand panel — over the dynamic background */}
                <div className="login-brand-panel">
                    <div className="login-eyebrow">{greeting}</div>
                    <h1 className="login-headline">{branding?.companyName || "Welcome back"}</h1>
                    <div className="login-rotator-wrap">
                        <p key={hi} className="login-rotator">{highlights[hi]}</p>
                    </div>
                </div>

                {/* Right glass form card */}
                <div className="login-card-col">
                    <div className="login-glass-card">
                        <div className="login-card-head">
                            {branding?.logoUrl ? (
                                <img src={branding.logoUrl} className="login-logo" alt="Logo" />
                            ) : (
                                <div className="login-logo-placeholder" aria-hidden="true">{initials || "•"}</div>
                            )}
                            {branding?.companyName && (
                                <h2 className="login-company">{branding.companyName}</h2>
                            )}
                            <p className="login-subtitle">Sign in to continue</p>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} noValidate>
                            <div className="login-field">
                                <label className="login-label">Business Code</label>
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
                                    {errors.code && <small className="text-danger">{errors.code.message}</small>}
                                </div>
                            </div>

                            <div className="login-field">
                                <label className="login-label">User ID</label>
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
                                    {errors.userId && <small className="text-danger">{errors.userId.message}</small>}
                                </div>
                            </div>

                            <div className="login-field">
                                <label className="login-label">Password</label>
                                <div className="position-relative">
                                    <Controller
                                        name="password"
                                        control={control}
                                        rules={{
                                            required: "Password is required",
                                            minLength: { value: 6, message: "Minimum 6 characters" },
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
                                className="btn w-100 rounded-pill login-btn"
                                disabled={isSubmitting}
                                style={{ backgroundColor: "var(--accentColor)", color: "#fff" }}
                            >
                                {isSubmitting ? "Logging in..." : "LOGIN"}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            <style>{`
                .login-shell {
                    position: relative;
                    min-height: 100vh;
                    width: 100%;
                    overflow: hidden;
                    background: #0b0d12;
                }
                .login-bg {
                    position: absolute;
                    inset: -4%;
                    background-size: cover;
                    background-position: center;
                    transform: scale(1.04);
                    animation: loginKenBurns 26s ease-in-out infinite alternate;
                    will-change: transform;
                }
                /* No uploaded image → clean brand-colour gradient (white-label default). */
                .login-bg--gradient {
                    background-image: linear-gradient(135deg, var(--primary) 0%, var(--accentColor) 100%);
                    animation: none;
                    transform: none;
                    inset: 0;
                }
                .login-bg-overlay {
                    position: absolute;
                    inset: 0;
                    background:
                        linear-gradient(105deg, rgba(8,11,18,0.72) 0%, rgba(8,11,18,0.45) 42%, rgba(8,11,18,0.12) 100%),
                        linear-gradient(180deg, color-mix(in srgb, var(--primary) 30%, transparent) 0%, color-mix(in srgb, var(--accentColor) 22%, transparent) 100%);
                }
                .login-content {
                    position: relative;
                    z-index: 2;
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    gap: 24px;
                    padding: 48px clamp(24px, 6vw, 96px);
                }
                .login-brand-panel {
                    flex: 1 1 auto;
                    max-width: 620px;
                    color: #fff;
                }
                .login-eyebrow {
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.18em;
                    opacity: 0.85;
                    margin-bottom: 18px;
                }
                .login-headline {
                    font-family: 'inter-bold', 'inter', sans-serif;
                    font-weight: 700;
                    font-size: clamp(36px, 5vw, 60px);
                    line-height: 1.05;
                    letter-spacing: -0.03em;
                    margin: 0 0 22px;
                    text-shadow: 0 2px 30px rgba(0,0,0,0.35);
                }
                .login-rotator-wrap { min-height: 30px; }
                .login-rotator {
                    font-size: clamp(16px, 1.6vw, 20px);
                    font-weight: 500;
                    opacity: 0.92;
                    margin: 0;
                    animation: loginFade 4.2s ease-in-out both;
                }
                .login-card-col {
                    flex: 0 0 auto;
                    width: 100%;
                    max-width: 420px;
                    margin-left: auto;
                }
                .login-glass-card {
                    background: rgba(255,255,255,0.86);
                    -webkit-backdrop-filter: blur(22px) saturate(140%);
                    backdrop-filter: blur(22px) saturate(140%);
                    border: 1px solid rgba(255,255,255,0.55);
                    border-radius: 20px;
                    box-shadow: 0 24px 60px -20px rgba(8,11,18,0.55);
                    padding: clamp(28px, 3vw, 44px);
                }
                .login-card-head { text-align: center; margin-bottom: 28px; }
                .login-logo { height: 64px; max-height: 96px; object-fit: contain; }
                /* Neutral logo placeholder (client initials) when no logo is uploaded. */
                .login-logo-placeholder {
                    width: 64px;
                    height: 64px;
                    margin: 0 auto;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-family: 'inter-bold', 'inter', sans-serif;
                    font-weight: 700;
                    font-size: 24px;
                    letter-spacing: 0.02em;
                    color: var(--primary);
                    background: color-mix(in srgb, var(--primary) 12%, #fff);
                    border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
                }
                .login-company {
                    font-family: 'inter-bold', 'inter', sans-serif;
                    font-weight: 700;
                    font-size: 19px;
                    letter-spacing: -0.01em;
                    color: var(--ink-900, #0a0b0d);
                    margin: 14px 0 2px;
                }
                .login-subtitle {
                    font-size: 13px;
                    color: var(--ink-400, #8a9098);
                    margin: 0;
                }
                .login-field { margin-bottom: 14px; }
                .login-label {
                    display: block;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: var(--ink-400, #8a9098);
                    margin-bottom: 6px;
                }
                .login-input-height { height: 46px !important; }
                .login-btn {
                    height: 48px;
                    font-weight: 600;
                    letter-spacing: 0.04em;
                    margin-top: 8px;
                    border: 0 !important;
                }
                .login-btn:hover { filter: brightness(0.96); }
                .password-toggle {
                    position: absolute;
                    top: 50%;
                    right: 6px;
                    transform: translateY(-50%);
                    cursor: pointer;
                }
                .error-holder { min-height: 18px; padding-top: 3px; }

                @keyframes loginKenBurns {
                    from { transform: scale(1.04) translate(0, 0); }
                    to   { transform: scale(1.12) translate(-1.5%, -1.5%); }
                }
                @keyframes loginFade {
                    0%   { opacity: 0; transform: translateY(6px); }
                    14%  { opacity: 0.92; transform: translateY(0); }
                    86%  { opacity: 0.92; transform: translateY(0); }
                    100% { opacity: 0; transform: translateY(-6px); }
                }
                @media (prefers-reduced-motion: reduce) {
                    .login-bg { animation: none; transform: scale(1.04); }
                    .login-rotator { animation: none; opacity: 0.92; }
                }
                @media (max-width: 991px) {
                    .login-brand-panel { display: none; }
                    .login-content { justify-content: center; padding: 24px; }
                    .login-card-col { margin: 0 auto; }
                }
            `}</style>
        </div>
    );
};

export default Login;
