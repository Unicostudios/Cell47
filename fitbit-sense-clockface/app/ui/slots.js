/*
 * Metric slots: icon + goal progress bar + value, one per column.
 *
 * Geometry comes from layout.js (NORMAL.slots), content from settings.js
 * (SLOTS), data from data/metrics.js. This file only draws.
 */
import { node, applyType, setRect } from "./dom";
import { COLORS, TYPE } from "../config/theme";
import { NORMAL } from "../config/layout";
import { getMetric } from "../data/metrics";
import { progress } from "../core/format";

export function createSlots(slotConfig) {
  const L = NORMAL.slots;
  const group = node("grp-metrics");
  const slots = [];

  for (let i = 0; i < slotConfig.length; i++) {
    const cx = L.centers[i];
    const s = {
      metricIds: slotConfig[i],
      icon: node("slot" + i + "-icon"),
      track: node("slot" + i + "-track"),
      bar: node("slot" + i + "-bar"),
      value: node("slot" + i + "-value"),
      hit: node("slot" + i + "-hit")
    };

    setRect(s.icon.el, cx - L.icon.size / 2, L.icon.y, L.icon.size, L.icon.size);
    s.icon.el.style.fill = COLORS.icon;

    const barX = cx - L.bar.width / 2;
    setRect(s.track.el, barX, L.bar.y, L.bar.width, L.bar.height);
    s.track.el.style.fill = COLORS.track;
    setRect(s.bar.el, barX, L.bar.y, 0, L.bar.height);

    applyType(s.value.el, TYPE.metric);
    s.value.el.x = cx;
    s.value.el.y = L.value.y;
    s.value.el.textAnchor = "middle";

    setRect(s.hit.el, cx - L.hit.width / 2, L.hit.y, L.hit.width, L.hit.height);

    slots.push(s);
  }

  // Hide markup for slots that exist in index.view but aren't configured.
  for (let j = slotConfig.length; j < 3; j++) node("slot" + j).visible(false);

  function draw(s, metricId) {
    const m = getMetric(metricId);
    const v = m.value();
    s.icon.href(m.icon);
    s.value.text(m.format(v));

    const hasGoal = !!m.goal;
    s.track.visible(hasGoal);
    s.bar.visible(hasGoal);
    if (hasGoal) {
      const p = progress(v, m.goal());
      s.bar.width(Math.round(L.bar.width * p));
      s.bar.fill(p >= 1 ? COLORS.goalReached : COLORS.progress);
    }
  }

  return {
    count: slots.length,
    hitElement: function (i) { return slots[i].hit.el; },
    setVisible: function (v) { group.visible(L.visible && v); },

    /** Redraw every slot using the currently selected metric of each. */
    renderAll: function (selection) {
      for (let i = 0; i < slots.length; i++) draw(slots[i], slots[i].metricIds[selection[i]]);
    },

    /** Redraw only slots showing a sensor-pushed ("live") metric. */
    renderLive: function (selection) {
      for (let i = 0; i < slots.length; i++) {
        const id = slots[i].metricIds[selection[i]];
        if (getMetric(id).live) draw(slots[i], id);
      }
    },

    renderOne: function (i, selection) {
      draw(slots[i], slots[i].metricIds[selection[i]]);
    }
  };
}
