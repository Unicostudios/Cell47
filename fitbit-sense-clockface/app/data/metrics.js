/*
 * METRIC REGISTRY — the single place that maps a metric id to its data,
 * formatting, label and icon. The UI never talks to sensors directly; it asks
 * this registry for text, progress and icon.
 *
 * To add a metric: add an entry here, add its icon to resources/icons/,
 * then reference its id in settings.js → STATS.
 *
 * Entry fields:
 *   label        row caption (UPPERCASE; must exist in the "label" glyph set)
 *   icon         path inside resources/ (grayscale PNG, tinted at runtime)
 *   value()      current raw value (number | null | undefined)
 *   progress(v)  0..1 fill of the row's bar
 *   format(v)    value → display string
 *   live         true if the value is pushed by a sensor (heart rate) rather
 *                than polled each minute
 */
import { units } from "user-settings";
import { todayValue, goalValue } from "./activity";
import { currentHeartRate } from "./heartRate";
import { sleepMinutes } from "./sleep";
import { SLEEP } from "../config/settings";
import { formatInt, formatDistance, formatDuration, progress, PLACEHOLDER } from "../core/format";

// Heart-rate bar: resting-ish to hard effort. Not a goal, just a gauge.
const HR_BAR_MIN = 40;
const HR_BAR_MAX = 190;

function towardsGoal(field) {
  return function (v) { return progress(v, goalValue(field)); };
}

export const METRICS = {
  calories: {
    label: "CALORIES",
    icon: "icons/calories.png",
    value: function () { return todayValue("calories"); },
    progress: towardsGoal("calories"),
    format: formatInt
  },
  heartRate: {
    label: "HEART RATE",
    icon: "icons/heart.png",
    live: true,
    value: currentHeartRate,
    progress: function (v) { return v ? progress(v - HR_BAR_MIN, HR_BAR_MAX - HR_BAR_MIN) : 0; },
    format: function (v) { return v ? "" + v : PLACEHOLDER; }
  },
  steps: {
    label: "STEPS",
    icon: "icons/steps.png",
    value: function () { return todayValue("steps"); },
    progress: towardsGoal("steps"),
    format: formatInt
  },
  sleep: {
    label: "SLEEP",
    icon: "icons/sleep.png",
    value: sleepMinutes,
    progress: function (v) { return progress(v, SLEEP.goalMinutes); },
    format: formatDuration
  },
  azm: {
    label: "ACTIVE MIN",
    icon: "icons/azm.png",
    value: function () { return todayValue("activeZoneMinutes"); },
    progress: towardsGoal("activeZoneMinutes"),
    format: formatInt
  },
  distance: {
    label: "DISTANCE",
    icon: "icons/distance.png",
    value: function () { return todayValue("distance"); },
    progress: towardsGoal("distance"),
    format: function (v) {
      const us = units.distance === "us";
      const s = formatDistance(v, us ? "us" : "metric");
      return s === PLACEHOLDER ? s : s + (us ? " mi" : " km");
    }
  },
  floors: {
    label: "FLOORS",
    icon: "icons/floors.png",
    value: function () { return todayValue("elevationGain"); },
    progress: towardsGoal("elevationGain"),
    format: formatInt
  }
};

export function getMetric(id) {
  const m = METRICS[id];
  if (!m) throw new Error("Unknown metric id in settings.STATS: " + id);
  return m;
}
