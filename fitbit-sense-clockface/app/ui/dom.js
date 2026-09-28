/*
 * Thin DOM helpers.
 *
 * Every setter remembers the last value it wrote and skips identical writes,
 * so render code can be called freely without causing redundant redraws.
 */
import document from "document";

export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error("Missing element #" + id + " in resources/index.view");
  return el;
}

/** Cached writer for a single element property path. */
function cachedSetter(apply) {
  let last;
  return function (value) {
    if (value === last) return;
    last = value;
    apply(value);
  };
}

/** Wraps an element with change-guarded setters for the props we animate. */
export function node(id) {
  const el = byId(id);
  return {
    el: el,
    text: cachedSetter(function (v) { el.text = v; }),
    fill: cachedSetter(function (v) { el.style.fill = v; }),
    width: cachedSetter(function (v) { el.width = v; }),
    href: cachedSetter(function (v) { el.href = v; }),
    visible: cachedSetter(function (v) { el.style.display = v ? "inline" : "none"; })
  };
}

/** Apply a type style from theme.js (TYPE.*) to a text element. */
export function applyType(el, type) {
  el.style.fontFamily = type.fontFamily;
  el.style.fontSize = type.fontSize;
  el.style.fill = type.fill;
  el.letterSpacing = type.letterSpacing || 0;
  el.style.opacity = type.opacity === undefined ? 1 : type.opacity;
}

/** Apply a layout box {x, y, anchor} from layout.js to a text element. */
export function applyTextBox(el, box, dx, dy) {
  el.x = box.x + (dx || 0);
  el.y = box.y + (dy || 0);
  el.textAnchor = box.anchor || "start";
}

export function setRect(el, x, y, w, h) {
  el.x = x;
  el.y = y;
  el.width = w;
  el.height = h;
}
