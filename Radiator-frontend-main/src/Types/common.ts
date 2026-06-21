import { ReactNode } from "react";

export type IconTypes = {
    iconName: string;
    className: string
};

export type ConfirmDeleteModalProps = {
    show: boolean;
    title?: string;
    message?: string | ReactNode;
    onCancel: () => void;
    onConfirm: () => void;
}
export type PaginationData = {
    totalRecords: number;
    headers?: string[];
    data?: Record<string, unknown>[];
}
export type PaginationQuery = {
    skip: number;
    limit: number;
}

export type FilterQuery = {
    filters?: Record<string, unknown>;
    search?: string;
    sort?: Record<string, 1 | -1>;
    canteenId?: string;
    date?: string;
}

export type IdName = {
    _id: string;
    name: string;
};

export type SelectOption = {
    value: string;
    label: string;
    icon?: ReactNode;
};

export type DeleteBody = {
    isSelectAll: boolean;
    unSelectList: string[];
    selectList: string[];
}