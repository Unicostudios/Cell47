/*
 * THEME — every colour, font and type size used by the clock face.
 *
 * This is the file to edit when translating a Figma style guide.
 * Colours are "#RRGGBB" hex strings. Don't rely on alpha in the hex value;
 * use the `opacity` field on a type style instead.
 *
 * Fonts: Fitbit Sense only ships system fonts. The three safe families are
 * "System-Light", "System-Regular" and "System-Bold" (rendered in Fitbit's
 * Raiju typeface on Fitbit OS 5+). Custom TTF/OTF fonts are NOT supported;
 * see DESIGN.md → "Typography" for the bitmap-digit alternative.
 */

export const COLORS = {
  // Canvas
  background: "#000000", // shown behind the glow and in AOD
  glowInner: "#2B5F64", // centre of the radial glow (teal, from reference)
  glowOuter: "#020405", // edge of the radial glow

  // Text
  textPrimary: "#FFFFFF", // time
  textSecondary: "#D8E4E5", // date, metric values
  textMuted: "#8FA2A4", // battery %, unavailable values

  // Icons & progress
  icon: "#FFFFFF",
  track: "#2A393B", // unfilled part of a progress bar
  progress: "#BFE4E7", // filled part of a progress bar
  goalReached: "#7FF0C0", // progress bar once the goal is hit
  accent: "#8FE3E9", // charging state and tap feedback

  // Battery
  batteryNormal: "#8FA2A4",
  batteryLow: "#FF6B5B",

  // Always-On Display (keep these dim: AOD is an OLED power budget)
  aodTime: "#A7B4B6",
  aodDate: "#5F6E70"
};

export const FONTS = {
  light: "System-Light",
  regular: "System-Regular",
  bold: "System-Bold"
};

/*
 * Type styles. Keys:
 *   fontFamily    one of FONTS
 *   fontSize      px on the 336×336 canvas
 *   letterSpacing px (negative tightens)
 *   fill          colour
 *   opacity       0–1 (optional)
 */
export const TYPE = {
  time: {
    fontFamily: FONTS.bold,
    fontSize: 100,
    letterSpacing: -2,
    fill: COLORS.textPrimary
  },
  date: {
    fontFamily: FONTS.bold,
    fontSize: 26,
    letterSpacing: 1,
    fill: COLORS.textSecondary
  },
  metric: {
    fontFamily: FONTS.regular,
    fontSize: 24,
    letterSpacing: 0,
    fill: COLORS.textSecondary
  },
  battery: {
    fontFamily: FONTS.regular,
    fontSize: 16,
    letterSpacing: 0,
    fill: COLORS.textMuted
  },

  // AOD variants: lighter weight + dimmer colour = fewer lit pixels.
  aodTime: {
    fontFamily: FONTS.regular,
    fontSize: 96,
    letterSpacing: -2,
    fill: COLORS.aodTime
  },
  aodDate: {
    fontFamily: FONTS.regular,
    fontSize: 22,
    letterSpacing: 1,
    fill: COLORS.aodDate
  }
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
    x1: 214,
    y1: 150,
    x2: 336,
    y2: 336,
    c1: COLORS.glowInner,
    c2: COLORS.glowOuter
  }
};
