# DESIGN.md: from Figma to Fitbit Sense

This guide covers how to turn a Figma frame into this clock face without touching any sensor or data code.

> **Rule of thumb:** visual changes go in `app/config/*.js` and `resources/`.
> If you find yourself editing `app/data/` or `app/modes/`, you're changing behaviour, not design.

---

## 1. Canvas

| | |
|---|---|
| Screen | **336 × 336 px**, 1 design px = 1 screen px (no @2x) |
| Figma frame | `Sense / Normal` 336×336 and `Sense / AOD` 336×336 |
| Glass shape | Rounded square. The corners are clipped by the bezel. |
| Colour | Opaque images are stored 16-bit (RGB565); subtle gradients may band slightly |
| Display | AMOLED: **black pixels are off**, so black costs no power |

Set up the Figma frames like this:

1. Create a 336 × 336 frame with a black fill and **Clip content** on.
2. Add a rounded-rectangle mask with radius ~64 to see what the bezel will hide. The exact curve isn't published; ~64 matches the preview.
3. Add the safe-area guides below as a layout grid, or as locked rectangles.

## 2. Safe areas

Defined in `app/config/layout.js → SAFE_AREA`:

```
       x=24                                 x=312
  y=20 ┌───────────────────────────────────────┐
       │  ⟍ corner zone                        │  ← top-centre is safe up to y≈20
       │                                       │     (battery sits here)
       │        primary content area           │
       │                                       │
       │  ⟋ corner zone                   ⟍    │
 y=316 └───────────────────────────────────────┘
```

- **Hard safe box:** x 24–312, y 20–316. Nothing important should go outside it.
- **Corners:** keep text out of a ~48 px square in each corner. Icons may sit closer, but test on the watch.
- **Touch targets:** at least **44 × 44 px**. Current stat-row hit areas are 146 × 52.

## 3. Coordinate system

- Origin is **top-left (0,0)**. x increases to the right, y increases downward, in whole pixels. This is the same as Figma's X/Y inspector for elements inside the frame.
- **Text `y` is the baseline**, not the top of the text box. Figma shows the box's top, so convert:
  `baseline_y ≈ figma_y + (font_size × 0.8)` for System fonts. Fine-tune on the watch.
- **Text `x`** depends on `anchor`:
  - `"start"`: x is the left edge (Figma X)
  - `"middle"`: x is the centre (Figma X + W/2)
  - `"end"`: x is the right edge (Figma X + W)
- **Images and rects:** x/y is the top-left corner, just like Figma.

Example: in Figma, the time layer sits at X 28, Y 116, with font size 100.
In `layout.js`, that becomes `time: { x: 28, y: 196, anchor: "start" }` (116 + 100 × 0.8 = 196).

## 4. What you can and can't draw

| Figma feature | On Fitbit | How |
|---|---|---|
| Solid rectangles | ✅ | `<rect>` (no corner radius) |
| Circles, arcs, rings | ✅ | `<circle>`, `<arc>` (arc-width, start/sweep angle) |
| Linear / radial gradient | ✅ | `<gradientRect>`, 2–4 colours (`BACKGROUND.type = "gradient"`) |
| Lines | ✅ | `<line>` |
| Text in system fonts | ✅ | `<text>` |
| PNG / JPEG images | ✅ | `<image>` |
| **SVG files as images** | ❌ | Export them as PNG instead |
| Rounded-rect corners | ❌ | Use a PNG, or a rect plus circles at the ends |
| Drop shadows, blur, blend modes | ❌ | Bake them into a PNG |
| Custom fonts (TTF/OTF) | ⚠️ | Not loadable, but this project pre-renders them to PNG glyphs (§6) |
| Opacity | ✅ | `opacity` in the type style / element style |
| Animations | ⚠️ | Supported, but avoided here for battery |

## 5. Assets

### Formats

| Use | Format | Notes |
|---|---|---|
| **Icons / glyphs** (single colour) | **8-bit grayscale PNG**, no alpha | The build turns grayscale into a mask: **white = visible, black = transparent**. Colour comes from `theme.js`, so one asset works for every palette. |
| Multi-colour art with transparency | 32-bit RGBA PNG | Costs 4 bytes/px of memory |
| Opaque photos / full backgrounds | JPEG, or PNG without alpha | Stored as RGB565 (2 bytes/px) |
| App icon | 80 × 80 PNG | Required size; the build rejects any other size |

### Recommended export sizes (1×, exact pixels)

| Asset | Size | File |
|---|---|---|
| Stat icons | 14 × 14 | `resources/icons/<name>.png` |
| App icon | 80 × 80 | `resources/icon.png` |
| Full background | 336 × 336 | `resources/bg/background.jpg` |
| Font glyphs | generated, one per character | `resources/glyphs/<set>/<charCode>.png` (via `npm run glyphs`) |

Export at **1×**. Fitbit doesn't scale for density, and the image draws at the size set in `layout.js`.

### Memory budget

The Sense gives each app a limited amount of memory, and images are decoded into RAM:

- A full-screen 336×336 JPEG takes ~220 KB. That's fine for one image, but **avoid layering several**.
- A 14×14 grayscale icon takes ~0.2 KB, so icons are practically free.
- Prefer the vector gradient (`BACKGROUND.type = "gradient"`) over a raster background.

### Replacing an asset (step by step)

1. In Figma, select the icon layer and use **Flatten**, so it's a single shape, white on transparent.
2. Export as **PNG, 1×**, at exactly **14 × 14**.
3. Convert it to grayscale with white on black. In Figma, put it on a black frame of the same size and export the frame. Or use ImageMagick:
   `magick in.png -background black -alpha remove -colorspace Gray -depth 8 out.png`
