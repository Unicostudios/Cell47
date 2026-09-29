/*
 * Jarvis — a Mac app for the Ops Desk dashboard.
 *
 * - Shows the dashboard in its own window (no browser, no address bar).
 * - Lives in the menu bar and keeps running when the window is closed.
 * - Listens for "Hey Jarvis" and passes what you say to the dashboard's
 *   Ask Jarvis bar, which does the work and answers out loud.
 * - Sound is allowed without a tap, so the spoken greeting always plays.
 *
 * "Hey Jarvis" is detected on-device with openWakeWord (free, no key).
 * The ElevenLabs key is entered in Settings and kept encrypted with the
 * macOS Keychain (safeStorage); it's only sent to ElevenLabs.
 */
const {
  app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, safeStorage,
  shell, session, globalShortcut, Notification, systemPreferences, utilityProcess, WebContentsView
} = require("electron");
const path = require("path");
const fs = require("fs");

const DASHBOARD_URL = "https://claude.ai/artifact/GgHwacYvD1hZgNT9EjZAk5";
const PARTITION = "persist:jarvis";
const HOTKEY = "Alt+Space";           // press to talk without the wake word

app.setName("Jarvis");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
if (!app.requestSingleInstanceLock()) app.quit();

let win = null, view = null, tray = null, settingsWin = null, voice = null;
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
async function dashFrame() {
  if (!view) return null;
  for (const f of view.webContents.mainFrame.framesInSubtree) {
    try { if (await f.executeJavaScript("!!document.getElementById('cmd-input')")) return f; } catch (e) {}
  }
  return null;
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
    backgroundColor: "#ffffff",
    show: false,
    fullscreenable: true
  });
  // The page sits in its own view inside the window. The view is placed a little
  // above the window's top edge, so claude.ai's bar over the dashboard is simply
  // out of sight: nothing on claude.ai's page is changed.
  view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true } });
  view.setBackgroundColor("#ffffff");
  win.contentView.addChildView(view);
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
    setTimeout(() => inDash("window.__inJarvisApp = true; window.jarvisAppReady && jarvisAppReady();"), 400);
    measureCrop();
  });
  wc.on("did-finish-load", measureCrop);
  wc.on("did-navigate", () => { cropTop = 0; layout(); });   // e.g. the sign-in page: show all of it
  setInterval(measureCrop, 2000);

  // Closing keeps Jarvis running. Leave full screen first, so macOS doesn't
  // leave an empty full-screen space behind, then hide.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    hideWindow();
  });
  // While the window is closed, "Hey Jarvis" opens it and greets you before listening.
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

// ----------------------------------------------------------------- voice --
function voiceState(state, detail) {
  inDash("window.jarvisVoiceState && jarvisVoiceState(" + JSON.stringify(state) + "," + JSON.stringify(detail || "") + ")");
  updateTray(state);
}

function startVoice() {
  stopVoice();
  const c = readConfig(), k = keys();
  if (!c.listening) return updateTray();
  if (!k.elevenlabs) { updateTray(); return openSettings(); }
  voice = new VoiceProcess({
    modelDir: path.join(__dirname, "models"), elevenlabsKey: k.elevenlabs,
    sensitivity: Number(c.sensitivity) || 0.5, sttModel: c.sttModel,
    onWake: () => {
      // Closed: open with the entrance and greeting, then listen once it's said hello.
      // Already open: the voice engine is listening for your command right away.
      if (reveal(true)) listenForFollowUp();
    },
    onState: voiceState,
    onTranscript: async (text) => {
      voiceState("heard", text);
      const ok = await inDash("window.jarvisCommand && jarvisCommand(" + JSON.stringify(text) + ")");
      if (!ok) return notify("Jarvis heard: “" + text + "”", "Open the Jarvis window and sign in to run commands.");
      listenForFollowUp();
    },
    onError: fail
  });
  const v = voice;
  syncWakeMode();
  Promise.resolve().then(() => v.start()).then(() => updateTray("idle"), (e) => { if (voice === v) voice = null; fail(e); });
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
// and wake-word model never slow down the window.
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
        else if (m.type === "wake") o.onWake();
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

function fail(e) {
  const msg = (e && e.message) || String(e);
  console.error("[jarvis]", msg);
  let hint = msg;
  if (/onnx|model|ENOENT/i.test(msg)) hint = "The Hey Jarvis model files are missing. In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.";
  else if (/401|invalid_api_key|unauthorized/i.test(msg)) hint = "ElevenLabs rejected the key. Use the sk_… key, with Speech to Text allowed.";
  else if (/device|audio|recorder|microphone/i.test(msg)) hint = "Couldn't open the microphone. Allow Jarvis in System Settings → Privacy & Security → Microphone.";
  notify("Jarvis", hint);
  updateTray("error");
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
    state === "listening" ? "Listening…" : state === "thinking" ? "Working…" : state === "error" ? "Problem — see Settings" : "Say “Hey Jarvis”";
  tray.setToolTip("Jarvis — " + status);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: "separator" },
    { label: "Open Jarvis", click: () => reveal(true) },
    { label: "Talk now (" + HOTKEY.replace("Alt", "⌥") + ")", enabled: !!voice, click: talkNow },
    { label: "Listen for “Hey Jarvis”", type: "checkbox", checked: !!c.listening, click: (i) => { const n = readConfig(); n.listening = i.checked; writeConfig(n); startVoice(); } },
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
app.on("before-quit", () => { quitting = true; stopVoice(); });

app.whenReady().then(async () => {
  if (process.platform === "darwin") {
    try { await systemPreferences.askForMediaAccess("microphone"); } catch (e) {}
    const icon = nativeImage.createFromPath(path.join(__dirname, "build", "icon.png"));
    if (!icon.isEmpty() && app.dock) app.dock.setIcon(icon);
  }
  tray = new Tray(trayIcon());
  tray.on("click", () => tray.popUpContextMenu());
  createWindow();
  applyLogin();
  globalShortcut.register(HOTKEY, talkNow);
  updateTray();
  startVoice();
});
app.on("will-quit", () => globalShortcut.unregisterAll());
