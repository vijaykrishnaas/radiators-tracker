import React, { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import InputText from "../../../Components/InputText";
import Icons from "../../../Components/Icons";
import { Field, BusyOverlay } from "../../../Components/ui/Basics";
import { PasswordInput } from "../../../Components/ui/Inputs";
import { applyTenantBrand, contrast, parseHex, DEFAULT_ACCENT, DEFAULT_PRIMARY } from "../../../theme/applyTenantBrand";
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
    loginTextColor: string;
};

const DEFAULT_HIGHLIGHTS = [
    "Billing, expenses & bonuses in one place",
    "Every payment, tracked",
    "Your workshop, organized",
];

const WHITE = "#FFFFFF";
// The brand panel sits on an unknown photo under a dark scrim. Worst case for the company name is the
// scrim's lightest point (rgba(8,11,18,0.12)) over white; large text needs 3:1 there, else use white.
const SCRIM_WORST_CASE: [number, number, number] = [8, 11, 18].map((c) => Math.round(c * 0.12 + 255 * 0.88)) as [number, number, number];
const readableLoginText = (hex?: string) => {
    const rgb = parseHex(hex);
    return rgb && contrast(rgb, SCRIM_WORST_CASE) >= 3 ? (hex as string) : WHITE;
};

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
        if (!codeFromUrl) { applyTenantBrand(DEFAULT_PRIMARY, DEFAULT_ACCENT); return; }
        getData(`public/clients/${codeFromUrl}`)
            .then((res) => {
                const c = res.client;
                setBranding({
                    companyName: c.companyName || c.name,
                    logoUrl: c.logoUrl ? `${BACKEND}${c.logoUrl}` : "",
                    loginBgUrl: c.loginBgUrl ? `${BACKEND}${c.loginBgUrl}` : "",
                    loginHighlights: Array.isArray(c.loginHighlights) ? c.loginHighlights.filter(Boolean) : [],
                    primaryColor: c.branding?.primaryColor || DEFAULT_PRIMARY,
                    accentColor: c.branding?.accentColor || DEFAULT_ACCENT,
                    loginTextColor: c.branding?.loginTextColor || WHITE,
                });
                applyTenantBrand(c.branding?.primaryColor, c.branding?.accentColor);
                document.documentElement.style.setProperty("--login-text-color", readableLoginText(c.branding?.loginTextColor));
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
            <BusyOverlay show={isSubmitting} label="Logging in..." />
            <div
                className={`login-bg${hasBg ? "" : " login-bg--gradient"}`}
                style={hasBg ? { backgroundImage: `url("${branding!.loginBgUrl}")` } : undefined}
                aria-hidden="true"
            />
            <div className="login-bg-overlay" aria-hidden="true" />

            <main className="login-content">
                {/* Left brand panel — over the dynamic background */}
                <div className="login-brand-panel">
                    <div className="login-eyebrow">{greeting}</div>
                    <h1 className="login-headline">{branding?.companyName || "Welcome back"}</h1>
                    <div className="login-rotator-wrap">
                        <p key={hi} className="login-rotator">{highlights[hi]}</p>
                    </div>
                </div>

                {/* Right form card */}
                <div className="login-card-col">
                    <div className="login-card">
                        <div className="login-card-head">
                            {branding?.logoUrl ? (
                                <img src={branding.logoUrl} className="login-logo" alt="" />
                            ) : (
                                <div className="login-logo-placeholder" aria-hidden="true">
                                    {initials || <Icons iconName="lock" />}
                                </div>
                            )}
                            <h2 className="login-company">{branding?.companyName || "Sign in"}</h2>
                            <p className="login-subtitle">Sign in to continue</p>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} noValidate className="d-grid gap-3">
                            <Field label="Business code" htmlFor="login-code" error={errors.code?.message}>
                                <Controller
                                    name="code"
                                    control={control}
                                    rules={{ required: "Business code is required" }}
                                    render={({ field }) => (
                                        <div className="input-icon">
                                            <InputText
                                                {...field}
                                                id="login-code"
                                                autoComplete="organization"
                                                className={codeFromUrl ? "has-right" : undefined}
                                                placeholder="Business Code"
                                                readOnly={!!codeFromUrl}
                                                aria-invalid={!!errors.code || undefined}
                                            />
                                            {codeFromUrl && <Icons iconName="lock" className="is-right icon-16" />}
                                        </div>
                                    )}
                                />
                            </Field>

                            <Field label="User ID" htmlFor="login-user" error={errors.userId?.message}>
                                <Controller
                                    name="userId"
                                    control={control}
                                    rules={{ required: "User ID is required" }}
                                    render={({ field }) => (
                                        <InputText {...field} id="login-user" autoComplete="username" placeholder="Enter User ID" aria-invalid={!!errors.userId || undefined} />
                                    )}
                                />
                            </Field>

                            <Field label="Password" htmlFor="login-password" error={errors.password?.message}>
                                <Controller
                                    name="password"
                                    control={control}
                                    rules={{
                                        required: "Password is required",
                                        minLength: { value: 6, message: "Minimum 6 characters" },
                                    }}
                                    render={({ field }) => (
                                        <PasswordInput id="login-password" value={field.value} onChange={field.onChange}
                                            autoComplete="current-password" placeholder="Password" invalid={!!errors.password} />
                                    )}
                                />
                            </Field>

                            {loginError && <p className="field-error text-center m-0" role="alert">{loginError}</p>}

                            <button type="submit" className="btn btn-accent w-100 mt-1" disabled={isSubmitting}>
                                {isSubmitting ? "Logging in..." : "LOGIN"}
                            </button>
                        </form>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Login;
