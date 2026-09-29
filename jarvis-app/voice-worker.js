/*
 * Runs the voice engine (voice.js) in its own background process, so listening
 * for "Hey Jarvis" never competes with the window for time (smooth scrolling).
 * main.js starts it with utilityProcess.fork and talks to it through messages.
 */
const { Voice } = require("./voice.js");

let voice = null;
let captureOnWake = true;
const send = (m) => process.parentPort.postMessage(m);
const msg = (e) => (e && e.message) || String(e);

process.parentPort.on("message", async (e) => {
  const m = e.data || {};
  if (m.type === "start") {
    voice = new Voice(Object.assign({}, m.opts, {
      onWake: () => send({ type: "wake" }),
      onState: (state, detail) => send({ type: "state", state, detail }),
      onTranscript: (text) => send({ type: "transcript", text }),
      onError: (err) => send({ type: "error", message: msg(err) })
    }));
    voice.captureOnWake = captureOnWake;
    try { await voice.start(); send({ type: "started" }); }
    catch (err) { send({ type: "startError", message: msg(err) }); }
  } else if (m.type === "captureOnWake") {
    captureOnWake = !!m.value;
    if (voice) voice.captureOnWake = captureOnWake;
  } else if (m.type === "listen") {
    if (voice) voice.listenNow(m.opts);
  } else if (m.type === "stop") {
    if (voice) voice.stop();
    process.exit(0);
  }
});
