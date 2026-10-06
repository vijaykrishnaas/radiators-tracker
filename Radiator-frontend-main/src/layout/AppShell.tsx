import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Icons from "../Components/Icons";
import { Popover, MenuItems, type MenuItem } from "../Components/ui/Menu";
import { useThemePref, type ThemePref } from "../theme/themeMode";
import { storage, trapTab, useDesktopShell, useDocumentKeydown, useScrollLock } from "../Components/ui/hooks";
import { isParent, parentActive, type NavGroup, type NavItem } from "./navConfig";

const BACKEND = import.meta.env.VITE_BACKEND_BASE_URL || "http://localhost:5000";
export const resolveAsset = (url?: string) => (!url ? "" : url.startsWith("/") ? `${BACKEND}${url}` : url);
export const initialsOf = (name: string) =>
    name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export type ShellBrand = {
    name: string;
    sub?: string;
    logoUrl?: string;
    /** Custom brand mark (super admin shield). */
    mark?: React.ReactNode;
    homeTo: string;
};

export type ShellUser = {
    name: string;
    meta: string;
    items: MenuItem[];
};

function Brand({ brand, inHeader = false }: { brand: ShellBrand; inHeader?: boolean }) {
    const logo = resolveAsset(brand.logoUrl);
    const tile = brand.mark ?? <span className="initials-tile" aria-hidden="true">{initialsOf(brand.name) || <Icons iconName="grid" />}</span>;
    if (inHeader) {
        return (
            <Link to={brand.homeTo} className="app-header-brand" aria-label={brand.name || "Home"}>
                {logo ? <img src={logo} alt="" /> : tile}
            </Link>
        );
    }
    return (
        <Link to={brand.homeTo} className={`sidebar-brand${logo ? " has-logo" : ""}`} title={brand.name}>
            {tile}
            {logo && <img className="sidebar-brand-logo" src={logo} alt="" />}
            <span className="sidebar-brand-text sidebar-brand-name">
                {brand.name}
                {brand.sub && <span className="sidebar-brand-sub">{brand.sub}</span>}
            </span>
        </Link>
    );
}

