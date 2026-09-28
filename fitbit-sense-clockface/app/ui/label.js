/*
 * Label — one piece of text that renders with EITHER
 *   • a bitmap font (type.glyphs set → PNG per character, tinted by fill), or
 *   • a Fitbit system font (type.fontFamily → a normal <text> element).
 *
 * Markup contract in index.view, for a label called "date":
 *   <g id="date-grp">
 *     <text id="date" />                      system-font fallback
 *     <image id="date-g0" /> … "date-gN"      one slot per character
 *   </g>
 *
 * style()/place() only mark the label dirty; the glyphs are laid out on the
 * next set(). Unchanged strings are skipped, so set() can be called freely.
 */
import { byId, node, applyType, applyTextBox } from "./dom";

export function createLabel(id, slotCount) {
  const group = node(id + "-grp");
  const text = node(id);
  const imgs = [];
  const hrefs = [];
  for (let i = 0; i < slotCount; i++) {
    imgs.push(byId(id + "-g" + i));
    hrefs.push("");
  }

  let type = null;
  let box = null;
  let dx = 0;
  let dy = 0;
  let str = null;
  let dirty = true;

  function drawBitmap() {
    const set = type.glyphs;
    const sp = type.letterSpacing || 0;

    // Measure first so we can honour the anchor.
    let total = 0;
    let count = 0;
    for (let i = 0; i < str.length; i++) {
      const m = set.g[str.charAt(i)];
      if (!m) continue;
      total += m[0];
      count++;
    }
    if (count > 1) total += sp * (count - 1);

    const anchor = box.anchor || "start";
    let pen = box.x + dx - (anchor === "middle" ? total / 2 : anchor === "end" ? total : 0);
    const top = box.y + dy - set.asc;

    let n = 0;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charAt(i);
      const m = set.g[ch];
      if (!m) {
        console.warn("Glyph '" + ch + "' missing from " + set.dir);
        continue;
      }
      if (m[1] > 0) {
        if (n >= imgs.length) {
          console.warn("Label #" + id + " has only " + imgs.length + " glyph slots");
          break;
        }
        const img = imgs[n];
        const href = set.dir + "/" + ch.charCodeAt(0) + ".png";
        if (hrefs[n] !== href) {
          hrefs[n] = href;
          img.href = href;
        }
        img.x = Math.round(pen + m[2]);
        img.y = top;
        img.width = m[1];
        img.height = set.h;
        img.style.display = "inline";
        n++;
      }
      pen += m[0] + sp;
    }
    for (; n < imgs.length; n++) imgs[n].style.display = "none";
  }

  function draw() {
    if (!type || !box || str === null) return;
    if (type.glyphs) drawBitmap();
    else text.text(str);
    dirty = false;
  }

  return {
    /** Apply a TYPE.* style from theme.js. */
    style: function (t) {
      if (t === type) return;
      type = t;
      if (t.glyphs) {
        text.visible(false);
        for (let i = 0; i < imgs.length; i++) imgs[i].style.fill = t.fill;
      } else {
        for (let i = 0; i < imgs.length; i++) imgs[i].style.display = "none";
        applyType(text.el, t);
        text.visible(true);
      }
      dirty = true;
    },

    /** Apply a layout box {x, y(baseline), anchor} plus an optional offset. */
    place: function (b, ox, oy) {
      box = b;
      dx = ox || 0;
      dy = oy || 0;
      applyTextBox(text.el, b, dx, dy);
      dirty = true;
    },

    set: function (s) {
      if (s === str && !dirty) return;
      str = s;
      draw();
    },

    visible: group.visible
  };
}
