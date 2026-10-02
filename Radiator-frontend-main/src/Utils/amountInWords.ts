const ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
    "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const below100 = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`);
const below1000 = (n: number) =>
    `${n >= 100 ? ONES[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " : "") : ""}${n % 100 ? below100(n % 100) : ""}`;

// Indian numbering: thousand, lakh, crore.
const integerInWords = (n: number): string => {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${integerInWords(crore)} Crore`);
    if (lakh) parts.push(`${below100(lakh)} Lakh`);
    if (thousand) parts.push(`${below100(thousand)} Thousand`);
    if (rest) parts.push(below1000(rest));
    return parts.join(" ");
};

/** 6050 -> "Rupees Six Thousand Fifty Only"; 120.5 -> "Rupees One Hundred Twenty and Fifty Paise Only". */
export const amountInWords = (amount: number): string => {
    const safe = Math.max(Number(amount) || 0, 0);
    const rupees = Math.floor(safe);
    const paise = Math.round((safe - rupees) * 100);
    const [r, p] = paise === 100 ? [rupees + 1, 0] : [rupees, paise];
    return `Rupees ${integerInWords(r)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
};
