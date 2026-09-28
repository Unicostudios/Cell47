/*
 * Corner brackets: at each corner, two parallel L-shapes (outer + inner),
 * built from rects. Static — drawn once at startup.
 *
 * Markup: "frame-<corner>-<o|i><h|v>" for corner in tl, tr, bl, br:
 *   o/i = outer/inner L, h/v = horizontal/vertical arm.
 */
import { node, setRect } from "./dom";
import { COLORS } from "../config/theme";
import { NORMAL } from "../config/layout";

export function createFrame() {
  const F = NORMAL.frame;
  const group = node("grp-frame");
  const s = F.stroke;
  const step = F.stroke + F.gap; // offset of the inner L from the outer

  // Corner point + direction the arms point in (+1 → right/down, -1 → left/up).
  const corners = {
    tl: { x: F.left, y: F.top, dx: 1, dy: 1 },
    tr: { x: F.right, y: F.top, dx: -1, dy: 1 },
    bl: { x: F.left, y: F.bottom, dx: 1, dy: -1 },
    br: { x: F.right, y: F.bottom, dx: -1, dy: -1 }
  };

  function arm(id, x, y, dx, dy, len) {
    // Horizontal arm from (x,y) along dx, vertical arm along dy; both `s` thick
    // and on the inside of the corner point.
    const hx = dx > 0 ? x : x - len;
    const hy = dy > 0 ? y : y - s;
    setRect(node(id + "h").el, hx, hy, len, s);
    const vx = dx > 0 ? x : x - s;
    const vy = dy > 0 ? y : y - len;
    setRect(node(id + "v").el, vx, vy, s, len);
    node(id + "h").el.style.fill = COLORS.frame;
    node(id + "v").el.style.fill = COLORS.frame;
  }

  for (const key in corners) {
    const c = corners[key];
    arm("frame-" + key + "-o", c.x, c.y, c.dx, c.dy, F.arm);
    arm("frame-" + key + "-i", c.x + c.dx * step, c.y + c.dy * step, c.dx, c.dy, F.arm - step);
  }

  return {
    setVisible: function (v) { group.visible(F.visible && v); }
  };
}
