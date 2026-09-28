/*
 * LAYOUT — every position and size on the 336×336 canvas.
 *
 * Coordinate system (same as a 336×336 Figma frame):
 *   origin (0,0) = top-left, x grows right, y grows down, units = screen px.
 *   Text `y` is the BASELINE, not the top of the text box (see DESIGN.md).
 *   `anchor` = "start" | "middle" | "end" → which point `x` refers to.
 *
 * NORMAL and AOD are fully independent so the AOD composition can differ.
 */

export const CANVAS = { width: 336, height: 336 };

// Keep critical content inside this box; the Sense glass has rounded corners.
export const SAFE_AREA = { left: 24, top: 20, right: 312, bottom: 316 };

// Composition follows the reference photo: centred date over a very large
// centred time, then a row of three metric columns (side columns: small dim
// icon + pill progress bar + value; centre column: large heart + value).
export const NORMAL = {
  // Battery indicator, top centre. Hidden by default (settings.BATTERY.show)
  // because the reference face has none; enable it there if you want it.
  battery: {
    visible: true,
    // Icon drawn from rectangles (no image needed): outline + nub + level.
    icon: { x: 133, y: 18, width: 22, height: 11, stroke: 2, nubWidth: 2, nubHeight: 5 },
    text: { x: 162, y: 30, anchor: "start" }
  },

  date: { visible: true, x: 168, y: 56, anchor: "middle" },

  time: { visible: true, x: 168, y: 188, anchor: "middle" },

  // Metric columns. WHAT each column shows is set in settings.js (SLOTS);
  // here you only decide WHERE and HOW BIG.
  //   icon.tone: "dim" → COLORS.iconDim, "bright" → COLORS.icon
  slots: {
    visible: true,
    columns: [
      { x: 93, icon: { y: 228, size: 22, tone: "dim" } },
      { x: 168, icon: { y: 222, size: 40, tone: "bright" } },
      { x: 243, icon: { y: 228, size: 22, tone: "dim" } }
    ],
    bar: { y: 263, width: 54, height: 8 }, // pill: ends are rounded
    value: { y: 302 }, // baseline, centred on the column
    hit: { y: 214, width: 74, height: 98 } // touch target, centred on column
  }
};

export const AOD = {
  // Same centred composition as NORMAL, without the metric row.
  date: { visible: true, x: 168, y: 96, anchor: "middle" },
  time: { visible: true, x: 168, y: 214, anchor: "middle" },

  // OLED burn-in protection: the AOD text block moves by these offsets,
  // advancing one step per minute. Set to [[0, 0]] to disable.
  burnInOffsets: [
    [0, 0],
    [2, 1],
    [0, 2],
    [-2, 1]
  ]
};