function NavEntry({ item, path, openSection, setOpenSection }: {
    item: NavItem; path: string; openSection: string | null; setOpenSection: (id: string | null) => void;
}) {
    if (!isParent(item)) {
        const active = item.match(path);
        return (
            <li>
                <Link to={item.to} className={`sidebar-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined} title={item.label}>
                    {item.icon && <Icons iconName={item.icon} className="sidebar-icon" />}
                    <span className="sidebar-label">{item.label}</span>
                </Link>
            </li>
        );
    }
    const active = parentActive(item, path);
    const open = openSection === item.id;
    const subId = `nav-sub-${item.id}`;
    return (
        <li>
            <button type="button" className={`sidebar-item${active ? " is-active" : ""}`} aria-expanded={open} aria-controls={subId}
                title={item.label} onClick={() => setOpenSection(open ? null : item.id)}>
                <Icons iconName={item.icon} className="sidebar-icon" />
                <span className="sidebar-label">{item.label}</span>
                <Icons iconName="chevron-down" className="sidebar-chevron" />
            </button>
            {open && (
                <ul className="sidebar-sub" id={subId}>
                    {item.children.map((c) => {
                        const a = c.match(path);
                        return (
                            <li key={c.id}>
                                <Link to={c.to} className={`sidebar-item${a ? " is-active" : ""}`} aria-current={a ? "page" : undefined}>
                                    <span className="sidebar-label">{c.label}</span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </li>
    );
}

/** Spec §3.2 — fixed sidebar (rail at ≥1280, drawer below), sticky header, page container. */
export default function AppShell({ nav, brand, user, children }: {
    nav: NavGroup[]; brand: ShellBrand; user: ShellUser; children: React.ReactNode;
}) {
    const location = useLocation();
    const path = location.pathname;
    const desktop = useDesktopShell();
    const [desktopCollapsed, setDesktopCollapsed] = useState(() => storage.get("sidebarCollapsed") === "1");
    const [mobileOpen, setMobileOpen] = useState(false);
    const sidebarRef = useRef<HTMLElement>(null);
    const toggleRef = useRef<HTMLButtonElement>(null);

    // Accordion: one open section; persisted; the section holding the active route opens on navigation.
    const [openSection, setOpenSectionState] = useState<string | null>(() => storage.get("sidebarOpenSection"));
    const setOpenSection = useCallback((id: string | null) => {
        setOpenSectionState(id);
        storage.set("sidebarOpenSection", id || "");
    }, []);
    useEffect(() => {
        for (const g of nav) for (const i of g.items) if (isParent(i) && parentActive(i, path)) setOpenSection(i.id);
    }, [path, nav, setOpenSection]);

    // Drawer: closes on route change; Esc; focus trapped; returns to the toggle.
    useEffect(() => { setMobileOpen(false); }, [path]);
    useEffect(() => { if (desktop) setMobileOpen(false); }, [desktop]);
    useScrollLock(mobileOpen && !desktop);
    useEffect(() => {
        if (!mobileOpen) return;
        setTimeout(() => sidebarRef.current?.querySelector<HTMLElement>(".sidebar-close")?.focus(), 0);
        return () => { setTimeout(() => toggleRef.current?.focus(), 0); };
    }, [mobileOpen]);

    // Drawer keyboard handling at document level, so it works even when focus fell back to <body>.
    useDocumentKeydown(mobileOpen && !desktop, (e) => {
        if (e.key === "Escape") { setMobileOpen(false); return; }
        trapTab(e, sidebarRef.current);
    });

    const toggle = () => {
        if (desktop) {
            const next = !desktopCollapsed;
            setDesktopCollapsed(next);
            storage.set("sidebarCollapsed", next ? "1" : "0");
        } else {
            setMobileOpen((o) => !o);
        }
    };

    const drawer = !desktop;
    return (
        <div className={`app-shell${desktopCollapsed ? " is-collapsed" : ""}`}>
            <a href="#main" className="visually-hidden-focusable btn btn-primary position-fixed m-2" style={{ zIndex: 2000 }}>Skip to content</a>
            <aside
                id="app-sidebar"
                ref={sidebarRef}
                className={`app-sidebar${mobileOpen ? " is-open" : ""}`}
                aria-label="Main navigation"
                tabIndex={-1}
                {...(drawer ? { role: "dialog", "aria-modal": mobileOpen ? true : undefined } : {})}
            >
                <div className="d-flex align-items-center">
                    <Brand brand={brand} />
                    {drawer && (
                        <button type="button" className="btn btn-icon sidebar-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                            <Icons iconName="x" />
                        </button>
                    )}
                </div>
                <nav className="sidebar-nav">
                    {nav.map((g) => (
                        <div key={g.title}>
                            <h2 className="sidebar-group-title">
                                <span className="sidebar-group-text">{g.title}</span>
                                <Icons iconName="more-h" className="sidebar-group-dots" />
                            </h2>
                            <ul className="sidebar-menu">
                                {g.items.map((i) => <NavEntry key={i.id} item={i} path={path} openSection={openSection} setOpenSection={setOpenSection} />)}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>
            {drawer && mobileOpen && <div className="app-backdrop" onClick={() => setMobileOpen(false)} aria-hidden="true" />}

            <div className="app-main">
                <header className="app-header">
                    <div className="app-header-left">
                        <button ref={toggleRef} type="button" className="btn btn-icon app-toggle" aria-label="Toggle sidebar"
                            aria-controls="app-sidebar" aria-expanded={desktop ? !desktopCollapsed : mobileOpen} onClick={toggle}>
                            <Icons iconName="menu" />
                        </button>
                        <Brand brand={brand} inHeader />
                    </div>
                    <UserMenu user={user} />
                </header>
                <main id="main" className="app-page" tabIndex={-1}>{children}</main>
            </div>
        </div>
    );
}

// Light / Dark / System, remembered on this device. Inside the account menu these are menuitemradio items, so the
// menu's own arrow-key navigation moves between them (and on to Settings / Logout) without changing the theme;
// Enter / Space / click picks one and leaves the menu open.
const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "system", label: "System" },
];
function ThemeSwitch() {
    const [pref, setPref] = useThemePref();
    return (
        <div className="user-menu-theme" role="presentation">
            <span className="user-menu-theme-label" aria-hidden="true">Theme</span>
            <div className="segmented is-full" role="group" aria-label="Theme">
                {THEME_OPTIONS.map((o) => (
                    <button
                        key={o.value}
                        type="button"
                        role="menuitemradio"
                        aria-checked={pref === o.value}
                        data-menu-item=""
                        className="segmented-btn"
                        onClick={() => setPref(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function UserMenu({ user }: { user: ShellUser }) {
    return (
        <Popover
            role="menu"
            label="Account"
            width={260}
            offset={17}
            trigger={(p) => (
                <button type="button" className="user-trigger" aria-label={`Account menu for ${user.name}`} {...p}>
                    <span className="user-avatar" aria-hidden="true">{initialsOf(user.name) || "U"}</span>
                    <span className="user-name">{user.name}</span>
                    <Icons iconName="chevron-down" className="user-chevron" />
                </button>
            )}
        >
            {(close) => (
                <>
                    <div className="user-menu-head" role="presentation">
                        <strong>{user.name}</strong>
                        <span>{user.meta}</span>
                    </div>
                    <ThemeSwitch />
                    <MenuItems items={user.items} close={close} />
                </>
            )}
        </Popover>
    );
}

