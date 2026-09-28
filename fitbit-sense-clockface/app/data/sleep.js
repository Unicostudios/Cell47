/*
 * Sleep — on-watch estimate.
 *
 * Fitbit's device SDK does NOT expose sleep duration or stages; the only
 * sleep API is `sleep.state` ("awake" | "asleep" | "unknown") with a
 * `change` event. (The Fitbit app's sleep log lives in Fitbit's cloud and is
 * only reachable through the Web API from a phone companion.)
 *
 * So this module records asleep→awake periods while the clock face is
 * running (including with the screen off) and sums the ones inside the
 * configured window — i.e. "last night". It persists to the watch's file
 * system so a clock-face restart doesn't lose the night. If you spend the
 * night in another app, or the watch restarts, that time isn't recorded.
 */
import { me } from "appbit";
import sleep from "sleep";
import * as fs from "fs";
import { SLEEP } from "../config/settings";

const FILE = "sleep-log.json";
const HOUR = 3600 * 1000;

let log = { since: null, periods: [] }; // periods: [[startMs, endMs], …]
let listener = null;

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const saved = fs.readFileSync(FILE, "json");
      if (saved && saved.periods) log = saved;
    }
  } catch (e) {
    log = { since: null, periods: [] };
  }
}

function save() {
  try {
    fs.writeFileSync(FILE, log, "json");
  } catch (e) {
    console.warn("Could not save sleep log: " + e);
  }
}

function prune(now) {
  // Keep two windows' worth of history; the file stays tiny.
  const cutoff = now - 2 * SLEEP.windowHours * HOUR;
  const kept = [];
  for (let i = 0; i < log.periods.length; i++) {
    if (log.periods[i][1] > cutoff) kept.push(log.periods[i]);
  }
  log.periods = kept;
}

function onChange() {
  const now = Date.now();
  if (sleep.state === "asleep") {
    if (log.since === null) {
      log.since = now;
      save();
    }
  } else if (log.since !== null) {
    log.periods.push([log.since, now]);
    log.since = null;
    prune(now);
    save();
  }
  if (listener) listener();
}

export function initSleep(onUpdate) {
  listener = onUpdate;
  if (!sleep || !me.permissions.granted("access_sleep")) return;
  load();
  sleep.addEventListener("change", onChange);
  onChange(); // pick up the current state immediately
}

export function sleepAvailable() {
  return !!sleep && me.permissions.granted("access_sleep");
}

/** Minutes asleep within the window ending now (includes an ongoing sleep). */
export function sleepMinutes() {
  if (!sleepAvailable()) return undefined;
  const now = Date.now();
  const from = now - SLEEP.windowHours * HOUR;
  let ms = 0;
  for (let i = 0; i < log.periods.length; i++) {
    const p = log.periods[i];
    const start = p[0] > from ? p[0] : from;
    if (p[1] > start) ms += p[1] - start;
  }
  if (log.since !== null) ms += now - (log.since > from ? log.since : from);
  return Math.round(ms / 60000);
}
