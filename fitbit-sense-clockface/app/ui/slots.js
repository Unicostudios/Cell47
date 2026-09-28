/*
 * Metric slots: icon + pill-shaped goal progress bar + value, one per column.
 *
 * Geometry comes from layout.js (NORMAL.slots), content from settings.js
 * (SLOTS), data from data/metrics.js. This file only draws.
 */
import { node, setRect } from "./dom";
import { createLabel } from "./label";
import { COLORS, TYPE } from "../config/theme";
import { NORMAL } from "../config/layout";
import { getMetric } from "../data/metrics";
import { progress } from "../core/format";

/*
 * Fitbit <rect> has no corner radius, so a pill is a rect with a circle at
 * each end. Markup: "<id>" rect, "<id>-l" / "<id>-r" circles.
 */
function createPill(id, x, y, maxWidth, height) {
  const body = node(id);
  const left = node(id + "-l");
  const right = node(id + "-r");
  const r = height / 2;
  const cy = y + r;
  left.el.cx = x + r;
  left.el.cy = cy;
  left.el.r = r;
  right.el.cy = cy;
  right.el.r = r;
  body.el.y = y;
  body.el.height = height;
  body.el.x = x + r;

  return {
    /** Fill `width` px (0..maxWidth). Below one full cap it hides entirely. */
    width: function (width) {
      const w = Math.round(Math.max(0, Math.min(maxWidth, width)));
      const show = w >= height;
      left.visible(show);
      right.visible(show);
      body.visible(show);
      if (!show) return;
      body.width(w - height);
      right.el.cx = x + w - r;
    },
    fill: function (color) {
      body.fill(color);
      left.fill(color);
      right.fill(color);
    },
    visible: function (v) {
      body.visible(v);
      left.visible(v);
      right.visible(v);
    }
  };
}

export function createSlots(slotConfig) {
  const L = NORMAL.slots;
  const group = node("grp-metrics");
  const slots = [];

  for (let i = 0; i < slotConfig.length; i++) {
    const col = L.columns[i];
    const cx = col.x;
    const barX = cx - L.bar.width / 2;
    const s = {
      metricIds: slotConfig[i],
      icon: node("slot" + i + "-icon"),
      track: createPill("slot" + i + "-track", barX, L.bar.y, L.bar.width, L.bar.height),
      bar: createPill("slot" + i + "-bar", barX, L.bar.y, L.bar.width, L.bar.height),
      value: createLabel("slot" + i + "-value", 8),
      hit: node("slot" + i + "-hit"),
      barVisible: null
    };

    setRect(s.icon.el, cx - col.icon.size / 2, col.icon.y, col.icon.size, col.icon.size);
    s.icon.el.style.fill = col.icon.tone === "bright" ? COLORS.icon : COLORS.iconDim;

    s.track.width(L.bar.width);
    s.track.fill(COLORS.track);

    s.value.style(TYPE.metric);
    s.value.place({ x: cx, y: L.value.y, anchor: "middle" });

    setRect(s.hit.el, cx - L.hit.width / 2, L.hit.y, L.hit.width, L.hit.height);

    slots.push(s);
  }

  // Hide markup for slots that exist in index.view but aren't configured.
  for (let j = slotConfig.length; j < 3; j++) node("slot" + j).visible(false);

  function draw(s, metricId) {
    const m = getMetric(metricId);
    const v = m.value();
    s.icon.href(m.icon);
    s.value.set(m.format(v));

    const hasGoal = !!m.goal;
    if (hasGoal !== s.barVisible) {
      s.barVisible = hasGoal;
      s.track.visible(hasGoal);
      if (!hasGoal) s.bar.visible(false);
    }
    if (hasGoal) {
      const p = progress(v, m.goal());
      s.bar.width(L.bar.width * p);
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
