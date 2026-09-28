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

// HUD composition (from the reference photo): four double-line corner
// brackets frame the face; day / time / date stacked on the left; four stat
// rows on the right, each with icon + label, value and an outlined bar.
export const NORMAL = {
  // Battery indicator, top centre. Hidden by default (settings.BATTERY.show)
  // because the reference face has none; enable it there if you want it.
  battery: {
    visible: true,
    // Icon drawn from rectangles (no image needed): outline + nub + level.
    icon: { x: 133, y: 14, width: 22, height: 11, stroke: 2, nubWidth: 2, nubHeight: 5 },
    text: { x: 162, y: 26, anchor: "start" }
  },

  // Corner brackets. Each corner is two parallel L-shapes ("double line").
  //   left/top/right/bottom  the outer corner points of the frame
  //   arm     length of each outer arm; the inner L is shorter by stroke+gap
  //   stroke  line thickness, gap = space between the two parallel lines
  frame: {
    visible: true,
    left: 26,
    top: 40,
    right: 310,
    bottom: 296,
    arm: 36,
    stroke: 2,
    gap: 3
  },

  // Left column: day, time, date — all centred on x.
  day: { visible: true, x: 88, y: 114, anchor: "middle" },
  time: { visible: true, x: 88, y: 186, anchor: "middle" },
  date: { visible: true, x: 88, y: 238, anchor: "middle" },

  // Right column: stat rows. WHAT each row shows is set in settings.js
  // (STATS); here you only decide WHERE.
  //   x/width     the row's left edge and total width
  //   tops        y of each row's top edge (one entry per row)
  //   icon        size and offset from the row's top-left
  //   label       baseline offset + gap after the icon
  //   value       baseline offset; right-aligned to the row's right edge
  //   bar         outlined box: offset from row top, height, outline stroke,
  //               inset = space between outline and fill
  stats: {
    visible: true,
    x: 154,
    width: 146,
    tops: [60, 116, 172, 228],
    icon: { size: 14, dy: 4 },
    label: { dy: 17, gap: 5 },
    value: { dy: 18 },
    bar: { dy: 24, height: 14, stroke: 2, inset: 3 },
    hitHeight: 52 // tap target height per row
  }
};

export const AOD = {
  // Centred date over time, no frame or stats (fewer lit pixels).
  date: { visible: true, x: 168, y: 110, anchor: "middle" },
  time: { visible: true, x: 168, y: 212, anchor: "middle" },

  // OLED burn-in protection: the AOD text block moves by these offsets,
  // advancing one step per minute. Set to [[0, 0]] to disable.
  burnInOffsets: [
    [0, 0],
    [2, 1],
    [0, 2],
    [-2, 1]
  ]
};
