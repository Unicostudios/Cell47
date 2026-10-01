/*
 * Jarvis — a Mac app for the Ops Desk dashboard.
 *
 * - Opens on a voice-first home screen (the living form); the dashboard is one
 *   button or "Jarvis, open the dashboard" away. A loader covers startup.
 * - Lives in the menu bar and keeps running when the window is closed.
 * - Always listening: anything you say with "Jarvis" in it is a request, and
 *   after it answers it listens for your reply. Speech-to-text and Jarvis's
 *   voice ("Sarah") both run on the Mac (voice.js, tts-worker.js): free.
 * - Sound is allowed without a tap, so the spoken greeting always plays.
 *
 * An optional ElevenLabs key (backup speech-to-text) is kept encrypted with the
 * macOS Keychain (safeStorage); it's only sent to ElevenLabs.
 */
const {
  app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage,
  shell, session, globalShortcut, Notification, systemPreferences, utilityProcess, WebContentsView
} = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const DASHBOARD_URL = "https://claude.ai/artifact/GgHwacYvD1hZgNT9EjZAk5";
const PARTITION = "persist:jarvis";
const HOTKEY = "Alt+Space";           // press to talk without saying "Jarvis"

app.setName("Jarvis");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, view = null, loaderView = null, tray = null, settingsWin = null, voice = null;
let cropTop = 0;   // height of claude.ai's bar above the dashboard, pushed out of sight
let quitting = false;

// ---------------------------------------------------------------- config --
const CONFIG_FILE = () => path.join(app.getPath("userData"), "config.json");
const DEFAULTS = { listening: true, openAtLogin: true, sensitivity: 0.5, sttModel: "scribe_v1" };

function readConfig() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(CONFIG_FILE(), "utf8"))); }
  catch (e) { return Object.assign({}, DEFAULTS); }
}
function writeConfig(c) {
  fs.mkdirSync(path.dirname(CONFIG_FILE()), { recursive: true });
  fs.writeFileSync(CONFIG_FILE(), JSON.stringify(c, null, 2));
}
function seal(s) {
  if (!s) return "";
  return safeStorage.isEncryptionAvailable() ? "enc:" + safeStorage.encryptString(s).toString("base64") : "raw:" + s;
}
function unseal(s) {
  if (!s) return "";
  if (s.startsWith("enc:")) { try { return safeStorage.decryptString(Buffer.from(s.slice(4), "base64")); } catch (e) { return ""; } }
  return s.startsWith("raw:") ? s.slice(4) : "";
}
function keys() {
  const c = readConfig();
  return { elevenlabs: unseal(c.elevenlabsKey) };
}

// ------------------------------------------------------------- dashboard --
let dashCache = null;
async function dashFrame() {
  if (!view) return null;
  // Reuse the frame found last time while it's still alive (this runs many times a second).
  if (dashCache) {
    try { if (!dashCache.detached && await dashCache.executeJavaScript("!!document.getElementById('cmd-input')")) return dashCache; } catch (e) {}
    dashCache = null;
  }
  for (const f of view.webContents.mainFrame.framesInSubtree) {
    try { if (await f.executeJavaScript("!!document.getElementById('cmd-input')")) return (dashCache = f); } catch (e) {}
  }
  return null;
}
// Fire-and-forget into the cached frame (for the blob's live voice levels).
function toDashFast(js) {
  if (dashCache && !dashCache.detached) dashCache.executeJavaScript(js).catch(() => { dashCache = null; });
  else inDash(js);
}
async function inDash(js) {
  const f = await dashFrame();
  if (!f) return false;
  try { await f.executeJavaScript(js); return true; } catch (e) { return false; }
}
// Like inDash, but returns what the code evaluates to (undefined if it can't run).
async function askDash(js) {
  const f = await dashFrame();
  if (!f) return undefined;
  try { return await f.executeJavaScript(js); } catch (e) { return undefined; }
}

