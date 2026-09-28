/*
 * Dashboard sync — watch side.
 *
 * Every SYNC.intervalMinutes the watch packs today's stats into a tiny CBOR
 * file and queues it for the phone (file-transfer outbox). Fitbit OS
 * delivers queued files whenever the phone is reachable and wakes the
 * companion (companion/index.js), which writes them to the user's Notion.
 *
 * A snapshot is queued when the values changed, when SYNC.heartbeatMinutes
 * passed without a send, or when the screen turns on (you raised your wrist,
 * a good moment because the phone is usually nearby).
 * Turn off with settings.js → SYNC.enabled = false.
 */
import { outbox } from "file-transfer";
import { encode } from "cbor";
import { display } from "display";
import { todayValue } from "./activity";
import { currentHeartRate } from "./heartRate";
import { sleepMinutes } from "./sleep";
import { SYNC } from "../config/settings";

const FILE = "stats.cbor";
const MIN = 60 * 1000;
let lastKey = null;
let lastSentAt = 0;

function snapshot() {
  return {
    steps: todayValue("steps"),
    calories: todayValue("calories"),
    heartRate: currentHeartRate(),
    sleepMinutes: sleepMinutes(),
    azm: todayValue("activeZoneMinutes"),
    distance: todayValue("distance")
  };
}

function send(force) {
  const s = snapshot();
  const key = JSON.stringify(s);
  const now = Date.now();
  const due = now - lastSentAt >= (SYNC.heartbeatMinutes || 30) * MIN;
  if (!force && !due && key === lastKey) return;
  s.t = now;
  outbox
    .enqueue(FILE, encode(s))
    .then(function () {
      lastKey = key;
      lastSentAt = now;
    })
    .catch(function (e) {
      console.warn("Stats sync not queued: " + e);
    });
}

export function initSync() {
  if (!SYNC.enabled) return;
  setTimeout(send, 20 * 1000); // shortly after the face starts
  setInterval(send, SYNC.intervalMinutes * MIN);
  display.addEventListener("change", function () {
    if (display.on && Date.now() - lastSentAt >= (SYNC.onWakeMinMinutes || 3) * MIN) send(true);
  });
}
