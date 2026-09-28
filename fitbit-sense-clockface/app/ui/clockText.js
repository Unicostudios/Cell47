/*
 * Time + date labels. Owns both the normal and the AOD placement of these
 * two labels; the caller decides which one applies.
 */
import { createLabel } from "./label";
import { TYPE } from "../config/theme";
import { NORMAL, AOD } from "../config/layout";

export function createClockText() {
  const time = createLabel("time", 5); // "12:58"
  const date = createLabel("date", 12); // up to "WEDNESDAY 23"

  return {
    layoutNormal: function () {
      time.style(TYPE.time);
      date.style(TYPE.date);
      time.place(NORMAL.time);
      date.place(NORMAL.date);
      time.visible(NORMAL.time.visible);
      date.visible(NORMAL.date.visible);
    },

    /** dx/dy = burn-in offset for this minute. */
    layoutAod: function (showDate, dx, dy) {
      time.style(TYPE.aodTime);
      date.style(TYPE.aodDate);
      time.place(AOD.time, dx, dy);
      date.place(AOD.date, dx, dy);
      time.visible(AOD.time.visible);
      date.visible(AOD.date.visible && showDate);
    },

    setTime: time.set,
    setDate: date.set
  };
}