function createWindow() {
  const ses = session.fromPartition(PARTITION);
  // Look like regular Chrome so sign-in pages (Google, etc.) accept the window.
  ses.setUserAgent(ses.getUserAgent().replace(/\s(Electron|Jarvis|jarvis)\/\S+/g, ""));
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(permission !== "geolocation"));

  win = new BrowserWindow({
    width: 1340, height: 900, minWidth: 420, minHeight: 560,
    title: "Jarvis",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#000000",
    show: false,
    fullscreenable: true
  });
  // The page sits in its own view inside the window. The view is placed a little
  // above the window's top edge, so claude.ai's bar over the dashboard is simply
  // out of sight: nothing on claude.ai's page is changed.
  view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
  view.setBackgroundColor("#000000");
  win.contentView.addChildView(view);
  // The loader sits on top until the dashboard says it's ready.
  loaderView = new WebContentsView({ webPreferences: { contextIsolation: true, sandbox: true } });
  loaderView.setBackgroundColor("#000000");
  win.contentView.addChildView(loaderView);
  loaderView.webContents.loadFile(path.join(__dirname, "loader.html"));
  setTimeout(hideLoader, 40000);   // never leave it up
  layout();
  for (const ev of ["resize", "enter-full-screen", "leave-full-screen"]) win.on(ev, layout);
  const wc = view.webContents;
  wc.loadURL(DASHBOARD_URL);
  win.show(); goFullScreen();

  // Links open in your normal browser; sign-in pop-ups stay inside the app.
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com|google\.com|apple\.com|notion\.so|notion\.com)\//i.test(url) &&
        /(login|oauth|auth|signin|sso|consent|accounts)/i.test(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, webPreferences: { partition: PARTITION } } };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Tell the dashboard it's running inside the app (hint text, silent wake).
  wc.on("did-frame-finish-load", () => {
    setTimeout(async () => {
      const lv = !speaker || speaker.failed ? "'off'" : String(!!speaker.ready);
      const ok = await inDash("window.__inJarvisApp = true; window.__jarvisAppVersion = " + JSON.stringify(app.getVersion()) +
        "; window.__jarvisLocalVoice = " + lv + "; window.jarvisAppReady && jarvisAppReady();" +
        " window.JarvisHome && JarvisHome.problem(" + JSON.stringify(problemText) + ");");
      if (ok) setTimeout(hideLoader, 1500);   // backup, in case the page's own "ready" didn't arrive
    }, 400);
    measureCrop();
  });
  wc.on("did-finish-load", measureCrop);
  // The dashboard hands speech to the app as console lines ("[jarvis-say]{…}").
  wc.on("console-message", (e) => {
    const text = e && e.message;
    if (text === "[jarvis-ready]") return hideLoader();
    if (typeof text === "string" && text.startsWith("[jarvis-say]") && speaker) {
      try { speaker.handle(JSON.parse(text.slice(12))); } catch (err) {}
    }
  });
  wc.on("did-navigate", () => { cropTop = 0; layout(); });   // e.g. the sign-in page: show all of it
  // Not the dashboard (e.g. claude.ai's sign-in page): take the loader away so you can sign in.
  wc.on("did-finish-load", () => {
    try { if (!new URL(wc.getURL()).pathname.startsWith("/artifact/")) setTimeout(hideLoader, 600); } catch (e) {}
  });
  setInterval(measureCrop, 2000);

  // Closing keeps Jarvis running. Leave full screen first, so macOS doesn't
  // leave an empty full-screen space behind, then hide.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    hideWindow();
  });
  // While the window is closed, "Jarvis" on its own opens it and greets you before listening.
  win.on("show", syncWakeMode);
  win.on("hide", syncWakeMode);
}

async function hideWindow() {
  // Blank the dashboard first, so the next open starts clean with the entrance
  // (instead of flashing the old dashboard before the orb).
  await inDash("window.jarvisPrepareWake && jarvisPrepareWake()");
  await new Promise((r) => setTimeout(r, 150));
  if (win.isFullScreen()) { win.once("leave-full-screen", () => win.hide()); win.setFullScreen(false); }
  else win.hide();
}

// Show the window; if it was closed, play the entrance (greet = say hello out loud).
// Returns true if it was closed.
function reveal(greet) {
  const wasHidden = !win || !win.isVisible();
  showWindow();
  if (wasHidden) inDash("window.jarvisWake && jarvisWake(true, { silent: " + !greet + " })");
  return wasHidden;
}
function syncWakeMode() {
  if (voice) voice.setCaptureOnWake(!!win && win.isVisible());
}

