import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { getToken, clearSession } from "./Auth";

const baseURL = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";

// Custom API error shape
export interface ApiError {
    message: string;
    [key: string]: unknown;
}

// Single configured instance — all app requests go through this.
export const api = axios.create({ baseURL });

// Attach JWT to every request
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error: AxiosError<ApiError>) => {
        const status = error.response?.status;
        const tenantInactive = (error.response?.data as ApiError | undefined)?.tenantInactive === true;
        // Session expired/invalid (401), or the tenant was suspended/deleted mid-session
        // (403 + tenantInactive) → end the session cleanly instead of leaving a broken app.
        const shouldEject =
            (status === 401 && !error.config?.url?.includes("/auth/login")) ||
            (status === 403 && tenantInactive);
        if (shouldEject) {
            clearSession();
            if (!window.location.pathname.includes("/login")) {
                window.location.href = "/issueCounter/login";
            }
        }

        if (error.code === "ERR_NETWORK") {
            error.response = {
                data: { message: "Cannot reach the server. Is the backend running?" },
                status: 0,
                statusText: "Network Error",
                headers: {},
                config: error.config!,
            } as AxiosResponse<ApiError>;
        }
        return Promise.reject(error);
    }
);

function extractError(error: unknown): ApiError {
    if (axios.isAxiosError<ApiError>(error)) {
        return error.response?.data ?? { message: error.message };
    }
    return { message: (error as Error).message || "Unknown error" };
}

/** GET request */
export const getData = async (url: string, options: AxiosRequestConfig = {}) => {
    try {
        const response = await api.get(url, options);
        return response.data;
    } catch (error: unknown) {
        throw extractError(error);
    }
};

/** GET File request */
export const getFileData = async (url: string, options: AxiosRequestConfig = {}) => {
    try {
        const response = await api.get(url, { ...options, responseType: "blob" });
        return response;
    } catch (error: unknown) {
        throw extractError(error);
    }
};

/** POST request */
export const postData = async (url: string, data: object, options: AxiosRequestConfig = {}) => {
    try {
        const response = await api.post(url, data, options);
        return response.data;
    } catch (error: unknown) {
        throw extractError(error);
    }
};

/** PUT request */
export const putData = async (url: string, updatedData: any) => {
    try {
        const isFormData = updatedData instanceof FormData;
        const response = await api.put(url, updatedData, {
            headers: isFormData
                ? { "Content-Type": "multipart/form-data" }
                : { "Content-Type": "application/json" },
        });
        return response.data;
    } catch (error: unknown) {
        throw extractError(error);
    }
};

/** DELETE request */
export const deleteData = async (url: string, body?: any) => {
    try {
        const response = await api.delete(url, { data: body });
        return response.data;
    } catch (error: unknown) {
        throw extractError(error);
    }
};

/** PATCH request */
export const patchData = async (url: string, data: object) => {
    try {
        const response = await api.patch(url, data);
        return response.data;
    } catch (error: unknown) {
        throw extractError(error);
    }
};
