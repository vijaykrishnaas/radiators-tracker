// Super-admin portal API calls. Uses the shared axios instance, so the stored
// JWT (a super-admin token) is attached automatically by the request interceptor.
import { getData, postData, patchData, deleteData } from "./ApiServices";

export type ClientRow = {
    _id: string;
    name: string;
    code: string;
    status: "active" | "suspended";
    adminUserId: string;
    lastLoginAt: string | null;
    createdAt: string;
};

export type HandoverInfo = {
    loginUrl: string;
    code: string;
    adminUserId: string;
    tempPassword: string;
};

export const adminLogin = (userId: string, password: string) =>
    postData("admin/login", { userId, password });

export const listClients = (): Promise<{ clients: ClientRow[] }> =>
    getData("admin/clients");

export const createClient = (payload: {
    name: string;
    code: string;
    adminUserId: string;
    adminPassword: string;
}): Promise<{ client: ClientRow; handover: HandoverInfo }> =>
    postData("admin/clients", payload);

export type ImportResult = { name: string; code: string; status: "created" | "skipped" | "error"; message?: string };

export const importClients = (
    clients: { name: string; code: string; adminUserId: string; adminPassword: string }[]
): Promise<{ created: number; total: number; results: ImportResult[] }> =>
    postData("admin/clients/import", { clients });

export const updateClient = (id: string, payload: { name?: string; status?: "active" | "suspended" }) =>
    patchData(`admin/clients/${id}`, payload);

export const deleteClient = (id: string) => deleteData(`admin/clients/${id}`);

export const resetClientPassword = (id: string, newPassword: string): Promise<{ handover: HandoverInfo }> =>
    postData(`admin/clients/${id}/reset-password`, { newPassword });

export const exportClient = (id: string) => getData(`admin/clients/${id}/export`);

export type ClientMeta = {
    id: string;
    name: string;
    code: string;
    status: "active" | "suspended";
    adminUserId: string;
    lastLoginAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
};

export const getClientSettings = (
    id: string
): Promise<{ client: ClientMeta; settings: any }> => getData(`admin/clients/${id}/settings`);

export type AuditEntry = {
    action: string;
    clientCode?: string;
    actorUserId?: string;
    actorRole?: string;
    at: string;
    details?: Record<string, any>;
};

export const listAudit = (
    params: { page?: number; limit?: number; clientCode?: string } = {}
): Promise<{ entries: AuditEntry[]; total: number; totalPages: number; currentPage: number }> =>
    getData("admin/audit", { params });

export const changePassword = (currentPassword: string, newPassword: string) =>
    postData("auth/change-password", { currentPassword, newPassword });
