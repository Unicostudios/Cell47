/*
 * Time + date text. Owns both the normal and the AOD placement of these two
 * elements; the caller decides which one applies.
 */
import { node, applyType, applyTextBox } from "./dom";
import { TYPE } from "../config/theme";
import { NORMAL, AOD } from "../config/layout";

export function createClockText() {
  const time = node("time");
  const date = node("date");

  return {
    layoutNormal: function () {
      applyType(time.el, TYPE.time);
      applyType(date.el, TYPE.date);
      applyTextBox(time.el, NORMAL.time);
      applyTextBox(date.el, NORMAL.date);
      time.visible(NORMAL.time.visible);
      date.visible(NORMAL.date.visible);
    },

    /** dx/dy = burn-in offset for this minute. */
    layoutAod: function (showDate, dx, dy) {
      applyType(time.el, TYPE.aodTime);
      applyType(date.el, TYPE.aodDate);
      applyTextBox(time.el, AOD.time, dx, dy);
      applyTextBox(date.el, AOD.date, dx, dy);
      time.visible(AOD.time.visible);
      date.visible(AOD.date.visible && showDate);
    },

    setTime: time.text,
    setDate: date.text
  };
}
