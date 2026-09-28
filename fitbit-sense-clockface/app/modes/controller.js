/*
 * Display state machine: NORMAL ⇄ AOD ⇄ OFF.
 *
 *   display.aodActive          → AOD
 *   display.on && !aodActive   → NORMAL
 *   otherwise                  → OFF  (clock stopped, sensors stopped)
 *
 * The clock ticks once per minute in NORMAL and AOD; it is switched off
 * entirely while the screen is dark.
 */
import clock from "clock";
import { display } from "display";
import { me } from "appbit";
import { AOD_SETTINGS } from "../config/settings";

export const MODE = { NORMAL: "normal", AOD: "aod", OFF: "off" };

export function createController(modes) {
  let current = null;

  const aodSupported =
    AOD_SETTINGS.enabled && display.aodAvailable && me.permissions.granted("access_aod");
  if (aodSupported) display.aodAllowed = true;

  function resolve() {
    if (aodSupported && display.aodActive) return MODE.AOD;
    if (display.on) return MODE.NORMAL;
    return MODE.OFF;
  }

  function sync() {
    const next = resolve();
    if (next === current) return;
    if (current && modes[current]) modes[current].exit();
    current = next;
    if (next === MODE.OFF) {
      clock.granularity = "off";
      return;
    }
    clock.granularity = "minutes";
    modes[next].enter(new Date());
  }

  clock.addEventListener("tick", function (evt) {
    if (current && current !== MODE.OFF) modes[current].tick(evt.date);
  });
  display.addEventListener("change", sync);

  sync();

  return {
    aodSupported: aodSupported,
    current: function () { return current; }
  };
}
