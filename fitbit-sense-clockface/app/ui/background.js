/*
 * Background: solid colour, vector radial glow, or full-screen image.
 * Configured in theme.js → BACKGROUND. Applied once per mode change.
 */
import { byId } from "./dom";
import { COLORS, BACKGROUND } from "../config/theme";

export function createBackground() {
  const solid = byId("bg-solid");
  const glow = byId("bg-gradient");
  const image = byId("bg-image");

  solid.style.fill = COLORS.background;

  const g = BACKGROUND.gradient;
  glow.gradient.type = g.type;
  glow.gradient.x1 = g.x1;
  glow.gradient.y1 = g.y1;
  glow.gradient.x2 = g.x2;
  glow.gradient.y2 = g.y2;
  glow.gradient.colors.c1 = g.c1;
  glow.gradient.colors.c2 = g.c2;

  if (BACKGROUND.type === "image") image.href = BACKGROUND.image;

  return {
    /** aod: true hides the glow/image — AOD is always pure black. */
    setMode: function (aod) {
      glow.style.display = !aod && BACKGROUND.type === "gradient" ? "inline" : "none";
      image.style.display = !aod && BACKGROUND.type === "image" ? "inline" : "none";
    }
  };
}
