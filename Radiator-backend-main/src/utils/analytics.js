// Pending = what customers still owe: gross revenue minus discounts given minus
// what was collected. Never negative.
export function pendingNetOfDiscount({ totalRevenue = 0, totalCollected = 0, totalDiscount = 0 } = {}) {
  return Math.max((Number(totalRevenue) || 0) - (Number(totalDiscount) || 0) - (Number(totalCollected) || 0), 0);
}
