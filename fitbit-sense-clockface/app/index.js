/*
 * Entry point — wiring only. No layout values or formats live here.
 *
 *   config/    theme, layout, settings        (edit these to restyle)
 *   core/      pure time/number formatting
 *   data/      Fitbit sensors & activity      (never touches the DOM)
 *   ui/        drawing components             (never touches sensors)
 *   modes/     NORMAL / AOD behaviour + display state machine
 *   state/     persisted UI state
 */
import { preferences } from "user-settings";
import { TIME, SLOTS, PERSIST_STATE } from "./config/settings";
import { formatTime } from "./core/time";
import { initHeartRate } from "./data/heartRate";
import { initBattery } from "./data/battery";
import { createFace } from "./ui/face";
import { bindSlotTaps } from "./ui/interaction";
import { loadSelection, saveSelection } from "./state/store";
import { createNormalMode } from "./modes/normal";
import { createAodMode } from "./modes/aod";
import { createController, MODE } from "./modes/controller";

if (SLOTS.length > 3) throw new Error("settings.SLOTS supports at most 3 slots");

function timeText(date) {
  const use24h = TIME.format === "system" ? preferences.clockDisplay === "24h" : TIME.format === "24h";
  return formatTime(date, use24h, TIME);
}

const face = createFace(SLOTS);
const selection = loadSelection(SLOTS, PERSIST_STATE);

const normal = createNormalMode(face, selection, timeText);
const aod = createAodMode(face, timeText);

initBattery(face.battery.update);
initHeartRate(normal.onHeartRate);

bindSlotTaps(face.slots, SLOTS, selection, function (index) {
  normal.onSlotTapped(index);
  saveSelection(selection, PERSIST_STATE);
});

const modes = {};
modes[MODE.NORMAL] = normal;
modes[MODE.AOD] = aod;
createController(modes);
