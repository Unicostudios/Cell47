/*
 * Daily activity (steps, calories, distance, floors, Active Zone Minutes).
 *
 * user-activity has no change event, so values are read on demand — the app
 * reads them on each minute tick and whenever the screen wakes. Reads are
 * cheap property lookups.
 */
import { me } from "appbit";
import { today, goals } from "user-activity";

const granted = me.permissions.granted("access_activity");

/** Current value of a user-activity field, or undefined if unavailable. */
export function todayValue(field) {
  if (!granted) return undefined;
  if (field === "activeZoneMinutes") {
    const azm = today.adjusted.activeZoneMinutes;
    return azm ? azm.total : undefined;
  }
  return today.adjusted[field];
}

/** Daily goal for a user-activity field, or undefined if none is set. */
export function goalValue(field) {
  if (!granted) return undefined;
  if (field === "activeZoneMinutes") {
    const azm = goals.activeZoneMinutes;
    return azm ? azm.total : undefined;
  }
  return goals[field];
}

export const activityGranted = granted;
