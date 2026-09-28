# Sense Minimal: Fitbit Sense clock face

A monochrome HUD-style clock face for the **Fitbit Sense** (336 × 336), built on the official Fitbit SDK 6.1. Double-line corner brackets frame the screen. The day, time and date stack on the left; on the right are four stat rows (**calories, heart rate, steps, sleep**), each with an icon, label, value and an outlined progress bar. Everything is set in **Barlow Condensed**, white on black. It includes a dim, burn-in-safe **Always-On Display** mode.

![Preview: normal, alternate metrics after tapping, AOD, 24h](docs/preview.png)

*Preview rendered by the headless smoke test from the same glyph images the watch uses: normal, after tapping rows, AOD, and the next evening in 24h mode.*

| Shown | Source (Fitbit API) | Updates |
|---|---|---|
| Time | `clock` (minute granularity) + `user-settings.preferences.clockDisplay` | every minute |
| Date / weekday | `Date` from the clock tick | when the day changes |
| Steps, calories, distance, floors, AZM + goal bars | `user-activity` `today.adjusted` / `goals` | every minute + on wake |
| Heart rate | `heart-rate` `HeartRateSensor` + `body-presence` | live, screen-on only |
| Sleep (last night) | `sleep.state` changes, logged on the watch (see Limitations) | on each change + every minute |
| Battery % (hidden by default, like the reference) | `power.battery` `change` event | when it changes |
| AOD | `display.aodAvailable / aodAllowed / aodActive` | minute tick only |

---

## 1. Requirements

