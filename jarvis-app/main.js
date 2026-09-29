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
  shell, session, globalShortcut, Notification, systemPreferences
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

let win = null, tray = null, settingsWin = null, voice = null;
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
  if (!win) return null;
  for (const f of win.webContents.mainFrame.framesInSubtree) {
    try { if (await f.executeJavaScript("!!document.getElementById('cmd-input')")) return f; } catch (e) {}
  }
  return null;
}
async function inDash(js) {
  const f = await dashFrame();
  if (!f) return false;
  try { await f.executeJavaScript(js); return true; } catch (e) { return false; }
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
    backgroundColor: "#e7e6e0",
    show: false,
    fullscreenable: true,
    webPreferences: { partition: PARTITION, contextIsolation: true, sandbox: true }
  });
  win.loadURL(DASHBOARD_URL);
  win.once("ready-to-show", () => { win.show(); goFullScreen(); });

  // Links open in your normal browser; sign-in pop-ups stay inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|anthropic\.com|google\.com|apple\.com|notion\.so|notion\.com)\//i.test(url) &&
        /(login|oauth|auth|signin|sso|consent|accounts)/i.test(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 520, height: 720, webPreferences: { partition: PARTITION } } };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Tell the dashboard it's running inside the app (hint text, silent wake).
  win.webContents.on("did-frame-finish-load", () => {
    setTimeout(() => inDash("window.__inJarvisApp = true; window.jarvisAppReady && jarvisAppReady();"), 400);
    fillWindow();
  });
  win.webContents.on("did-finish-load", fillWindow);

  // Closing keeps Jarvis running. Leave full screen first, so macOS doesn't
  // leave an empty full-screen space behind, then hide.
  win.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    if (win.isFullScreen()) { win.once("leave-full-screen", () => win.hide()); win.setFullScreen(false); }
    else win.hide();
  });
}

// The dashboard lives in an iframe on claude.ai's page. Stretch that frame over
// the whole window so claude.ai's own top bar is hidden, and add a thin strip at
// the top so the window can still be dragged (the traffic lights sit on it).
const FILL_JS = `(() => {
  if (!location.pathname.startsWith("/artifact/")) return;
  const pick = () => {
    let best = null, area = 0;
    for (const f of document.querySelectorAll("iframe")) {
      const r = f.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; best = f; }
    }
    return best;
  };
  const hide = (el) => { el.style.setProperty("display", "none", "important"); el.dataset.jarvisHidden = "1"; };
  const apply = () => {
    const f = pick();
    if (!f) return;
    // Hide everything that sits above the dashboard (claude.ai's own bar), at every level.
    const top = f.getBoundingClientRect().top;
    let el = f;
    while (el && el !== document.body && el.parentElement) {
      const parent = el.parentElement;
      for (const sib of parent.children) {
        if (sib === el || sib.contains(f) || sib.dataset.jarvisHidden || sib.id === "jarvis-drag") continue;
        const r = sib.getBoundingClientRect();
        if (r.height > 0 && r.bottom <= top + 2) hide(sib);
      }
      // let every container on the way up take the full window
      parent.style.setProperty("padding", "0", "important");
      parent.style.setProperty("margin", "0", "important");
      parent.style.setProperty("border-radius", "0", "important");
      el = parent;
    }
    // …and make the dashboard itself fill the window.
    f.style.setProperty("width", "100vw", "important");
    f.style.setProperty("height", "100vh", "important");
    f.style.setProperty("border", "0", "important");
    f.style.setProperty("border-radius", "0", "important");
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    if (!document.getElementById("jarvis-drag")) {
      const d = document.createElement("div");
      d.id = "jarvis-drag";
      d.style.cssText = "position:fixed;top:0;left:0;right:0;height:30px;z-index:2147483601;-webkit-app-region:drag;";
      document.body.appendChild(d);
    }
  };
  apply();
  if (!window.__jarvisFillTimer) window.__jarvisFillTimer = setInterval(apply, 1000);
})();`;
function fillWindow() {
  if (!win) return;
  win.webContents.executeJavaScript(FILL_JS).catch(() => {});
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
  let Voice;
  try { Voice = require("./voice.js").Voice; } catch (e) { return fail(e); }
  voice = new Voice({
    modelDir: path.join(__dirname, "models"), elevenlabsKey: k.elevenlabs,
    sensitivity: Number(c.sensitivity) || 0.5, sttModel: c.sttModel,
    onWake: () => {
      const wasHidden = !win || !win.isVisible() || !win.isFocused();
      showWindow();
      // Replay the entrance (without the spoken greeting) if the window was away.
      if (wasHidden) inDash("window.jarvisWake && jarvisWake(true, { silent: true })");
    },
    onState: voiceState,
    onTranscript: async (text) => {
      voiceState("heard", text);
      const ok = await inDash("window.jarvisCommand && jarvisCommand(" + JSON.stringify(text) + ")");
      if (!ok) notify("Jarvis heard: “" + text + "”", "Open the Jarvis window and sign in to run commands.");
    },
    onError: fail
  });
  const v = voice;
  Promise.resolve().then(() => v.start()).then(() => updateTray("idle"), (e) => { if (voice === v) voice = null; fail(e); });
}
function stopVoice() { if (voice) { voice.stop(); voice = null; } }

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
    { label: "Open Jarvis", click: showWindow },
    { label: "Talk now (" + HOTKEY.replace("Alt", "⌥") + ")", enabled: !!voice, click: talkNow },
    { label: "Listen for “Hey Jarvis”", type: "checkbox", checked: !!c.listening, click: (i) => { const n = readConfig(); n.listening = i.checked; writeConfig(n); startVoice(); } },
    { label: "Start when my Mac starts", type: "checkbox", checked: !!c.openAtLogin, click: (i) => { const n = readConfig(); n.openAtLogin = i.checked; writeConfig(n); applyLogin(); } },
    { label: "Settings…", click: openSettings },
    { label: "Reload dashboard", click: () => win && win.webContents.reload() },
    { type: "separator" },
    { label: "Quit Jarvis", click: () => { quitting = true; app.quit(); } }
  ]));
}
function talkNow() {
  showWindow();
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
app.on("second-instance", showWindow);
app.on("activate", showWindow);
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
