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
  format: "ddd D",
  aodFormat: "ddd D",
  uppercase: true
};

/*
 * SLOTS — what the three bottom slots display (left → right).
 * Each slot is a list of metric ids; tapping a slot cycles through its list.
 * A slot with one metric ignores taps.
 *
 * Available metric ids (see app/data/metrics.js):
 *   "steps", "calories", "heartRate", "azm" (Active Zone Minutes),
 *   "distance", "floors"
 */
export const SLOTS = [
  ["steps", "distance", "floors"],
  ["heartRate"],
  ["calories", "azm"]
];

export const BATTERY = {
  show: false, // the reference face has no battery; set true to show it top-centre
  lowThreshold: 20 // % at or below which the battery turns COLORS.batteryLow
};

export const INTERACTION = {
  tapToCycle: true,
  haptics: true // short "bump" vibration when a slot changes
};

export const AOD_SETTINGS = {
  // Requests Always-On Display support. Needs the watch's AOD setting ON and
  // the (restricted) "access_aod" permission. Falls back cleanly otherwise.
  enabled: true,
  showDate: true
};

// Persist the selected metric of each slot across clock-face restarts.
export const PERSIST_STATE = true;
