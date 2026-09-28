/*
 * METRIC REGISTRY — the single place that maps a metric id to its data,
 * formatting and icon. The UI never talks to sensors directly; it asks this
 * registry for { text, progress, hasGoal, icon }.
 *
 * To add a metric: add an entry here, add its icon to resources/icons/,
 * then reference its id in settings.js → SLOTS.
 *
 * Entry fields:
 *   icon      path inside resources/ (grayscale PNG, tinted at runtime)
 *   value()   current raw value (number | null | undefined)
 *   goal()    daily goal, or omit for metrics without a goal (no bar shown)
 *   format(v) value → display string
 *   live      true if the value is pushed by a sensor (heart rate) rather
 *             than polled each minute
 */
import { units } from "user-settings";
import { todayValue, goalValue } from "./activity";
import { currentHeartRate } from "./heartRate";
import { formatInt, formatDistance, PLACEHOLDER } from "../core/format";

export const METRICS = {
  steps: {
    icon: "icons/steps.png",
    value: function () { return todayValue("steps"); },
    goal: function () { return goalValue("steps"); },
    format: formatInt
  },
  calories: {
    icon: "icons/calories.png",
    value: function () { return todayValue("calories"); },
    goal: function () { return goalValue("calories"); },
    format: formatInt
  },
  heartRate: {
    icon: "icons/heart.png",
    live: true,
    value: currentHeartRate,
    format: function (v) { return v ? "" + v : PLACEHOLDER; }
  },
  azm: {
    icon: "icons/azm.png",
    value: function () { return todayValue("activeZoneMinutes"); },
    goal: function () { return goalValue("activeZoneMinutes"); },
    format: formatInt
  },
  distance: {
    icon: "icons/distance.png",
    value: function () { return todayValue("distance"); },
    goal: function () { return goalValue("distance"); },
    format: function (v) {
      const us = units.distance === "us";
      const s = formatDistance(v, us ? "us" : "metric");
      return s === PLACEHOLDER ? s : s + (us ? " mi" : " km");
    }
  },
  floors: {
    icon: "icons/floors.png",
    value: function () { return todayValue("elevationGain"); },
    goal: function () { return goalValue("elevationGain"); },
    format: formatInt
  }
};

export function getMetric(id) {
  const m = METRICS[id];
  if (!m) throw new Error("Unknown metric id in settings.SLOTS: " + id);
  return m;
}
