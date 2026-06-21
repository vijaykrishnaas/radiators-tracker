import type { DropdownItem } from "../Types/dropdown";

export const Bonus: DropdownItem[] = [
    { type: 1, label: 'Mechanic Bonus', navigate: '/bonus/mechanics' },
    { type: 1, label: 'Labour Bonus', navigate: '/bonus/labour' },
];


export const Dashboard: DropdownItem[] = [
    { label: 'Dashboard', navigate: '/issueCounter/dashboard' },
    { label: 'Billing',   navigate: '/issueCounter/billing' },
    { label: 'Expenses',  navigate: '/issueCounter/expenses' },
];