function layout() {
  if (!win || !view) return;
  const [w, h] = win.getContentSize();
  view.setBounds({ x: 0, y: -cropTop, width: w, height: h + cropTop });
  if (loaderView) loaderView.setBounds({ x: 0, y: 0, width: w, height: h });
}

function hideLoader() {
  const lv = loaderView;
  if (!lv || lv.leaving) return;
  lv.leaving = true;
  lv.webContents.executeJavaScript("window.fadeOut && fadeOut()").catch(() => {});
  setTimeout(() => {
    try { win.contentView.removeChildView(lv); } catch (e) {}
    try { lv.webContents.close(); } catch (e) {}
    if (loaderView === lv) loaderView = null;
  }, 650);
}

// On the dashboard page, find how far down claude.ai puts the dashboard frame.
// Also keeps a thin invisible strip along the top of the window for dragging it.
const MEASURE_JS = `(() => {
  if (!location.pathname.startsWith("/artifact/")) return 0;
  let best = null, area = 0;
  for (const f of document.querySelectorAll("iframe")) {
    const r = f.getBoundingClientRect(), a = r.width * r.height;
    if (a > area) { area = a; best = f; }
  }
  if (!best || area < innerWidth * innerHeight * 0.4) return 0;
  const top = Math.max(0, Math.min(200, Math.round(best.getBoundingClientRect().top)));
  let d = document.getElementById("jarvis-drag");
  if (!d) {
    d = document.createElement("div");
    d.id = "jarvis-drag";
    d.style.cssText = "position:fixed;left:0;right:0;height:30px;z-index:2147483601;-webkit-app-region:drag;";
    document.body.appendChild(d);
  }
  d.style.top = top + "px";
  return top;
})()`;
async function measureCrop() {
  if (!view) return;
  let top = 0;
  try { top = Number(await view.webContents.executeJavaScript(MEASURE_JS)) || 0; } catch (e) {}
  if (top !== cropTop) { cropTop = top; layout(); }
}

// Jarvis always runs full screen.
function goFullScreen() {
  if (win && !win.isFullScreen()) win.setFullScreen(true);
}

function showWindow() {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  goFullScreen();
  app.focus({ steal: true });
}

