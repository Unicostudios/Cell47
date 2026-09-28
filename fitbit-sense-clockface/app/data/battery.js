/*
 * Battery level. Event driven — the OS tells us when it changes.
 */
import { battery } from "power";

export function initBattery(onChange) {
  function notify() {
    onChange(Math.round(battery.chargeLevel), battery.charging);
  }
  battery.addEventListener("change", notify);
  notify();
}
