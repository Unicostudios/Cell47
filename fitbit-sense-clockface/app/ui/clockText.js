/*
 * Day, time and date labels. Owns both the normal and the AOD placement;
 * the caller decides which one applies.
 */
import { createLabel } from "./label";
import { TYPE } from "../config/theme";
import { NORMAL, AOD } from "../config/layout";

export function createClockText() {
  const day = createLabel("day", 12); // "SAT" (up to "WEDNESDAY")
  const time = createLabel("time", 5); // "11:56"
  const date = createLabel("date", 12); // "10/11" (AOD: "SAT 10")

  return {
    layoutNormal: function () {
      day.style(TYPE.day);
      time.style(TYPE.time);
      date.style(TYPE.date);
      day.place(NORMAL.day);
      time.place(NORMAL.time);
      date.place(NORMAL.date);
      day.visible(NORMAL.day.visible);
      time.visible(NORMAL.time.visible);
      date.visible(NORMAL.date.visible);
    },

    /** dx/dy = burn-in offset for this minute. */
    layoutAod: function (showDate, dx, dy) {
      time.style(TYPE.aodTime);
      date.style(TYPE.aodDate);
      time.place(AOD.time, dx, dy);
      date.place(AOD.date, dx, dy);
      day.visible(false);
      time.visible(AOD.time.visible);
      date.visible(AOD.date.visible && showDate);
    },

    setDay: day.set,
    setTime: time.set,
    setDate: date.set
  };
}
