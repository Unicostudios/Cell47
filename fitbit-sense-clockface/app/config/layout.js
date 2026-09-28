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

export const NORMAL = {
  // Battery indicator, top centre (the only edge not clipped by corners).
  battery: {
    visible: true,
    // Icon drawn from rectangles (no image needed): shell + nub + level.
    icon: { x: 133, y: 25, width: 22, height: 11, stroke: 2, nubWidth: 2, nubHeight: 5 },
    text: { x: 162, y: 37, anchor: "start" }
  },

  date: { visible: true, x: 32, y: 100, anchor: "start" },

  time: { visible: true, x: 28, y: 200, anchor: "start" },

  // Three metric "slots" along the bottom. Each slot = icon, progress bar,
  // value and an invisible touch target. What each slot SHOWS is set in
  // settings.js (SLOTS); here you only decide WHERE the slots sit.
  slots: {
    visible: true,
    centers: [70, 168, 266], // x centre of each slot
    icon: { y: 226, size: 26 }, // top of icon; icons are square
    bar: { y: 262, width: 56, height: 4 },
    value: { y: 298 }, // baseline, anchored middle on the slot centre
    hit: { y: 214, width: 96, height: 102 } // touch target, centred on slot
  }
};

export const AOD = {
  date: { visible: true, x: 168, y: 110, anchor: "middle" },
  time: { visible: true, x: 168, y: 206, anchor: "middle" },

  // OLED burn-in protection: the AOD text block moves by these offsets,
  // advancing one step per minute. Set to [[0, 0]] to disable.
  burnInOffsets: [
    [0, 0],
    [2, 1],
    [0, 2],
    [-2, 1]
  ]
};
