
export type DropdownItem = {
    type?: number
    label: string;
    navigate: string
};

export type DropdownProps = {
    icon?: string;
    name: string;
    data?: DropdownItem[];
    isActive?: boolean;
};
