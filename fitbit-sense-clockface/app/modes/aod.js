/*
 * AOD mode — Always-On Display.
 *
 * Rules followed here:
 *   • Pure black background, glow/image hidden (OLED: black = pixel off).
 *   • Only time (+ optional date). No frame, stats, battery, bars or icons.
 *   • Dimmer colours and a lighter weight (TYPE.aodTime / aodDate).
 *   • No sensors running; updates only on the minute tick.
 *   • Text block shifts by a few px each minute to avoid burn-in.
 */
import { formatDate } from "../core/time";
import { DATE, AOD_SETTINGS } from "../config/settings";
import { AOD } from "../config/layout";

export function createAodMode(face, timeText) {
  let step = 0;

  function render(date) {
    const offsets = AOD.burnInOffsets;
    const o = offsets[step % offsets.length];
    step++;
    face.clockText.layoutAod(AOD_SETTINGS.showDate, o[0], o[1]);
    face.clockText.setTime(timeText(date));
    if (AOD_SETTINGS.showDate) {
      face.clockText.setDate(formatDate(date, DATE.aodFormat, DATE.uppercase));
    }
  }

  return {
    enter: function (date) {
      face.background.setMode(true);
      face.frame.setVisible(false);
      face.battery.setVisible(false);
      face.stats.setVisible(false);
      render(date);
    },
    exit: function () {},
    tick: render
  };
}