// ----------------------------------------------------------- speaking ----
// Jarvis's voice ("Sarah") is made on the Mac in tts-worker.js and played with
// macOS's afplay, one chunk at a time, while the next chunk is being made.
const PLAYER = process.env.JARVIS_PLAYER || (process.platform === "darwin" ? "afplay" : "aplay");
let speaker = null;
class Speaker {
  constructor() { this.gen = 0; this.ready = false; this.items = []; this.player = null; }
  start() {
    const proc = this.proc = utilityProcess.fork(path.join(__dirname, "tts-worker.js"), [], { serviceName: "Jarvis Speech" });
    proc.on("message", (m) => {
      if (m.type === "ready") { this.ready = true; inDash("window.__jarvisLocalVoice = true; window.jarvisLocalVoiceReady && jarvisLocalVoiceReady()"); }
      else if (m.type === "initError") {
        console.error("[jarvis] voice:", m.message); log("voice model: " + m.message);
        this.failed = true;
        inDash("window.__jarvisLocalVoice = 'off'; window.jarvisLocalVoiceReady && jarvisLocalVoiceReady()");
        if (!problemText) showProblem("Sarah's voice didn't load, so Jarvis is using the backup voice. Run: npm run doctor");
      }
      else if (m.type === "audio" || m.type === "sayError") {
        const it = m.gen === this.gen && this.items.find((x) => x.id === m.id);
        if (!it) { if (m.file) fs.rm(m.file, { force: true }, () => {}); return; }
        if (m.type === "audio") { it.file = m.file; it.env = m.env; } else { it.error = m.message || "error"; log("voice error: " + it.error); }
        this.pump();
      }
    });
    proc.on("exit", () => {
      if (this.proc !== proc) return;
      this.ready = false; this.proc = null;
      this.failed = true;
      inDash("window.__jarvisLocalVoice = 'off'; window.jarvisLocalVoiceReady && jarvisLocalVoiceReady()");
      this.stop();
    });
    proc.postMessage({ type: "init", modelDir: path.join(__dirname, "models") });
  }
  handle(m) {
    if (m.op === "say" && this.proc && this.ready) {
      this.items.push({ id: Number(m.id), gen: this.gen });
      this.syncSpeaking();
      this.proc.postMessage({ type: "say", id: Number(m.id), gen: this.gen, text: String(m.text || "").slice(0, 2000) });
    } else if (m.op === "say") {
      this.report("done", m.id);
    } else if (m.op === "stop") {
      this.stop();
    }
  }
  stop() {
    this.gen++;
    if (this.proc) this.proc.postMessage({ type: "gen", gen: this.gen });
    for (const it of this.items) if (it.file) fs.rm(it.file, { force: true }, () => {});
    this.items = [];
    if (this.player) { const p = this.player; this.player = null; try { p.kill(); } catch (e) {} }
    this.syncSpeaking();
  }
  // Tell the listener while Jarvis is talking (or about to), so it doesn't hear itself.
  syncSpeaking() {
    const on = !!this.player || this.items.length > 0;
    if (on !== this.speakingNow) { this.speakingNow = on; if (voice) voice.setSpeaking(on); }
  }
  pump() {
    if (this.player) return;
    const it = this.items[0];
    if (!it || (!it.file && !it.error)) return this.syncSpeaking();
    this.items.shift();
    if (it.error) { this.report("done", it.id); return this.pump(); }
    this.report("start", it.id, it.env);
    const p = this.player = spawn(PLAYER, [it.file], { stdio: "ignore" });
    const finished = () => {
      fs.rm(it.file, { force: true }, () => {});
      if (this.player !== p) return;            // stopped: the dashboard already moved on
      this.player = null;
      this.report("done", it.id);
      this.pump();
    };
    p.on("exit", finished);
    p.on("error", finished);
  }
  report(ev, id, env) {
    inDash("window.jarvisLocalSpeech && jarvisLocalSpeech(" + JSON.stringify(ev) + "," + Number(id) + (env ? "," + JSON.stringify(env) : "") + ")");
  }
  quit() { this.stop(); if (this.proc) { const p = this.proc; this.proc = null; try { p.kill(); } catch (e) {} } }
}

// ----------------------------------------------------------------- voice --
function voiceState(state, detail) {
  inDash("window.jarvisVoiceState && jarvisVoiceState(" + JSON.stringify(state) + "," + JSON.stringify(detail || "") + ")");
  updateTray(state);
}

function startVoice() {
  stopVoice();
  const c = readConfig(), k = keys();
  if (!c.listening) return updateTray();
  voice = new VoiceProcess({
    modelDir: path.join(__dirname, "models"), elevenlabsKey: k.elevenlabs,
    sensitivity: Number(c.sensitivity) || 0.5, sttModel: c.sttModel,
    onWake: (hasRequest) => {
      // "Hey Jarvis, <request>": just open (if closed) and do it.
      if (hasRequest) { reveal(false); return; }
      // "Hey Jarvis" on its own. Closed: open with the entrance and greeting, then
      // listen once it's said hello. Open: the voice engine is already listening.
      if (reveal(true)) listenForFollowUp();
    },
    onLevel: (v) => toDashFast("window.jarvisLevel && jarvisLevel(" + (Math.round(v * 100) / 100) + ")"),
    onHeard: (text) => { log("heard: " + text); toDashFast("window.JarvisHome && JarvisHome.heard(" + JSON.stringify(text) + ")"); },
    onState: voiceState,
    onTranscript: async (text) => {
      log("command: " + text);
      voiceState("heard", text);
      const ok = await inDash("window.jarvisCommand && jarvisCommand(" + JSON.stringify(text) + ")");
      if (!ok) return notify("Jarvis heard: “" + text + "”", "Open the Jarvis window and sign in to run commands.");
      listenForFollowUp();
    },
    onError: fail
  });
  const v = voice;
  syncWakeMode();
  Promise.resolve().then(() => v.start()).then(() => { updateTray("idle"); log("listening started"); if (/listen|mic/i.test(problemText)) showProblem(""); },
    (e) => { if (voice === v) voice = null; fail(e); });
}
function stopVoice() { followUpRun++; if (voice) { voice.stop(); voice = null; } }

