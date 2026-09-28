/*
 * Minimal stand-ins for the Fitbit device modules used by app/.
 * They mirror only the API surface the app touches (see README → "API
 * surface"), so a typo in a property name shows up as a failed assertion.
 * State lives on globalThis.__fb so the test runner can drive it.
 */
function emitter(target) {
  const handlers = {};
  target.addEventListener = function (type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
  };
  target.__emit = function (type, evt) {
    (handlers[type] || []).forEach(function (fn) { fn(evt || {}); });
  };
  target.__handlers = handlers;
  return target;
}

const fb = (globalThis.__fb = globalThis.__fb || {});

// ---- document -------------------------------------------------------------
fb.elements = fb.elements || {}; // filled by the runner from resources/index.view
export const documentModule = {
  getElementById: function (id) { return fb.elements[id] || null; }
};

// ---- clock ----------------------------------------------------------------
export const clock = (fb.clock = emitter({ granularity: "off" }));

// ---- display --------------------------------------------------------------
export const display = (fb.display = emitter({
  on: true,
  aodActive: false,
  aodAvailable: true,
  aodAllowed: false,
  aodEnabled: true,
  autoOff: true,
  poke: function () {}
}));

// ---- appbit ---------------------------------------------------------------
fb.granted = { access_activity: true, access_heart_rate: true, access_aod: true, access_sleep: true };
export const me = {
  permissions: { granted: function (p) { return !!fb.granted[p]; } },
  appTimeoutEnabled: true
};

// ---- user-activity --------------------------------------------------------
export const today = (fb.today = {
  adjusted: { steps: 8348, calories: 1359, distance: 5230, elevationGain: 7, activeZoneMinutes: { total: 22 } },
  local: {}
});
export const goals = (fb.goals = emitter({
  steps: 10000, calories: 2400, distance: 8000, elevationGain: 10, activeZoneMinutes: { total: 22 }
}));

// ---- sensors --------------------------------------------------------------
function sensorClass(name, field) {
  return function (opts) {
    const s = emitter({ activated: false, opts: opts });
    s[field] = null;
    s.start = function () { s.activated = true; };
    s.stop = function () { s.activated = false; };
    fb[name] = s;
    return s;
  };
}
export const HeartRateSensor = sensorClass("hrm", "heartRate");
export const BodyPresenceSensor = sensorClass("body", "present");

// ---- power ----------------------------------------------------------------
export const battery = (fb.battery = emitter({ chargeLevel: 84, charging: false, timeUntilFull: 0 }));

// ---- user-settings --------------------------------------------------------
export const preferences = (fb.preferences = { clockDisplay: "12h", firstDayOfWeek: 0 });
export const units = (fb.units = { distance: "metric" });

// ---- sleep ----------------------------------------------------------------
export const sleep = (fb.sleep = emitter({ state: "asleep" }));

// ---- haptics --------------------------------------------------------------
fb.vibrations = [];
export const vibration = { start: function (p) { fb.vibrations.push(p); return true; }, stop: function () {} };

// ---- fs -------------------------------------------------------------------
fb.files = {};
export function existsSync(f) { return f in fb.files; }
export function readFileSync(f) { return JSON.parse(fb.files[f]); }
export function writeFileSync(f, data, enc) {
  if (enc !== "json") throw new Error("mock fs only supports json");
  fb.files[f] = JSON.stringify(data);
}
