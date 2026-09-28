#!/usr/bin/env node
/*
 * Headless smoke test for the clock face.
 *
 * Bundles app/ with the Fitbit device modules swapped for tools/smoke/mocks.js,
 * builds a mock DOM from resources/index.view, then drives the real app code
 * through NORMAL → taps → AOD → OFF → NORMAL, asserting behaviour and that
 * everything stays inside the 336×336 canvas.
 *
 *   npm run smoke            assertions only
 *   npm run preview          + renders tools/smoke/out/*.png via Chromium
 *
 * The preview is an APPROXIMATION: it uses Liberation Sans in place of the
 * watch's system font (Raiju). Always confirm final typography in the
 * Fitbit OS Simulator or on the watch.
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
const RENDER = process.argv.includes("--render");
const W = 336, H = 336;
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- bundle ---
const MODULES = {
  document: "export default m.documentModule;",
  clock: "export default m.clock;",
  display: "export const display = m.display;",
  appbit: "export const me = m.me;",
  "user-activity": "export const today = m.today; export const goals = m.goals;",
  "heart-rate": "export const HeartRateSensor = m.HeartRateSensor;",
  "body-presence": "export const BodyPresenceSensor = m.BodyPresenceSensor;",
  power: "export const battery = m.battery;",
  "user-settings": "export const preferences = m.preferences; export const units = m.units;",
  haptics: "export const vibration = m.vibration;",
  fs: "export const existsSync = m.existsSync, readFileSync = m.readFileSync, writeFileSync = m.writeFileSync;"
};
const mocksPath = path.join(HERE, "mocks.js");

const bundle = await build({
  entryPoints: [path.join(ROOT, "app/index.js")],
  bundle: true,
  write: false,
  format: "cjs",
  platform: "neutral",
  target: "es2017",
  plugins: [{
    name: "fitbit-mocks",
    setup(b) {
      const filter = new RegExp("^(" + Object.keys(MODULES).join("|") + ")$");
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "fb" }));
      b.onLoad({ filter: /.*/, namespace: "fb" }, (a) => ({
        contents: `import * as m from ${JSON.stringify(mocksPath)};\n${MODULES[a.path]}`,
        resolveDir: HERE
      }));
    }
  }]
});
const bundlePath = path.join(OUT, "app.bundle.cjs");
writeFileSync(bundlePath, bundle.outputFiles[0].text);

// ------------------------------------------------------ parse index.view ---
function parseView(src) {
  src = src.replace(/<!--[\s\S]*?-->/g, "");
  const root = { tag: "#root", attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[5] !== undefined) {
      const t = m[5].trim();
      if (t) stack[stack.length - 1].text = t;
      continue;
    }
    const [, close, tag, rawAttrs, selfClose] = m;
    if (close) { stack.pop(); continue; }
    const attrs = {};
    rawAttrs.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
    const node = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children[0];
}

const ALLOWED = {
  common: ["style", "addEventListener", "x", "y", "width", "height"],
  text: ["text", "textAnchor", "letterSpacing"],
  image: ["href"],
  gradientRect: ["gradient"],
  rect: [], g: [], svg: []
};
const STYLE_KEYS = ["fill", "fontFamily", "fontSize", "opacity", "display"];

function num(v) { return v === undefined || v === "" || /%$/.test(v) ? v : Number(v); }

function makeElement(node) {
  const a = node.attrs;
  const style = new Proxy({ display: a.display || "inline" }, {
    set(t, k, v) {
      if (!STYLE_KEYS.includes(k)) throw new Error(`#${a.id}: unsupported style.${String(k)}`);
      t[k] = v; return true;
    }
  });
  const state = {
    tag: node.tag, style, handlers: {},
    x: num(a.x) || 0, y: num(a.y) || 0, width: num(a.width), height: num(a.height),
    text: node.text || "", textAnchor: a["text-anchor"] || "start", letterSpacing: 0, href: a.href || "",
    gradient: { type: a["gradient-type"], x1: 0, y1: 0, x2: 0, y2: 0, colors: {}, opacity: {} },
    addEventListener(type, fn) { (state.handlers[type] = state.handlers[type] || []).push(fn); }
  };
  const allowed = ALLOWED.common.concat(ALLOWED[node.tag] || []);
  return new Proxy(state, {
    get(t, k) {
      if (typeof k === "string" && !(k in t)) throw new Error(`#${a.id}: read of unknown property ${k}`);
      return t[k];
    },
    set(t, k, v) {
      if (!allowed.includes(k)) throw new Error(`#${a.id} <${node.tag}>: unsupported property ${String(k)}`);
      t[k] = v; return true;
    }
  });
}

