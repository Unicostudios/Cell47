/*
 * SETTINGS — behaviour and content, independent of look.
 */

export const TIME = {
  // "system" follows the watch setting (Fitbit app → Settings → Clock display).
  // Or force "12h" / "24h".
  format: "system",
  // Leading zero on the hour ("09:41" vs "9:41"), per mode.
  padHour24: true,
  padHour12: false
};

export const DATE = {
  // Tokens: dddd = WEDNESDAY, ddd = WED, D = 3, DD = 03,
  //         MMMM = SEPTEMBER, MMM = SEP, M = 9, MM = 09, YYYY = 2026
  // Anything else is printed literally.
  dayFormat: "ddd", // top of the left column, e.g. "SAT"
  format: "D/M", // bottom of the left column, e.g. "10/11" (use "M/D" for US order)
  aodFormat: "ddd D",
  uppercase: true
};

/*
 * STATS — the four rows on the right, top → bottom.
 * Each row is a list of metric ids; tapping a row cycles through its list.
 * A row with one metric ignores taps.
 *
 * Available metric ids (see app/data/metrics.js):
 *   "calories", "heartRate", "steps", "sleep",
 *   "azm" (Active Zone Minutes), "distance", "floors"
 */
export const STATS = [
  ["calories", "azm"],
  ["heartRate"],
  ["steps", "distance", "floors"],
  ["sleep"]
];

export const SLEEP = {
  // Bar target for the SLEEP row, in minutes (8 h = 480).
  goalMinutes: 480,
  // "Last night" = sleep recorded within this many hours before now.
  windowHours: 20
};

export const SYNC = {
  // Send stats to the phone → your Notion "Fitbit Stats" page → Ops Desk.
  // Setup: Fitbit app → this clock face → Settings (README "Dashboard sync").
  enabled: true,
  intervalMinutes: 15
};

export const BATTERY = {
  show: false, // the reference face has no battery; set true to show it top-centre
  lowThreshold: 20 // % at or below which the battery turns COLORS.batteryLow
};

export const INTERACTION = {
  tapToCycle: true,
  haptics: true // short "bump" vibration when a row changes
};

export const AOD_SETTINGS = {
  // Requests Always-On Display support. Needs the watch's AOD setting ON and
  // the restricted "access_aod" permission, which Fitbit only grants to
  // partners — sideloading an app that requests it fails, so package.json
  // leaves it out. Until it's granted this mode stays off automatically.
  enabled: true,
  showDate: true
};

// Persist the selected metric of each row across clock-face restarts.
export const PERSIST_STATE = true;
