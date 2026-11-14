// Super-admin portal API calls. Uses the shared axios instance, so the stored
// JWT (a super-admin token) is attached automatically by the request interceptor.
import { getData, postData, putData, patchData, deleteData } from "./ApiServices";

export type BusinessType = "radiator" | "automobile" | "engineering" | "tyre";

export type ClientRow = {
    _id: string;
    name: string;
    code: string;
    businessType?: BusinessType;
    status: "active" | "suspended";
    adminUserId: string;
    lastLoginAt: string | null;
    createdAt: string;
    whatsappEnabled?: boolean;
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
    businessType?: BusinessType;
}): Promise<{ client: ClientRow; handover: HandoverInfo }> =>
    postData("admin/clients", payload);

export type ImportResult = { name: string; code: string; status: "created" | "skipped" | "error"; message?: string };

export const importClients = (
    clients: { name: string; code: string; adminUserId: string; adminPassword: string; businessType?: BusinessType }[]
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
    params: { page?: number; limit?: number; clientCode?: string; action?: string; from?: string; to?: string; search?: string; sortBy?: string; sortDir?: string } = {}
): Promise<{ entries: AuditEntry[]; total: number; totalPages: number; currentPage: number }> =>
    getData("admin/audit", { params });

export const changePassword = (currentPassword: string, newPassword: string) =>
    postData("auth/change-password", { currentPassword, newPassword });

// Backup & restore: one file holding the chosen sections; import only adds records that are not already there.
export type BackupSection = "bills" | "inventory" | "bonuses" | "expenses" | "salary" | "settings";
export type BackupCounts = Record<BackupSection, { label: string; count: number }>;
export type BackupResult = Record<string, { label: string; added: number; alreadyThere: number; otherCompany: number; renumbered?: number; matched?: number }>;
export const getBackupSummary = (id: string) => getData(`admin/clients/${id}/backup/summary`);
export const getBackup = (id: string, sections: BackupSection[]) => getData(`admin/clients/${id}/backup`, { params: { sections: sections.join(",") } });
export const importBackupFile = (id: string, backup: unknown, sections: BackupSection[]) => postData(`admin/clients/${id}/backup/import`, { backup, sections });

// WhatsApp Business API, per client. Secrets are write-only: the server returns only a masked token.
export type WhatsAppTemplateStatus = { status: "APPROVED" | "PENDING" | "REJECTED" | "MISSING"; reason?: string };
export type WhatsAppTemplates = Record<string, WhatsAppTemplateStatus>;
export type WhatsAppAccount = {
    enabled: boolean;
    provider: "meta";
    numberType: "new" | "existing";
    phoneNumberId: string;
    wabaId: string;
    displayPhone: string;
    verifiedName: string;
    hasToken: boolean;
    hasAppSecret: boolean;
    tokenMasked: string;
    templates: WhatsAppTemplates;
    enabledAt: string | null;
};
export type WhatsAppUsage = { month: string; byKind: Record<string, { sent: number; failed: number }>; total: { sent: number; failed: number } | number };
export type WhatsAppSaveBody = {
    enabled: boolean; provider: string; numberType: "new" | "existing"; phoneNumberId: string; wabaId: string; accessToken?: string; appSecret?: string;
};
export const getClientWhatsApp = (id: string): Promise<{ account: WhatsAppAccount | null }> => getData(`admin/clients/${id}/whatsapp`);
export const saveClientWhatsApp = (id: string, body: WhatsAppSaveBody): Promise<{ message?: string; account: WhatsAppAccount }> => putData(`admin/clients/${id}/whatsapp`, body);
export const removeClientWhatsApp = (id: string) => deleteData(`admin/clients/${id}/whatsapp`);
export const testClientWhatsApp = (id: string): Promise<{ displayPhone: string; verifiedName: string }> => postData(`admin/clients/${id}/whatsapp/test`, {});
export const syncClientWhatsAppTemplates = (id: string): Promise<{ templates: WhatsAppTemplates }> => postData(`admin/clients/${id}/whatsapp/templates`, {});
export const getClientWhatsAppUsage = (id: string, month?: string): Promise<WhatsAppUsage> =>
    getData(`admin/clients/${id}/whatsapp/usage`, month ? { params: { month } } : {});
