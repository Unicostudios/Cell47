/*
 * Pure time/date formatting. No Fitbit imports, so it is unit-testable and
 * the rendering code never has to know about formats.
 *
 * Note: Fitbit's JS runtime is ES5.1 — no Intl, no toLocaleString options,
 * no String.prototype.padStart. Names below are English; translate in place.
 */

const DAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
];

export function pad2(n) {
  return n < 10 ? "0" + n : "" + n;
}

function titleCase(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

/**
 * @param {Date} date
 * @param {boolean} use24h
 * @param {{padHour24: boolean, padHour12: boolean}} opts
 * @returns {string} e.g. "12:58"
 */
export function formatTime(date, use24h, opts) {
  let h = date.getHours();
  let pad;
  if (use24h) {
    pad = opts.padHour24;
  } else {
    h = h % 12 || 12;
    pad = opts.padHour12;
  }
  return (pad ? pad2(h) : "" + h) + ":" + pad2(date.getMinutes());
}

// Longest tokens first so "MMMM" wins over "MMM" wins over "MM" wins over "M".
const TOKEN_RE = /dddd|ddd|DD|D|MMMM|MMM|MM|M|YYYY/g;

/**
 * @param {Date} date
 * @param {string} pattern see settings.js DATE.format
 * @param {boolean} uppercase
 */
export function formatDate(date, pattern, uppercase) {
  const out = pattern.replace(TOKEN_RE, function (token) {
    switch (token) {
      case "dddd": return titleCase(DAYS[date.getDay()]);
      case "ddd": return titleCase(DAYS[date.getDay()].slice(0, 3));
      case "DD": return pad2(date.getDate());
      case "D": return "" + date.getDate();
      case "MMMM": return titleCase(MONTHS[date.getMonth()]);
      case "MMM": return titleCase(MONTHS[date.getMonth()].slice(0, 3));
      case "MM": return pad2(date.getMonth() + 1);
      case "M": return "" + (date.getMonth() + 1);
      case "YYYY": return "" + date.getFullYear();
    }
    return token;
  });
  return uppercase ? out.toUpperCase() : out;
}

/** Key that changes once per calendar day — used to skip redundant date redraws. */
export function dayKey(date) {
  return date.getFullYear() * 10000 + date.getMonth() * 100 + date.getDate();
}
