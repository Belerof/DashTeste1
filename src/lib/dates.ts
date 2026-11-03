/** `shiftIso("2026-10-01", -11)` -> first day of the month 11 months earlier. */
export function shiftIso(iso: string, months: number) {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, m - 1 + months, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
