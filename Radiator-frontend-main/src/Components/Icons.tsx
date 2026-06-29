import React from "react";

/**
 * Clean, modern line icons (Lucide-style), rendered inline so colour follows
 * `currentColor` and size follows the existing `.icon-NN` utility classes.
 * The whole app upgrades at once because every call site already routes through
 * <Icons iconName="..." />. Unknown names fall back to a neutral dot.
 */
interface IconsProps {
    iconName: string;
    className?: string;
}

// Each entry returns the inner SVG geometry for a 24×24 viewBox.
const P: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    "plus-circle": <><circle cx="12" cy="12" r="9" /><path d="M12 8.5v7M8.5 12h7" /></>,
    x: <path d="M18 6 6 18M6 6l12 12" />,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    trash: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></>,
    edit: <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></>,
    view: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
    print: <><path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
    sheet: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M4 9h16M4 15h16M10 3v18" /></>,
    rupee: <path d="M6 3h12M6 8h12M9 3c6 0 6 9.5 0 9.5H6m0 0 8.5 8.5" />,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
    "external-link": <><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    pause: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
    play: <path d="M6 4v16l13-8Z" />,
    key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="M10.7 12.3 20 3M16 7l3 3M18 5l2 2" /></>,
    filter: <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3Z" />,
    more: <><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
    "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
    "arrow-down": <path d="M12 5v14M6 13l6 6 6-6" />,
    table: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
    tag: <><path d="M20.59 13.41 13.4 20.6a2 2 0 0 1-2.82 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" /><path d="M7 7h.01" /></>,
    calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
    qr: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7M14 21h3" /></>,
    "receipt-text": <><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 7.5h8M8 11.5h8M8 15.5h5" /></>,
    "trending-up": <><path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3.2 1.9" /></>,
    package: <><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5M12 22V12" /><path d="m7.5 4.3 9 5.15" /></>,
    dot: <circle cx="12" cy="12" r="2.2" />,
};

// Map the legacy sprite names (and the new semantic ones) onto the icon set.
const ALIAS: Record<string, string> = {
    add: "plus", addcircle: "plus-circle", modelclose: "x", delete: "trash", action_delete: "trash",
    exporticon: "sheet", entrolment_download: "download", bar_chart: "chart",
    Frame: "more", data_management: "grid", logout_user: "logout", arrow: "arrow-right",
    arrow_right: "arrow-right", table_view: "table", info_mail: "info",
    currencyrupee: "rupee", coursetype: "tag", category: "tag", semester: "calendar",
    DTM_reports: "file", CheckCircle: "check", trendingup: "trending-up", receipt: "receipt-text",
};

const Icons: React.FC<IconsProps> = ({ iconName, className }) => {
    const key = ALIAS[iconName] || iconName;
    const body = P[key] || P.dot;
    return (
        <svg className={"icons " + (className || "")} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            {body}
        </svg>
    );
};

export default Icons;
