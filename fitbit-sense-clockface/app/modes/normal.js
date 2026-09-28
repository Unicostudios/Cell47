/*
 * NORMAL mode — screen fully on. Full layout, live heart rate, metrics
 * refreshed once per minute (and immediately when the screen wakes).
 */
import { startHeartRate, stopHeartRate } from "../data/heartRate";
import { formatDate, dayKey } from "../core/time";
import { DATE } from "../config/settings";

export function createNormalMode(face, selection, timeText) {
  let active = false;
  let lastDay = -1;

  function renderClock(date) {
    face.clockText.setTime(timeText(date));
    const key = dayKey(date);
    if (key !== lastDay) {
      lastDay = key;
      face.clockText.setDay(formatDate(date, DATE.dayFormat, DATE.uppercase));
      face.clockText.setDate(formatDate(date, DATE.format, DATE.uppercase));
    }
  }

  return {
    enter: function (date) {
      active = true;
      face.background.setMode(false);
      face.clockText.layoutNormal();
      face.frame.setVisible(true);
      face.battery.setVisible(true);
      face.stats.setVisible(true);
      lastDay = -1; // AOD may have written a different date format
      renderClock(date);
      face.stats.renderAll(selection);
      startHeartRate();
    },

    exit: function () {
      active = false;
      stopHeartRate();
    },

    tick: function (date) {
      renderClock(date);
      face.stats.renderAll(selection); // polled metrics: steps, calories, sleep, …
    },

    onHeartRate: function () {
      if (active) face.stats.renderLive(selection);
    },

    /** Sleep state changed (rare): refresh rows so SLEEP is current. */
    onSleep: function () {
      if (active) face.stats.renderAll(selection);
    },

    onRowTapped: function (index) {
      if (active) face.stats.renderOne(index, selection);
    }
  };
}