- **Node.js 18 LTS** is recommended; 16–22 are known to build. Using [`nvm`](https://github.com/nvm-sh/nvm) lets you switch versions.
- **A Fitbit account** that is signed in on the phone paired with your Sense.
- **Fitbit OS Simulator** (optional). It runs on **Windows and macOS only**; Fitbit has not shipped a Linux build.
- **Linux only:** `@fitbit/sdk-cli` depends on `keytar`, which needs `libsecret`. Install it with:
  `sudo apt install libsecret-1-dev` (Debian/Ubuntu) or `sudo dnf install libsecret-devel` (Fedora).
- **Optional:** Python 3 + Pillow (`pip install pillow`), only needed to regenerate the placeholder icons.

## 2. Fitbit SDK setup

The SDK is an npm dev-dependency, so nothing is installed globally:

```bash
cd fitbit-sense-clockface
npm install
```

That installs:

- `@fitbit/sdk` 6.1: the build toolchain (`fitbit-build`). SDK 6.x targets **Sense (`vulcan`)** and Versa 3 (`atlas`).
- `@fitbit/sdk-cli`: the `fitbit` debugger shell, used to install onto the watch or the simulator.
- `esbuild`: used only by the local smoke test.

The build target is set to Sense only in `package.json → fitbit.buildTargets: ["vulcan"]`. To also ship for Versa 3, add `"atlas"`; it has the same 336 × 336 screen.

> Fitbit Studio (the old browser IDE) has been retired. The CLI above is the supported route.

## 3. Project structure

```
fitbit-sense-clockface/
├── package.json            # Fitbit manifest: UUID, permissions, build targets
├── app/                    # runs on the watch
│   ├── index.js            # entry point: wiring only
│   ├── config/             # ◀ everything a designer edits
│   │   ├── theme.js        #   colours, fonts, type sizes, background
│   │   ├── glyphs.js       #   GENERATED bitmap-font metrics (npm run glyphs)
│   │   ├── layout.js       #   every x/y/size (normal + AOD), safe area
│   │   └── settings.js     #   time/date format, which metrics, taps, AOD
│   ├── core/               # pure logic, no Fitbit imports
│   │   ├── time.js         #   time + date formatting
│   │   └── format.js       #   number formatting, progress maths
│   ├── data/               # Fitbit sensors & APIs; never touch the DOM
│   │   ├── activity.js     #   steps/calories/distance/floors/AZM + goals
│   │   ├── heartRate.js    #   HR sensor + on-wrist detection
│   │   ├── battery.js      #   battery level events
│   │   ├── sleep.js        #   asleep/awake log → minutes slept
│   │   └── metrics.js      #   ◀ metric registry (id → data, format, icon)
│   ├── ui/                 # drawing only; never touch sensors
│   │   ├── dom.js          #   change-guarded setters (no redundant redraws)
│   │   ├── label.js        #   text via bitmap font OR system font
│   │   ├── face.js         #   builds all components once
│   │   ├── background.js   #   gradient / image / solid
│   │   ├── clockText.js    #   time + date (normal & AOD placement)
│   │   ├── battery.js      #   vector battery glyph + %
│   │   ├── frame.js        #   double-line corner brackets
│   │   ├── stats.js        #   stat rows: icon, label, value, outlined bar
│   │   └── interaction.js  #   tap-to-cycle
│   ├── modes/
│   │   ├── controller.js   #   display state machine: NORMAL ⇄ AOD ⇄ OFF
│   │   ├── normal.js       #   full face behaviour
│   │   └── aod.js          #   always-on behaviour
│   └── state/store.js      # remembers which metric each row shows
├── resources/              # packaged onto the watch
│   ├── index.view          # element skeleton (ids + paint order)
│   ├── styles.css          # fallback styles only
│   ├── widget.defs
│   ├── icon.png            # 80×80 app icon (required size)
│   ├── icons/*.png         # grayscale 14×14 stat icons, tintable
│   ├── glyphs/<set>/*.png  # bitmap font: one grayscale PNG per character
│   └── bg/background.jpg   # optional raster background
├── tools/
│   ├── smoke/              # headless test: real app code + mocked Fitbit APIs
│   ├── generate_glyphs.py  # font file → glyph PNGs + glyphs.js
│   ├── generate_icons.py   # regenerates the placeholder art
│   └── fonts/              # Barlow Condensed + Semi Condensed (SIL OFL 1.1)
├── DESIGN.md               # Figma → clock face handbook
└── docs/preview.png
```

The data flow runs one way: **data → modes → ui**. `ui/` never imports a sensor, and `data/` never imports `document`. You can therefore replace the whole look without touching sensor code.

## 4. Build

```bash
npm run build          # → build/app.fba
```

The build produces the watch app, a phone companion and a settings page (used for dashboard sync).

Before building on the watch, you can run the local checks:

```bash
npm run smoke          # ~40 behavioural checks against mocked Fitbit APIs
npm run preview        # same + renders tools/smoke/out/preview.png (needs Chrome/Chromium)
```

The smoke test bundles the real `app/` code and walks it through normal → tap → AOD → screen off → wake → off-wrist → 24h. It also fails if code sets an element property or style that the Fitbit SVG API doesn't support.

## 5. Run in the simulator

1. Install **Fitbit OS Simulator** (Windows/macOS) from the Fitbit developer site, then launch it.
2. In the simulator's settings, choose **Device → Fitbit Sense**.
3. In the project folder, run:
   ```bash
   npx fitbit
   fitbit$ build-and-install      # or: bi
   ```
   The first time, `npx fitbit` opens a browser so you can sign in to your Fitbit account.
4. Use the simulator panels to change heart rate, steps, battery and **AOD**, and to switch the 12h/24h setting.

## 6. Install on your Fitbit Sense

1. On the phone, open the **Fitbit app → Today → your profile → Sense → Developer Menu** and turn on **Developer Bridge**. If the Developer Menu is missing, tap the watch image repeatedly or check the Fitbit community for your app version.
2. On the watch, open **Settings → Developer Bridge**. On some firmware it's under *Settings → About*. Wait until it says **Connected to server**. Keep the watch on its charger for a stable connection.
3. On your computer, run:
   ```bash
   npx fitbit
   fitbit$ build-and-install
   ```
4. The face installs and becomes active. `fitbit$ logs` streams `console.log` output from the watch.

**Keeping the face installed.** A sideloaded face stays on the watch until you install another face. To distribute it, upload `build/app.fba` in the Fitbit **Gallery App Manager** (gam.fitbit.com).

**Accounts.** Fitbit is moving accounts to Google accounts. If `npx fitbit` login fails for a migrated account, check the Fitbit developer community for the current sign-in route. This part of the tooling hasn't been updated since SDK 6.1.

## 7. Modify the design

Every visual value lives in `app/config/`. For a full Figma workflow, see **[DESIGN.md](DESIGN.md)**.

| I want to… | Edit |
|---|---|
| Move something | `app/config/layout.js`: x/y/size per element; `NORMAL` and `AOD` are separate |
| Change colours / fonts / sizes | `app/config/theme.js` |
| Change what's shown / formats | `app/config/settings.js` |
| Swap an icon | Replace the file in `resources/icons/` (same name, 14×14 grayscale PNG) |
| Use a raster background | `theme.js → BACKGROUND.type = "image"` and drop your file at `resources/bg/background.jpg` |
| Add a new element | Add it to `resources/index.view` with an id, then style/position it in a `ui/` component |

After each change, run `npm run preview` to check quickly, then use `build-and-install` to see the real thing.

## 8. Colours

All colours are defined in one object, `COLORS`, in `app/config/theme.js`:

```js
frame: "#FFFFFF",       // corner brackets
textPrimary: "#FFFFFF", // time
barOutline: "#FFFFFF",  // box around each bar
progress: "#D9D9D9",    // bar fill
goalReached: "#FFFFFF", // fill brightens to white at 100%
aodTime: "#9E9E9E",     // keep AOD colours dim
```

Use `#RRGGBB`. Don't rely on alpha in hex values; set transparency with the `opacity` field on a `TYPE` style instead. Icons pick up `COLORS.icon` automatically, because they are grayscale masks.

## 9. Typography

All text is drawn in **Barlow Condensed**. Fitbit can't load font files, so the face uses a **bitmap font**: every character is pre-rendered as a small grayscale PNG, and `app/ui/label.js` lays the characters out and tints them with the theme colours.

| Glyph set | Weight | Size | Used for |
|---|---|---|---|
| `time` | Medium 500 | 60 | time |
| `date` | Medium 500 | 30 | day ("SAT") and date ("10/11") |
| `label` | Medium 500 | 17 | stat labels (CALORIES, …) |
| `value` | Medium 500 | 20 | stat values |
| `timeAod` | Light 300 | 104 | AOD time |
| `dateAod` | Regular 400 | 24 | AOD date |
| `battery` | Semi Condensed Medium 500 | 17 | battery % (hidden by default) |

- **Change sizes, weights or characters:** edit the `SETS` table in `tools/generate_glyphs.py`, then run `npm run glyphs`. That regenerates `resources/glyphs/` and `app/config/glyphs.js`.
- **Use a different typeface:** put its `.ttf`/`.otf`/`.woff` file in `tools/fonts/`, point `SETS` at it, and run `npm run glyphs`.
- **Change spacing and colour** (no regeneration needed): edit `letterSpacing` and `fill` in `TYPE` in `theme.js`.
- **Go back to Fitbit's system font (Raiju):** set `USE_BITMAP_FONT = false` in `theme.js`. The system sizes come from `fontSize` in each `TYPE` style.
- **Figma:** Barlow Condensed is a free Google Font, so the Figma file can use the exact same font as the watch.

## 10. Add or remove metrics

The four stat rows are configured in `app/config/settings.js`:

```js
export const STATS = [
  ["calories", "azm"],               // tap cycles through these
  ["heartRate"],                      // single metric → tap does nothing
  ["steps", "distance", "floors"],
  ["sleep"]
];
```

- **Change a row:** swap its ids. Available: `calories`, `heartRate`, `steps`, `sleep`, `azm`, `distance`, `floors`.
- **Use fewer rows:** remove lists (1–4 rows), and trim `layout.js → NORMAL.stats.tops` to match.
- **Add a new metric type:** add an entry to `app/data/metrics.js` with `label`, `icon`, `value()`, `progress()` and `format()`. Add its icon to `resources/icons/`, then reference its id in `STATS`. The label's letters must exist in the `label` glyph set. If the metric needs a new permission, add it to `package.json → fitbit.requestedPermissions`.
- **Sleep goal:** `settings.js → SLEEP.goalMinutes` (default 480 = 8 h) sets how full the sleep bar gets.
- **Date order:** `settings.js → DATE.format` is `"D/M"` (10/11 = 10 November). Use `"M/D"` for US order.
- **Show the battery:** set `settings.js → BATTERY.show = true`. It's off by default, because the reference has none.

## 11. Debugging common problems

| Symptom | Cause / fix |
|---|---|
| `npm install` fails on `keytar` / `libsecret-1` | Linux: install `libsecret-1-dev`, then reinstall. Only the CLI needs it; `npm install --ignore-scripts` still lets `npm run build` work. |
| `npx fitbit` crashes with `MODULE_NOT_FOUND … @openid/appauth/built/…` | The CLI's login library published an incompatible 1.4. `package.json → overrides` pins it to 1.3.2. Delete `node_modules` and `package-lock.json`, then run `npm install` again. |
| `Missing element #xyz in resources/index.view` | An id was renamed or removed in `index.view` but is still used in `app/ui/`. Keep ids in sync. |
| `Unknown metric id in settings.STATS` | A typo in `STATS`, or the id is missing from `data/metrics.js`. |
| SLEEP shows `--` | No sleep recorded yet. It only counts sleep while this face is active; see Limitations. |
| Values show `--` | The permission is not granted. Re-grant it in **Fitbit app → clock face → Permissions**. HR also shows `--` when the watch is off-wrist. |
| A character is missing or shows a gap | It isn't in that glyph set. Add it to `SETS` in `tools/generate_glyphs.py` and run `npm run glyphs`. The `fitbit$ logs` output names the missing glyph. |
| Icon appears as a solid square | The PNG is RGB/RGBA, not **grayscale**. Re-export it as 8-bit grayscale (white = visible). |
| Steps lag by up to a minute | This is by design: activity is read on each minute tick and on wake, to save battery. |
| AOD never shows the face | Expected: `access_aod` is partner-only, so it isn't requested (see "Limitations"). |
| `Install failed: … internal only permission` | A restricted permission (such as `access_aod`) is listed in `package.json → requestedPermissions`. Remove it. |
| Developer Bridge won't connect | Put the watch on its charger. Toggle the bridge on both the phone and the watch. Make sure the phone and computer are online and signed in to the same account. |
| Text clipped at the corners | Stay inside `SAFE_AREA` in `layout.js`, and remember text `y` is the **baseline**. |
| `console.log` output | Run `fitbit$ logs` in the CLI shell. |

---

## Dashboard sync (Notion → Ops Desk)

Optional: the face sends your stats to a Notion page that the Ops Desk dashboard reads.

```
watch (app/data/sync.js) ──file transfer──▶ phone (companion/index.js) ──HTTPS──▶ Notion "Fitbit Stats" page ──▶ Ops Desk "Health" card
```

- **What's sent:** steps, calories, heart rate, sleep minutes, active minutes, distance, and a timestamp. It goes every 15 minutes, only when a value changed.
- **Where it goes:** only to `api.notion.com`, using the Notion key you paste into the face's settings in the Fitbit app. The key never leaves your phone.
- **Setup:**
  1. At notion.so/my-integrations, create an internal integration and copy its secret.
  2. On the **Fitbit Stats** page, open **⋯ → Connections** and add that integration.
  3. In the Fitbit app, go to **Clock Faces → Sense Minimal → Settings** and paste the secret.
  - **Can't find the face in the Fitbit app?** The redesigned Fitbit app hides faces installed from a computer, so the Settings screen is unreachable. Instead, run `npm run set-key` on your computer, paste the secret, then `build-and-install`. The key is saved to `companion/secrets.js`, which is git-ignored and never pushed. `npm run set-key -- --clear` removes it.
- **Turn it off:** set `settings.js → SYNC.enabled = false`, or revoke the integration in Notion.
- **Check it:** the settings screen shows "Last synced …" or the exact error. With `npx fitbit` connected, the Terminal also prints `Dashboard sync: stats written to Notion ✓`, or the failure reason.

## Limitations (Fitbit SDK / Sense)

These were checked against the SDK 6.1 toolchain source and API surface. Nothing is faked; each item notes the closest supported alternative.

1. **Always-On Display is partner-only.** SDK 6.1 lists `access_aod` as *"[Restricted] Always-on Display"*. On a real Sense, a sideloaded app that requests it is rejected: *"Install failed: … you used an internal only permission."* So `package.json` does **not** request it. AOD mode is still fully implemented and tested; it switches on automatically if the permission is ever granted. It only activates when `display.aodAvailable && me.permissions.granted("access_aod")`. To try it, for example if Fitbit approves your app, add `"access_aod"` back to `requestedPermissions`. Without it, the screen turns off normally.
2. **Custom fonts can't be loaded.** Fitbit only has its system fonts. This face works around that with a bitmap font (pre-rendered PNG glyphs), which is why Barlow works. The catch: sizes are fixed when the glyphs are generated, and there's no kerning, only per-character advance widths.
3. **Activity data has no change event.** `user-activity` can only be polled. The face reads it once a minute and on wake, instead of every second.
4. **No settings page yet.** A phone-side settings UI (colour pickers and similar) needs a companion + settings component plus messaging, which is a meaningful memory and complexity cost. The values are compile-time config for now. The architecture leaves room to add one later: `settings.js` values would be overridden at runtime.
5. **Rounded rectangles and stroked outlines aren't available.** Fitbit `<rect>` has no corner radius or stroke-only mode, so the bar boxes and corner brackets are built from thin filled rects.
6. **Simulator OS support.** The simulator is Windows/macOS only. On Linux, use `npm run preview` plus a real watch.
7. **English day/month names.** The JS engine has no `Intl`. Names live in `app/core/time.js` and can be translated in place.
8. **Sleep is an on-watch estimate.** The device SDK only exposes the current sleep *state* (`asleep` / `awake`), not your sleep log. The Fitbit app's sleep time and stages live in Fitbit's cloud, reachable only through the Web API from a phone companion with OAuth (a Fitbit developer app registration, and the phone nearby). So `data/sleep.js` records each asleep→awake period while this face is running (screen off included), saves it on the watch, and shows the total over the last 20 hours. It won't count time spent in another app or across a watch restart, and it can differ from the Fitbit app's number. The closest exact alternative is a companion that pulls sleep from the Web API; the architecture supports adding one.
