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
import { TIME, STATS, PERSIST_STATE } from "./config/settings";
import { formatTime } from "./core/time";
import { initHeartRate } from "./data/heartRate";
import { initBattery } from "./data/battery";
import { initSleep } from "./data/sleep";
import { initSync } from "./data/sync";
import { createFace } from "./ui/face";
import { MAX_ROWS } from "./ui/stats";
import { bindRowTaps } from "./ui/interaction";
import { loadSelection, saveSelection } from "./state/store";
import { createNormalMode } from "./modes/normal";
import { createAodMode } from "./modes/aod";
import { createController, MODE } from "./modes/controller";

if (STATS.length > MAX_ROWS) throw new Error("settings.STATS supports at most " + MAX_ROWS + " rows");

function timeText(date) {
  const use24h = TIME.format === "system" ? preferences.clockDisplay === "24h" : TIME.format === "24h";
  return formatTime(date, use24h, TIME);
}

const face = createFace(STATS);
const selection = loadSelection(STATS, PERSIST_STATE);

const normal = createNormalMode(face, selection, timeText);
const aod = createAodMode(face, timeText);

initBattery(face.battery.update);
initHeartRate(normal.onHeartRate);
initSleep(normal.onSleep);
initSync();

bindRowTaps(face.stats, STATS, selection, function (index) {
  normal.onRowTapped(index);
  saveSelection(selection, PERSIST_STATE);
});

const modes = {};
modes[MODE.NORMAL] = normal;
modes[MODE.AOD] = aod;
createController(modes);