// Conversation mode: once Jarvis has finished answering out loud, listen again
// (no "Hey Jarvis" needed). If you don't start talking within 3 s, it stops.
const FOLLOW_UP_MS = 3000;
let followUpRun = 0;
async function listenForFollowUp() {
  const run = ++followUpRun, v = voice, started = Date.now();
  await new Promise((r) => setTimeout(r, 800));          // let the reply start
  while (run === followUpRun && voice === v && Date.now() - started < 120000) {
    const busy = await askDash("window.jarvisBusy ? jarvisBusy() : false");
    if (busy === undefined) return;                       // dashboard not reachable
    if (!busy) break;
    await new Promise((r) => setTimeout(r, 300));
  }
  if (run !== followUpRun || voice !== v || !v) return;
  await new Promise((r) => setTimeout(r, 350));          // let the last word fade out of the speakers
  if (run === followUpRun && voice === v) v.listenNow({ noSpeechMs: FOLLOW_UP_MS, followUp: true });
}

// The voice engine (voice.js) runs in its own background process so the mic
// and speech models never slow down the window.
class VoiceProcess {
  constructor(o) { this.o = o; }
  start() {
    const o = this.o;
    const opts = { modelDir: o.modelDir, elevenlabsKey: o.elevenlabsKey, sensitivity: o.sensitivity, sttModel: o.sttModel };
    return new Promise((resolve, reject) => {
      let started = false;
      const child = this.child = utilityProcess.fork(path.join(__dirname, "voice-worker.js"), [], { serviceName: "Jarvis Voice" });
      child.on("message", (m) => {
        if (m.type === "started") { started = true; resolve(); }
        else if (m.type === "startError") reject(new Error(m.message));
        else if (m.type === "wake") o.onWake(m.hasRequest);
        else if (m.type === "level") { if (o.onLevel) o.onLevel(m.v); }
        else if (m.type === "heard") { if (o.onHeard) o.onHeard(m.text); }
        else if (m.type === "state") o.onState(m.state, m.detail);
        else if (m.type === "transcript") o.onTranscript(m.text);
        else if (m.type === "error") o.onError(new Error(m.message));
      });
      child.on("exit", (code) => {
        if (this.stopped) return;
        const err = new Error("The voice engine stopped (code " + code + ")");
        if (started) o.onError(err); else reject(err);
      });
      if (this.captureOnWake !== undefined) child.postMessage({ type: "captureOnWake", value: this.captureOnWake });
      child.postMessage({ type: "start", opts });
    });
  }
  listenNow(opts) { if (this.child) this.child.postMessage({ type: "listen", opts }); }
  setSpeaking(on) { if (this.child) this.child.postMessage({ type: "speaking", on: !!on }); }
  setCaptureOnWake(value) {
    this.captureOnWake = value;
    if (this.child) this.child.postMessage({ type: "captureOnWake", value });
  }
  stop() {
    this.stopped = true;
    const c = this.child;
    this.child = null;
    if (!c) return;
    try { c.postMessage({ type: "stop" }); } catch (e) {}
    setTimeout(() => { try { c.kill(); } catch (e) {} }, 1000);
  }
}

// A plain log in ~/Library/Logs/Jarvis/jarvis.log, so problems can be traced.
function log(line) {
  try {
    const f = path.join(app.getPath("logs"), "jarvis.log");
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f) && fs.statSync(f).size > 2e6) fs.renameSync(f, f + ".old");
    fs.appendFileSync(f, new Date().toISOString() + "  " + line + "\n");
  } catch (e) {}
}
// A problem shown on the home screen (under the form) until it's fixed.
let problemText = "";
function showProblem(text) {
  problemText = text || "";
  inDash("window.JarvisHome && JarvisHome.problem(" + JSON.stringify(problemText) + ")");
}
function fail(e) {
  const msg = (e && e.message) || String(e);
  console.error("[jarvis]", msg);
  log("error: " + msg);
  let hint = msg;
  if (/model|ENOENT/i.test(msg)) hint = "Some Jarvis model files are missing. In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.";
  else if (/401|invalid_api_key|unauthorized/i.test(msg)) hint = "ElevenLabs rejected the key. Use the sk_… key, with Speech to Text allowed.";
  else if (/device|audio|recorder|microphone/i.test(msg)) hint = "Couldn't open the microphone. Allow Jarvis in System Settings → Privacy & Security → Microphone.";
  notify("Jarvis", hint);
  updateTray("error");
  if (!voice) showProblem("Can't listen: " + hint);
}
function notify(title, body) {
  try { new Notification({ title, body, silent: true }).show(); } catch (e) {}
}

