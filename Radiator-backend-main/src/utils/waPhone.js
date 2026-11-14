// Turns a typed phone number into the WhatsApp format 91XXXXXXXXXX, or null when it is not a valid Indian mobile.
// Accepts 10 digits, or a 0 / 91 / +91 prefix (mirrors phoneDigits in the tyre Create form).
export function toWaNumber(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  else if (d.length !== 12 || !d.startsWith("91")) return null;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
}
