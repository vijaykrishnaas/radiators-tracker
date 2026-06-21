import { SelectOption } from "../../../../Types/common";

export interface LoginFormValues {
    code: string;
    userId: string;
    password: string;
    canteen: SelectOption | null;
}
