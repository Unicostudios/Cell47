/*
 * Jarvis's speaking voice, made on the Mac (free, no credits): Kokoro via
 * sherpa-onnx, voice "Sarah". Runs in its own background process so making
 * speech never slows down the window or the "Hey Jarvis" listener.
 *
 * main.js sends { type: "say", id, gen, text }; this writes a .wav and replies
 * { type: "audio", id, gen, file } (main.js plays it). { type: "gen", gen }
 * drops anything older (Jarvis was interrupted).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");

const VOICE = 9;        // Kokoro v1.0 speaker id 9 = af_sarah
const SPEED = 1.0;

let sherpa = null, tts = null, gen = 0, queue = [], busy = false;
const send = (m) => process.parentPort.postMessage(m);
const msg = (e) => (e && e.message) || String(e);

function load(modelDir) {
  // The engine reads files itself, so use the unpacked copy inside the built app.
  const d = path.join(modelDir, "tts").replace(/app\.asar(?=[\\/])/, "app.asar.unpacked");
  const need = ["model.onnx", "voices.bin", "tokens.txt", "lexicon-us-en.txt", "espeak-ng-data"];
  const missing = need.filter((f) => !fs.existsSync(path.join(d, f)));
  if (missing.length) throw new Error("The voice model is missing (" + missing.join(", ") + "). In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.");
  sherpa = require("sherpa-onnx-node");
  tts = new sherpa.OfflineTts({
    model: {
      kokoro: {
        model: path.join(d, "model.onnx"), voices: path.join(d, "voices.bin"), tokens: path.join(d, "tokens.txt"),
        dataDir: path.join(d, "espeak-ng-data"), lexicon: path.join(d, "lexicon-us-en.txt")
      },
      numThreads: Math.max(2, Math.min(4, os.cpus().length - 2)), debug: 0
    },
    maxNumSentences: 1
  });
}

// Words the voice gets wrong, spelled the way they should sound.
function forSpeech(text) {
  return String(text)
    .replace(/\bSree\s*hari\b/gi, "Shreehari")
    .replace(/\s+/g, " ")
    .trim();
}

function pump() {
  if (busy || !queue.length) return;
  busy = true;
  setImmediate(() => {
    const job = queue.shift();
    if (job && job.gen >= gen) {
      try {
        // enableExternalBuffer: false — Electron doesn't allow the engine's shared audio buffers.
        const a = tts.generate({ text: forSpeech(job.text), sid: VOICE, speed: SPEED, enableExternalBuffer: false });
        const file = path.join(os.tmpdir(), "jarvis-say-" + process.pid + "-" + job.id + ".wav");
        sherpa.writeWave(file, { samples: a.samples, sampleRate: a.sampleRate });
        send({ type: "audio", id: job.id, gen: job.gen, file });
      } catch (e) {
        send({ type: "sayError", id: job.id, gen: job.gen, message: msg(e) });
      }
    }
    busy = false;
    pump();
  });
}

process.parentPort.on("message", (e) => {
  const m = e.data || {};
  if (m.type === "init") {
    try { load(m.modelDir); send({ type: "ready" }); }
    catch (err) { send({ type: "initError", message: msg(err) }); }
  } else if (m.type === "say") {
    if (!tts) return send({ type: "sayError", id: m.id, gen: m.gen, message: "voice not ready" });
    queue.push(m);
    pump();
  } else if (m.type === "gen") {
    gen = m.gen;
    queue = queue.filter((j) => j.gen >= gen);
  }
});
