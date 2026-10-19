import React from "react";
import { ActionMenu, type MenuItem } from "./ui/Menu";

export type RowAction = {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    /** Visible reason under a disabled item, e.g. "Fully paid" (spec §4.11). */
    reason?: string;
};

/**
 * Row "more" menu (spec §4.11). Rendered in a portal so table overflow never clips it.
 * Destructive items are separated from the rest by a divider.
 */
const RowActions: React.FC<{ items: RowAction[]; ariaLabel?: string }> = ({ items, ariaLabel = "Row actions" }) => {
    const safe = items.filter((i) => !i.danger);
    const danger = items.filter((i) => i.danger);
    const menu: MenuItem[] = [
        ...safe,
        ...(safe.length && danger.length ? [{ divider: true } as const] : []),
        ...danger,
    ];
    return <ActionMenu items={menu} label={ariaLabel} />;
};

export default RowActions;