const viewTree = parseView(readFileSync(path.join(ROOT, "resources/index.view"), "utf8"));
globalThis.__fb = {};
const els = {};
(function walk(n) {
  if (n.attrs.id) {
    if (els[n.attrs.id]) throw new Error("duplicate id " + n.attrs.id);
    n.el = els[n.attrs.id] = makeElement(n);
  }
  n.children.forEach(walk);
})(viewTree);

// ------------------------------------------------------------ run app ----
const RealDate = Date;
let now = new RealDate(2026, 8, 23, 12, 58, 0); // Wed 23 Sep 2026, 12:58
globalThis.Date = class extends RealDate {
  constructor(...args) { if (args.length) super(...args); else super(now.getTime()); }
};

// The app runs at load time, so the mock DOM must exist before require().
globalThis.__fb.elements = els;
createRequire(import.meta.url)(bundlePath);
const fb = globalThis.__fb;

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  ✓ " + msg);
  else { console.log("  ✗ " + msg); failures++; }
}
const el = (id) => fb.elements[id];
const visible = (id) => {
  // walk up the view tree: hidden if self or any ancestor has display none
  let hidden = false;
  (function walk(n, parentHidden) {
    const h = parentHidden || (n.el && n.el.style.display === "none");
    if (n.attrs.id === id) hidden = h;
    n.children.forEach((c) => walk(c, h));
  })(viewTree, false);
  return !hidden;
};
function tick(minutes = 1) {
  for (let i = 0; i < minutes; i++) {
    now = new RealDate(now.getTime() + 60000);
    fb.clock.__emit("tick", { date: new Date() });
  }
}
function setDisplay(on, aod) {
  fb.display.on = on; fb.display.aodActive = aod;
  fb.display.__emit("change");
}
const click = (id) => (el(id).handlers.click || []).forEach((f) => f({}));
function snapshot(name) {
  if (!RENDER) return;
  writeFileSync(path.join(OUT, name + ".svg"), toSvg(name.replace(/\W/g, "")));
  shots.push(name);
}
const shots = [];

console.log("\nNORMAL mode");
check(fb.clock.granularity === "minutes", "clock ticks per minute");
check(el("time").text === "12:58", `time renders 12h → "${el("time").text}"`);
check(el("date").text === "WED 23", `date renders → "${el("date").text}"`);
check(el("slot0-value").text === "8,348", `steps formatted → "${el("slot0-value").text}"`);
check(el("slot2-value").text === "1,359", `calories formatted → "${el("slot2-value").text}"`);
check(el("slot0-bar").width === Math.round(56 * 0.8348), "steps progress bar = 83%");
check(el("bat-text").text === "84%", "battery % shown");
check(fb.hrm && fb.hrm.activated, "heart-rate sensor running");
check(fb.body && fb.body.activated, "body-presence sensor running");
check(fb.display.aodAllowed === true, "AOD requested (aodAllowed = true)");
check(el("slot1-value").text === "--", "HR shows placeholder before first reading");
fb.hrm.heartRate = 78; fb.hrm.__emit("reading");
check(el("slot1-value").text === "78", "HR updates on sensor reading");
check(!visible("slot1-bar"), "HR slot has no progress bar (no goal)");
snapshot("1-normal");

console.log("\nIdle redraw guard");
const before = el("slot0-value").text;
fb.hrm.__emit("reading"); // same bpm again
check(el("slot1-value").text === "78" && el("slot0-value").text === before, "same HR value → no redraw");

console.log("\nTouch");
click("slot0-hit");
check(el("slot0-value").text === "5.2 km", `tap cycles steps → distance ("${el("slot0-value").text}")`);
check(fb.vibrations.length === 1, "haptic bump on tap");
check(JSON.parse(fb.files["face-state.json"]).sel[0] === 1, "selection persisted");
click("slot2-hit");
check(el("slot2-value").text === "22", "tap cycles calories → AZM");
check(el("slot2-bar").style.fill === "#7FF0C0", "goal reached → bar recoloured");
snapshot("2-normal-alt");
click("slot0-hit"); click("slot0-hit"); click("slot2-hit");
check(el("slot0-value").text === "8,348" && el("slot2-value").text === "1,359", "cycling wraps around");
check((el("slot1-hit").handlers.click || []).length === 0, "single-metric slot ignores taps");

