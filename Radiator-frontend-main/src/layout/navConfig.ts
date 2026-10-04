import type { AppSettings } from "../Context/SettingsContext";

export type NavLeaf = {
    id: string;
    label: string;
    to: string;
    icon?: string;
    /** Extra path prefixes / patterns that keep this item active (spec §3.2.5). */
    match: (path: string) => boolean;
};
export type NavParent = { id: string; label: string; icon: string; children: NavLeaf[] };
export type NavItem = NavLeaf | NavParent;
export type NavGroup = { title: string; items: NavItem[] };

export const isParent = (i: NavItem): i is NavParent => "children" in i;

const exact = (p: string) => (path: string) => path === p;
const prefix = (...ps: string[]) => (path: string) => ps.some((p) => path === p || path.startsWith(`${p}/`));

export const verticalBase = (s: AppSettings) =>
    s.businessType === "engineering" ? "/engineering" : s.businessType === "automobile" ? "/automobile" : "/issueCounter";

/** Tenant navigation per vertical (spec §3.2.4). Labels keep their current text. */
export function tenantNav(s: AppSettings): NavGroup[] {
    const v = verticalBase(s);
    const isEngineering = s.businessType === "engineering";
    const workerName = (s.businessType === "automobile" ? s.automobile?.labels?.worker : s.labels?.worker) || "Labour";
    const workerBonusLabel = `${workerName.replace(/\s*Name$/i, "")} Bonus`;

    const menu: NavItem[] = [
        { id: "dashboard", label: "Dashboard", to: `${v}/dashboard`, icon: "grid", match: exact(`${v}/dashboard`) },
        { id: "bills", label: "Bills", to: `${v}/billing`, icon: "receipt-text", match: prefix(`${v}/billing`, `${v}/dashboard/create`, `${v}/dashboard/view`, `${v}/dashboard/edit`) },
    ];
    if (!isEngineering) {
        menu.push({ id: "expenses", label: "Expenses", to: "/issueCounter/expenses", icon: "wallet", match: exact("/issueCounter/expenses") });
        menu.push({
            id: "bonus", label: "Bonus", icon: "trending-up", children: [
                { id: "bonus-mech", label: "Mechanic Bonus", to: "/bonus/mechanics", match: prefix("/bonus/mechanics") },
                { id: "bonus-labour", label: workerBonusLabel, to: "/bonus/labour", match: prefix("/bonus/labour") },
            ],
        });
        menu.push({
            id: "salary", label: "Salary", icon: "users", children: [
                { id: "salary-emp", label: "Employees", to: "/salary/employees", match: exact("/salary/employees") },
                { id: "salary-settle", label: "Settle Salary", to: "/salary/settle", match: exact("/salary/settle") },
            ],
        });
    } else {
        menu.push({ id: "bonus", label: "Bonus", to: "/bonus/mechanics", icon: "trending-up", match: prefix("/bonus/mechanics") });
    }

    return [
        { title: "Menu", items: menu },
        {
            title: "Manage", items: [
                { id: "settings", label: "Settings", to: "/settings", icon: "settings", match: exact("/settings") },
                { id: "audit", label: "Activity Log", to: "/audit", icon: "history", match: exact("/audit") },
            ],
        },
    ];
}

export const adminNav: NavGroup[] = [
    {
        title: "Console", items: [
            { id: "clients", label: "Clients", to: "/admin/clients", icon: "users", match: exact("/admin/clients") },
            { id: "audit", label: "Audit", to: "/admin/audit", icon: "history", match: exact("/admin/audit") },
        ],
    },
];

export const parentActive = (p: NavParent, path: string) => p.children.some((c) => c.match(path));