4. Save it over the existing file, e.g. `resources/icons/steps.png`, keeping the same name.
5. Run `npm run preview` to check, then `npm run build`.

To use a **new** filename, update the `icon:` path in `app/data/metrics.js`.

## 6. Typography

The face uses **Barlow Condensed**, a free Google Font, as a **bitmap font**. `tools/generate_glyphs.py` renders each character to a grayscale PNG, and `app/ui/label.js` lays them out on the watch. In Figma, install it and design with the real font; what you see is what the watch shows.

**Current type scale (px = Figma font size):**

| Role | Figma style | Glyph set |
|---|---|---|
| Time | Barlow Condensed Medium 60, centred in the left column | `time` |
| Day / date | Barlow Condensed Medium 30, +1 letter-spacing, uppercase | `date` |
| Stat label | Barlow Condensed Medium 17, +1 letter-spacing, uppercase | `label` |
| Stat value | Barlow Condensed Medium 20, right-aligned | `value` |
| Battery % (hidden) | Barlow Semi Condensed Medium 17 | `battery` |
| AOD time | Barlow Condensed Light 120 | `timeAod` |
| AOD date | Barlow Condensed Regular 24 | `dateAod` |

**Changing type from a Figma design:**

1. For each text style, note the font file, weight and size.
2. Edit the `SETS` table in `tools/generate_glyphs.py`. You can add a new font file under `tools/fonts/`.
3. Run `npm run glyphs`. This rewrites `resources/glyphs/**` and `app/config/glyphs.js`.
4. Set letter-spacing and colour in `theme.js → TYPE`. Neither needs a regeneration.
5. Run `npm run preview`. It renders with the same glyph images the watch uses.

**Rules for the bitmap font:**

- Only characters listed in the set exist. The `value` set, for example, has digits, `, . -` and the letters `k m i`. Add any others you need.
- Sizes are fixed when generated. Every size or weight is its own set.
- There's no kerning. Glyphs use their advance widths, so tight display pairs may need a small `letterSpacing` tweak.
- Each glyph slot is an `<image>` element. Labels have a fixed number of slots: time 5, day/date 12, stat labels 10, stat values 8, battery 4. Longer strings are cut off with a log warning.
- Memory is negligible, since a 120 px digit is ~5 KB as an 8-bit mask.

**Fitbit system fonts** (fallback, set `USE_BITMAP_FONT = false`): `System-Light`, `System-Regular` and `System-Bold`, rendered in Raiju. They're available as `<text>` at any size, but Raiju isn't distributed for desktop design tools.

## 7. Where each Figma layer goes

| Figma layer | Position/size | Style | Content |
|---|---|---|---|
| Background | — | `theme.js → BACKGROUND` (solid black) | — |
| Corner brackets | `layout.js → NORMAL.frame` (corners, arm, stroke, gap) | `COLORS.frame` | — |
| Day / time / date | `NORMAL.day`, `NORMAL.time`, `NORMAL.date` | `TYPE.day / time / date` | `settings.js → DATE`, `TIME` |
| Stat rows | `NORMAL.stats` (x, width, row tops) | — | `settings.js → STATS` |
| Stat icon | `NORMAL.stats.icon` | `COLORS.icon` | `data/metrics.js → icon` |
| Stat label / value | `NORMAL.stats.label`, `.value` | `TYPE.label`, `TYPE.metric` | `data/metrics.js → label`, `format` |
| Stat bar | `NORMAL.stats.bar` (height, stroke, inset) | `COLORS.barOutline / progress / goalReached` | `data/metrics.js → progress` |
| Battery (hidden) | `NORMAL.battery` | `COLORS.battery*`, `TYPE.battery` | `settings.js → BATTERY` |
| AOD time/date | `layout.js → AOD` | `TYPE.aodTime / aodDate` | `DATE.aodFormat` |

## 8. AOD design rules

AOD mode, in `app/modes/aod.js`, deliberately shows **only the time and date**. Follow these rules when designing the AOD frame:

- **Pure black background.** No frame, stats or background image in AOD.
- **Few lit pixels.** Use thin weights and no filled shapes, and aim for well under ~15% of pixels lit. Large bold numerals or icons increase OLED power draw.
- **Dim colours.** Mid greys (`#9E9E9E`, `#5C5C5C`) instead of white.
- **No seconds, no sensors, no animation.** The screen updates once per minute.
- **Burn-in shift.** The text moves by a few pixels each minute (`AOD.burnInOffsets`), so leave ≥ 4 px of slack around AOD elements.
- **Same visual language.** Keep the same alignment logic and type family as the normal face; only the weight and colour change.

## 9. Handing me a new design

When you have a new Figma design, send:

1. A **336 × 336 PNG export** of the normal frame and the AOD frame.
2. Ideally, the **Figma Inspect values** (X, Y, W, H, font size, colours) for each layer, or a link to the file.
3. Any new icons as grayscale PNGs at their final size (§5).

Then tell me: *"Make the clock face look exactly like this."* I'll update `config/`, `resources/` and, if the structure changes (new elements, different row count, new glyph sets), the matching `ui/` component and `index.view`. The `data/`, `modes/` and `core/` code stays as it is.

## 10. Checklist before building

- [ ] All critical content is inside `SAFE_AREA`
- [ ] Text `y` values are baselines
- [ ] Icons are 8-bit grayscale PNGs with white glyphs
- [ ] No image is larger than the screen; at most one full-screen raster
- [ ] AOD frame is mostly black with dim text
- [ ] `npm run preview` passes with no `OVERFLOW` lines
- [ ] Glyph sets regenerated (`npm run glyphs`) after any font change
- [ ] Checked on the watch or simulator