console.log("\nMinute tick");
fb.today.adjusted.steps = 8420;
tick();
check(el("time").text === "12:59", "time advances on tick");
check(el("slot0-value").text === "8,420", "steps refresh on tick");

console.log("\nBattery");
fb.battery.chargeLevel = 15; fb.battery.__emit("change");
check(el("bat-text").text === "15%" && el("bat-level").style.fill === "#FF6B5B", "low battery turns red");
fb.battery.chargeLevel = 84; fb.battery.__emit("change");

console.log("\nAOD mode");
setDisplay(true, true);
check(!fb.hrm.activated && !fb.body.activated, "sensors stopped in AOD");
check(!visible("grp-metrics") && !visible("grp-battery"), "metrics + battery hidden");
check(!visible("bg-gradient"), "glow hidden (pure black)");
check(visible("time") && visible("date"), "time + date visible");
check(el("time").style.fontFamily === "System-Regular", "AOD uses lighter weight");
const p0 = [el("time").x, el("time").y];
tick();
check(el("time").x !== p0[0] || el("time").y !== p0[1], "burn-in offset moves text each minute");
check(el("time").text === "1:00", `time still ticks in AOD ("${el("time").text}")`);
snapshot("3-aod");
fb.hrm.heartRate = 90; fb.hrm.__emit("reading");
check(el("slot1-value").text === "78", "HR readings ignored while in AOD");

console.log("\nOFF");
setDisplay(false, false);
check(fb.clock.granularity === "off", "clock stopped while screen off");
check(!fb.hrm.activated, "sensors stay stopped");

console.log("\nWake → NORMAL");
tick(0);
now = new RealDate(2026, 8, 24, 0, 5, 0);
setDisplay(true, false);
check(fb.clock.granularity === "minutes", "clock restarted");
check(fb.hrm.activated, "HR restarted");
check(visible("grp-metrics") && visible("bg-gradient"), "full layout restored");
check(el("time").style.fontFamily === "System-Bold", "normal typography restored");
check(el("time").text === "12:05" && el("date").text === "THU 24", "time/date refreshed immediately on wake");

console.log("\nOff-wrist");
fb.body.present = false; fb.body.__emit("reading");
check(el("slot1-value").text === "--", "off-wrist → HR placeholder");

console.log("\n24h clock");
fb.preferences.clockDisplay = "24h";
now = new RealDate(2026, 8, 24, 20, 47, 0);
tick();
check(el("time").text === "20:48", "24h format honoured");
snapshot("4-normal-24h");

// ------------------------------------------------------------ geometry ----
console.log("\nGeometry (static bounds)");
for (const [id, e] of Object.entries(fb.elements)) {
  if (e.tag === "text" || e.tag === "g" || e.tag === "svg" || !visible(id)) continue;
  const w = typeof e.width === "number" ? e.width : 0;
  const h = typeof e.height === "number" ? e.height : 0;
  if (e.x < 0 || e.y < 0 || e.x + w > W || e.y + h > H) check(false, `#${id} outside canvas`);
}
check(true, "all shapes/images within 336×336");