// ------------------------------------------------------------------ tray --
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
  img.setTemplateImage(true);
  return img;
}
function updateTray(state) {
  if (!tray) return;
  const c = readConfig();
  const status = !c.listening ? "Not listening" : !voice ? "Needs setup" :
    state === "listening" ? "Listening…" : state === "thinking" ? "Working…" : state === "error" ? "Problem — see Settings" : "Say “Jarvis”";
  tray.setToolTip("Jarvis — " + status);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: "separator" },
    { label: "Open Jarvis", click: () => reveal(true) },
    { label: "Talk now (" + HOTKEY.replace("Alt", "⌥") + ")", enabled: !!voice, click: talkNow },
    { label: "Always listening for “Jarvis”", type: "checkbox", checked: !!c.listening, click: (i) => { const n = readConfig(); n.listening = i.checked; writeConfig(n); startVoice(); } },
    { label: "Start when my Mac starts", type: "checkbox", checked: !!c.openAtLogin, click: (i) => { const n = readConfig(); n.openAtLogin = i.checked; writeConfig(n); applyLogin(); } },
    { label: "Settings…", click: openSettings },
    { label: "Reload dashboard", click: () => view && view.webContents.reload() },
    { type: "separator" },
    { label: "Quit Jarvis", click: () => { quitting = true; app.quit(); } }
  ]));
}
function talkNow() {
  reveal(false);
  if (voice) voice.listenNow();
}
function applyLogin() {
  try { app.setLoginItemSettings({ openAtLogin: !!readConfig().openAtLogin }); } catch (e) {}
}

// -------------------------------------------------------------- settings --
function openSettings() {
  if (settingsWin) { settingsWin.show(); return settingsWin.focus(); }
  settingsWin = new BrowserWindow({
    width: 520, height: 600, resizable: false, title: "Jarvis Settings",
    titleBarStyle: "hiddenInset", backgroundColor: "#e7e6e0",
    webPreferences: { preload: path.join(__dirname, "settings-preload.js"), contextIsolation: true, sandbox: true }
  });
  settingsWin.loadFile(path.join(__dirname, "settings.html"));
  settingsWin.on("closed", () => { settingsWin = null; });
}
ipcMain.handle("settings:get", () => {
  const c = readConfig(), k = keys();
  return { hasElevenlabs: !!k.elevenlabs, sensitivity: c.sensitivity, listening: c.listening, openAtLogin: c.openAtLogin };
});
ipcMain.handle("settings:save", (e, s) => {
  const c = readConfig();
  if (s.elevenlabs) c.elevenlabsKey = seal(String(s.elevenlabs).trim());
  if (s.sensitivity != null) c.sensitivity = Math.min(0.95, Math.max(0.2, Number(s.sensitivity)));
  if (s.listening != null) c.listening = !!s.listening;
  if (s.openAtLogin != null) c.openAtLogin = !!s.openAtLogin;
  writeConfig(c);
  applyLogin();
  startVoice();
  return { ok: true, listening: !!voice };
});

// ------------------------------------------------------------------ boot --
app.on("second-instance", () => reveal(true));
app.on("activate", () => reveal(true));
app.on("before-quit", () => { quitting = true; stopVoice(); if (speaker) speaker.quit(); });

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    try { await systemPreferences.askForMediaAccess("microphone"); } catch (e) {}
    const icon = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));
    if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
  }
  tray = new Tray(trayIcon());
  tray.on("click", () => tray.popUpContextMenu());
  speaker = new Speaker();
  speaker.start();
  createWindow();
  applyLogin();
  globalShortcut.register(HOTKEY, talkNow);
  updateTray();
  startVoice();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
