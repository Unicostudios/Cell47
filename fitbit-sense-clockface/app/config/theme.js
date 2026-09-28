/*
 * THEME — every colour, font and type size used by the clock face.
 *
 * This is the file to edit when translating a Figma style guide.
 * Colours are "#RRGGBB" hex strings. Don't rely on alpha in the hex value;
 * use the `opacity` field on a type style instead.
 *
 * Typography comes in two flavours (see DESIGN.md → "Typography"):
 *   • Bitmap font (default): Barlow Semi Condensed, pre-rendered to PNG
 *     glyphs by tools/generate_glyphs.py. Sizes are baked in at generation
 *     time — change them there and run `npm run glyphs`.
 *   • Fitbit system font: "System-Light" / "System-Regular" / "System-Bold"
 *     (Raiju). Set USE_BITMAP_FONT = false to use it everywhere.
 */
import * as GLYPHS from "./glyphs";

export const USE_BITMAP_FONT = true;

// Monochrome palette: pure black canvas, white type, a soft grey glow.
export const COLORS = {
  // Canvas
  background: "#000000", // behind the glow, and all of AOD
  glowInner: "#3A3A3A", // centre of the radial glow
  glowOuter: "#000000", // edge of the radial glow

  // Text
  textPrimary: "#FFFFFF", // time
  textSecondary: "#E8E8E8", // date, metric values
  textMuted: "#8A8A8A", // battery %

  // Icons & progress
  icon: "#FFFFFF",
  track: "#3A3A3A", // unfilled part of a progress bar
  progress: "#D6D6D6", // filled part of a progress bar
  goalReached: "#FFFFFF", // bar once the goal is hit (brightens to white)
  accent: "#FFFFFF", // charging state

  // Battery
  batteryNormal: "#8A8A8A",
  batteryLow: "#FFFFFF", // low battery = brighter, not a colour

  // Always-On Display (keep these dim: AOD is an OLED power budget)
  aodTime: "#9E9E9E",
  aodDate: "#5C5C5C"
};

export const FONTS = {
  light: "System-Light",
  regular: "System-Regular",
  bold: "System-Bold"
};

/*
 * Type styles. Keys:
 *   glyphs        bitmap glyph set from glyphs.js (used when USE_BITMAP_FONT)
 *   fontFamily    system-font fallback, one of FONTS
 *   fontSize      system-font size in px (bitmap sizes are set in the generator)
 *   letterSpacing px between characters (negative tightens)
 *   fill          colour
 *   opacity       0–1 (system font only, optional)
 */
function type(glyphs, fontFamily, fontSize, letterSpacing, fill) {
  return {
    glyphs: USE_BITMAP_FONT ? glyphs : null,
    fontFamily: fontFamily,
    fontSize: fontSize,
    letterSpacing: letterSpacing,
    fill: fill
  };
}

export const TYPE = {
  time: type(GLYPHS.time, FONTS.bold, 100, 1, COLORS.textPrimary),
  date: type(GLYPHS.date, FONTS.bold, 26, 1, COLORS.textSecondary),
  metric: type(GLYPHS.value, FONTS.regular, 24, 0, COLORS.textSecondary),
  battery: type(GLYPHS.battery, FONTS.regular, 16, 0, COLORS.textMuted),

  // AOD variants: lighter weight + dimmer colour = fewer lit pixels.
  aodTime: type(GLYPHS.timeAod, FONTS.light, 96, 1, COLORS.aodTime),
  aodDate: type(GLYPHS.dateAod, FONTS.regular, 22, 1, COLORS.aodDate)
};

/*
 * Background.
 *   type: "gradient" → vector radial glow (zero image memory, recommended)
 *         "image"    → full-screen PNG/JPG from resources/, e.g. "bg/background.jpg"
 *         "solid"    → COLORS.background only
 *
 * Gradient: (x1,y1) is the glow centre, (x2,y2) a point on its outer edge,
 * in canvas pixels. Tune in the simulator if your glow needs to be tighter.
 */
export const BACKGROUND = {
  type: "gradient",
  image: "bg/background.jpg",
  gradient: {
    type: "radial",
    x1: 210,
    y1: 170,
    x2: 360,
    y2: 360,
    c1: COLORS.glowInner,
    c2: COLORS.glowOuter
  }
};