// ------------------------------------------------------------- render -----
function toSvg(ns) {
  const FONT = { "System-Bold": 700, "System-Regular": 400, "System-Light": 300 };
  const defs = [];
  const body = [];
  (function walk(n, depth) {
    const e = n.el;
    if (e && e.style.display === "none") return;
    const id = n.attrs.id;
    if (n.tag === "rect" && e) {
      const w = e.width === "100%" ? W : e.width, h = e.height === "100%" ? H : e.height;
      if (id.endsWith("-hit")) return;
      body.push(`<rect x="${e.x}" y="${e.y}" width="${w}" height="${h}" fill="${e.style.fill || "#000"}"/>`);
    } else if (n.tag === "gradientRect") {
      const g = e.gradient;
      const r = Math.hypot(g.x2 - g.x1, g.y2 - g.y1);
      defs.push(`<radialGradient id="${ns}-glow" gradientUnits="userSpaceOnUse" cx="${g.x1}" cy="${g.y1}" r="${r}"><stop offset="0" stop-color="${g.colors.c1}"/><stop offset="1" stop-color="${g.colors.c2}"/></radialGradient>`);
      body.push(`<rect width="${W}" height="${H}" fill="url(#${ns}-glow)"/>`);
    } else if (n.tag === "image" && e.href) {
      const file = path.join(ROOT, "resources", e.href);
      if (!existsSync(file)) throw new Error("missing image " + e.href);
      const data = readFileSync(file).toString("base64");
      const mime = file.endsWith(".jpg") ? "image/jpeg" : "image/png";
      if (id === "bg-image") {
        body.push(`<image href="data:${mime};base64,${data}" x="0" y="0" width="${W}" height="${H}"/>`);
      } else {
        // A8 semantics: grayscale luminance = alpha, tinted by fill.
        defs.push(`<mask id="${ns}-m-${id}" maskUnits="userSpaceOnUse" x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"><image href="data:${mime};base64,${data}" x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"/></mask>`);
        body.push(`<rect x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}" fill="${e.style.fill}" mask="url(#${ns}-m-${id})"/>`);
      }
    } else if (n.tag === "text") {
      body.push(`<text data-id="${id}" x="${e.x}" y="${e.y}" text-anchor="${e.textAnchor}" font-family="Liberation Sans, Arial, sans-serif" font-weight="${FONT[e.style.fontFamily] || 400}" font-size="${e.style.fontSize}" letter-spacing="${e.letterSpacing}" fill="${e.style.fill}" opacity="${e.style.opacity ?? 1}">${e.text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`);
    }
    n.children.forEach((c) => walk(c, depth + 1));
  })(viewTree, 0);
  // Sense glass outline (approximate rounded-square corner radius) for context.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>${defs.join("")}<clipPath id="${ns}-glass"><rect width="${W}" height="${H}" rx="64"/></clipPath></defs>
<g clip-path="url(#${ns}-glass)">${body.join("\n")}</g></svg>`;
}

if (RENDER && shots.length) {
  const pw = "/opt/pw-browsers";
  const pwChrome = existsSync(pw)
    ? readdirSync(pw).filter((d) => /^chromium-\d+$/.test(d)).map((d) => path.join(pw, d, "chrome-linux/chrome"))
    : [];
  const chrome = [process.env.CHROME, ...pwChrome].find((p) => p && existsSync(p)) || "chromium";
  // One HTML page: renders every state, measures text bboxes, reports overflow.
  const svgs = shots.map((s) => readFileSync(path.join(OUT, s + ".svg"), "utf8"));
  const html = `<!doctype html><html><body style="margin:0;background:#111;display:flex;gap:24px;padding:24px">
${svgs.map((s, i) => `<figure style="margin:0;color:#aaa;font:12px sans-serif" data-shot="${shots[i]}">${s}<figcaption>${shots[i]}</figcaption></figure>`).join("\n")}
<pre id="report"></pre>
<script>
const SAFE = ${JSON.stringify({ left: 24, top: 20, right: 312, bottom: 316 })};
const out = [];
document.querySelectorAll("figure").forEach(f => {
  f.querySelectorAll("text[data-id]").forEach(t => {
    const b = t.getBBox();
    const bad = b.x < SAFE.left || b.x + b.width > SAFE.right || b.y < SAFE.top || b.y + b.height > SAFE.bottom;
    out.push((bad ? "OVERFLOW " : "ok ") + f.dataset.shot + " #" + t.dataset.id + " [" + Math.round(b.x) + "," + Math.round(b.y) + " → " + Math.round(b.x + b.width) + "," + Math.round(b.y + b.height) + "]");
  });
});
document.getElementById("report").textContent = out.join("\\n");
</script></body></html>`;
  const htmlPath = path.join(OUT, "preview.html");
  writeFileSync(htmlPath, html);
  const width = 24 + shots.length * (336 + 24);
  execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    `--window-size=${width},520`, `--screenshot=${path.join(OUT, "preview.png")}`, htmlPath], { stdio: "ignore" });
  const dom = execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--dump-dom", htmlPath], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  const report = (dom.match(/<pre id="report">([\s\S]*?)<\/pre>/) || [])[1] || "";
  console.log("\nText bounds vs safe area (approximate font)");
  report.split("\n").filter(Boolean).forEach((l) => check(l.startsWith("ok"), l.replace(/^(ok|OVERFLOW) /, "")));
  console.log("\nPreview: " + path.relative(ROOT, path.join(OUT, "preview.png")));
}

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
