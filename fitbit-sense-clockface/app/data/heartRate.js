/*
 * Heart rate + on-wrist detection.
 *
 * The HR sensor is only running while the screen is fully on (not AOD, not
 * off). `onChange(bpm)` fires only when the displayed value would change;
 * bpm is null when off-wrist or no reading is available.
 */
import { me } from "appbit";
import { HeartRateSensor } from "heart-rate";
import { BodyPresenceSensor } from "body-presence";

let hrm = null;
let body = null;
let listener = null;
let lastBpm; // undefined = never emitted

function emit(bpm) {
  if (bpm === lastBpm) return;
  lastBpm = bpm;
  if (listener) listener(bpm);
}

export function initHeartRate(onChange) {
  listener = onChange;

  if (HeartRateSensor && me.permissions.granted("access_heart_rate")) {
    // 1 Hz, no batching: the face only ever shows the latest value.
    hrm = new HeartRateSensor({ frequency: 1 });
    hrm.addEventListener("reading", function () {
      // Only an explicit `false` means off-wrist; null = no presence reading yet.
      emit(body && body.present === false ? null : hrm.heartRate);
    });
  }

  if (BodyPresenceSensor && me.permissions.granted("access_activity")) {
    body = new BodyPresenceSensor();
    body.addEventListener("reading", function () {
      if (body.present === false) emit(null);
    });
  }

  emit(null);
}

export function startHeartRate() {
  if (body) body.start();
  if (hrm) hrm.start();
}

export function stopHeartRate() {
  if (hrm) hrm.stop();
  if (body) body.stop();
}

export function heartRateAvailable() {
  return hrm !== null;
}

/** Last bpm value (null if none). */
export function currentHeartRate() {
  return lastBpm === undefined ? null : lastBpm;
}
