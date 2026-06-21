// Session helpers — single source of truth for the JWT and logged-in user.

const TOKEN_KEY = "svr_token";
const USER_KEY = "svr_user";

export type SessionUser = {
    userId: string;
    name: string;
    role: string;
    clientId?: string;
    code?: string;
    companyName?: string;
    mustChangePassword?: boolean;
};

export const setSession = (token: string, user: SessionUser) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const getUser = (): SessionUser | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

export const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
};

export const isLoggedIn = (): boolean => !!getToken();

export const isSuperAdmin = (): boolean => getUser()?.role === "superadmin";
