/*
 * Pure number formatting (ES5-safe: no toLocaleString).
 */

export const PLACEHOLDER = "--";

/** 8348 → "8,348"; undefined/null/NaN → "--" */
export function formatInt(n) {
  if (n === undefined || n === null || n !== n) return PLACEHOLDER;
  const s = "" + Math.round(n);
  let out = "";
  for (let i = s.length - 1, c = 0; i >= 0; i--, c++) {
    const ch = s.charAt(i);
    if (c > 0 && c % 3 === 0 && ch !== "-") out = "," + out;
    out = ch + out;
  }
  return out;
}

/** metres → "5.2" (km or mi, one decimal) */
export function formatDistance(metres, unitSystem) {
  if (metres === undefined || metres === null) return PLACEHOLDER;
  const v = unitSystem === "us" ? metres / 1609.344 : metres / 1000;
  return (Math.round(v * 10) / 10).toFixed(1);
}

/** 0..1 progress towards a goal; 0 when the goal is unknown. */
export function progress(value, goal) {
  if (!goal || value === undefined || value === null) return 0;
  const p = value / goal;
  return p < 0 ? 0 : p > 1 ? 1 : p;
}
