/*
 * Battery indicator: a vector battery glyph (built from rects so it needs no
 * image and can be recoloured freely) plus a percentage label.
 */
import { node, applyType, applyTextBox, setRect } from "./dom";
import { COLORS, TYPE } from "../config/theme";
import { NORMAL } from "../config/layout";
import { BATTERY } from "../config/settings";

export function createBattery() {
  const L = NORMAL.battery;
  const i = L.icon;
  const group = node("grp-battery");
  // Outline drawn as four thin rects so the glow shows through the middle.
  const sides = [node("bat-top"), node("bat-bottom"), node("bat-left"), node("bat-right")];
  const nub = node("bat-nub");
  const level = node("bat-level");
  const label = node("bat-text");

  // Static geometry, applied once.
  setRect(sides[0].el, i.x, i.y, i.width, i.stroke);
  setRect(sides[1].el, i.x, i.y + i.height - i.stroke, i.width, i.stroke);
  setRect(sides[2].el, i.x, i.y, i.stroke, i.height);
  setRect(sides[3].el, i.x + i.width - i.stroke, i.y, i.stroke, i.height);
  setRect(nub.el, i.x + i.width, i.y + (i.height - i.nubHeight) / 2, i.nubWidth, i.nubHeight);
  // Level bar sits inside the hollow with a 1px gap.
  const inset = i.stroke + 1;
  const levelMax = i.width - 2 * inset;
  setRect(level.el, i.x + inset, i.y + inset, levelMax, i.height - 2 * inset);

  applyType(label.el, TYPE.battery);
  applyTextBox(label.el, L.text);

  const enabled = BATTERY.show && L.visible;

  return {
    setVisible: function (v) {
      group.visible(enabled && v);
    },
    update: function (percent, charging) {
      const color = charging
        ? COLORS.accent
        : percent <= BATTERY.lowThreshold ? COLORS.batteryLow : COLORS.batteryNormal;
      for (let k = 0; k < sides.length; k++) sides[k].fill(color);
      nub.fill(color);
      level.fill(color);
      level.width(Math.max(1, Math.round((levelMax * percent) / 100)));
      label.text(percent + "%");
    }
  };
}
