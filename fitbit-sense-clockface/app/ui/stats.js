/*
 * Stat rows (right column): icon + label on the left, value right-aligned,
 * and an outlined bar underneath with an inset fill.
 *
 *   [icon] LABEL                    VALUE
 *   ┌────────────────────────────────────┐
 *   │▓▓▓▓▓▓▓▓▓▓▓                         │
 *   └────────────────────────────────────┘
 *
 * Geometry comes from layout.js (NORMAL.stats), content from settings.js
 * (STATS), data from data/metrics.js. This file only draws.
 */
import { node, setRect } from "./dom";
import { createLabel } from "./label";
import { COLORS, TYPE } from "../config/theme";
import { NORMAL } from "../config/layout";
import { getMetric } from "../data/metrics";

export const MAX_ROWS = 4;

export function createStats(rowConfig) {
  const L = NORMAL.stats;
  const group = node("grp-stats");
  const rows = [];
  const right = L.x + L.width;
  const b = L.bar;
  const fillMax = L.width - 2 * (b.stroke + b.inset);

  for (let i = 0; i < rowConfig.length; i++) {
    const top = L.tops[i];
    const id = "stat" + i;
    const r = {
      metricIds: rowConfig[i],
      icon: node(id + "-icon"),
      label: createLabel(id + "-label", 10),
      value: createLabel(id + "-value", 8),
      fill: node(id + "-fill"),
      hit: node(id + "-hit")
    };

    setRect(r.icon.el, L.x, top + L.icon.dy, L.icon.size, L.icon.size);
    r.icon.el.style.fill = COLORS.icon;

    r.label.style(TYPE.label);
    r.label.place({ x: L.x + L.icon.size + L.label.gap, y: top + L.label.dy, anchor: "start" });
    r.value.style(TYPE.metric);
    r.value.place({ x: right, y: top + L.value.dy, anchor: "end" });

    // Bar outline: four thin rects (Fitbit rects can't be stroked-only).
    const by = top + b.dy;
    const sides = [node(id + "-bt"), node(id + "-bb"), node(id + "-bl"), node(id + "-br")];
    setRect(sides[0].el, L.x, by, L.width, b.stroke);
    setRect(sides[1].el, L.x, by + b.height - b.stroke, L.width, b.stroke);
    setRect(sides[2].el, L.x, by, b.stroke, b.height);
    setRect(sides[3].el, right - b.stroke, by, b.stroke, b.height);
    for (let k = 0; k < 4; k++) sides[k].el.style.fill = COLORS.barOutline;

    const inner = b.stroke + b.inset;
    setRect(r.fill.el, L.x + inner, by + inner, 0, b.height - 2 * inner);

    setRect(r.hit.el, L.x, top, L.width, L.hitHeight);
    rows.push(r);
  }

  // Hide markup for rows that exist in index.view but aren't configured.
  for (let j = rowConfig.length; j < MAX_ROWS; j++) node("stat" + j).visible(false);

  function draw(r, metricId) {
    const m = getMetric(metricId);
    const v = m.value();
    const p = m.progress(v);
    r.icon.href(m.icon);
    r.label.set(m.label);
    r.value.set(m.format(v));
    const w = Math.round(fillMax * p);
    r.fill.visible(w > 0);
    r.fill.width(w);
    r.fill.fill(p >= 1 ? COLORS.goalReached : COLORS.progress);
  }

  return {
    count: rows.length,
    hitElement: function (i) { return rows[i].hit.el; },
    setVisible: function (v) { group.visible(L.visible && v); },

    /** Redraw every row using the currently selected metric of each. */
    renderAll: function (selection) {
      for (let i = 0; i < rows.length; i++) draw(rows[i], rows[i].metricIds[selection[i]]);
    },

    /** Redraw only rows showing a sensor-pushed ("live") metric. */
    renderLive: function (selection) {
      for (let i = 0; i < rows.length; i++) {
        const id = rows[i].metricIds[selection[i]];
        if (getMetric(id).live) draw(rows[i], id);
      }
    },

    renderOne: function (i, selection) {
      draw(rows[i], rows[i].metricIds[selection[i]]);
    }
  };
}
