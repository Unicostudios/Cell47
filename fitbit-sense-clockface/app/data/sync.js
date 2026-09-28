/*
 * Dashboard sync — watch side.
 *
 * Every SYNC.intervalMinutes the watch packs today's stats into a tiny CBOR
 * file and queues it for the phone (file-transfer outbox). Fitbit OS
 * delivers queued files whenever the phone is reachable and wakes the
 * companion (companion/index.js), which writes them to the user's Notion.
 *
 * Nothing is sent if the values haven't changed since the last send.
 * Turn off with settings.js → SYNC.enabled = false.
 */
import { outbox } from "file-transfer";
import { encode } from "cbor";
import { todayValue } from "./activity";
import { currentHeartRate } from "./heartRate";
import { sleepMinutes } from "./sleep";
import { SYNC } from "../config/settings";

const FILE = "stats.cbor";
let lastKey = null;

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

function send() {
  const s = snapshot();
  const key = JSON.stringify(s);
  if (key === lastKey) return;
  s.t = Date.now();
  outbox
    .enqueue(FILE, encode(s))
    .then(function () {
      lastKey = key;
    })
    .catch(function (e) {
      console.warn("Stats sync not queued: " + e);
    });
}

export function initSync() {
  if (!SYNC.enabled) return;
  setTimeout(send, 20 * 1000); // shortly after the face starts
  setInterval(send, SYNC.intervalMinutes * 60 * 1000);
}
