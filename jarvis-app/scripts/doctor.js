#!/usr/bin/env node
/*
 * npm run doctor — checks that Jarvis's on-device voice works on this Mac:
 * the models are downloaded, the speech engine loads, Sarah can speak, and
 * what she says can be heard back. Also shows the end of Jarvis's log.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const M = path.join(ROOT, "models");
let failed = 0;
const ok = (msg) => console.log("  ✓ " + msg);
const bad = (msg, fix) => { failed++; console.log("  ✗ " + msg + (fix ? "\n      → " + fix : "")); };

console.log("\nJarvis doctor\n");

// 1. models
const need = {
  "vad/silero_vad.onnx": "voice activity",
  "stt/encode.int8.onnx": "speech-to-text",
  "stt/tokens.txt": "speech-to-text",
  "tts/model.onnx": "Sarah's voice",
  "tts/voices.bin": "Sarah's voice",
  "tts/espeak-ng-data": "Sarah's voice"
};
let missing = false;
for (const [f, what] of Object.entries(need)) {
  if (!fs.existsSync(path.join(M, f))) { missing = true; bad("missing " + f + " (" + what + ")"); }
}
if (missing) console.log("      → run: cd ~/Cell47/jarvis-app && npm install");
else ok("models downloaded");

// 2. engine
let sherpa = null;
try { sherpa = require("sherpa-onnx-node"); ok("speech engine loads (sherpa-onnx " + (require("sherpa-onnx-node/package.json").version) + ")"); }
catch (e) { bad("speech engine doesn't load: " + e.message, "run: cd ~/Cell47/jarvis-app && rm -rf node_modules && npm install"); }

// 3. speak → hear back
if (sherpa && !missing) {
  try {
    const d = path.join(M, "tts");
    const tts = new sherpa.OfflineTts({ model: { kokoro: { model: path.join(d, "model.onnx"), voices: path.join(d, "voices.bin"), tokens: path.join(d, "tokens.txt"), dataDir: path.join(d, "espeak-ng-data"), lexicon: path.join(d, "lexicon-us-en.txt") }, numThreads: 4, debug: 0 }, maxNumSentences: 1 });
    const t0 = Date.now();
    const a = tts.generate({ text: "Hey Jarvis, what's on my calendar today?", sid: 9, speed: 1, enableExternalBuffer: false });
    ok("Sarah spoke a test line (" + (a.samples.length / a.sampleRate).toFixed(1) + " s of audio in " + (Date.now() - t0) + " ms)");
    const wav = path.join(os.tmpdir(), "jarvis-doctor.wav");
    sherpa.writeWave(wav, { samples: a.samples, sampleRate: a.sampleRate });
    console.log("      (play it: afplay " + wav + ")");

    const s = path.join(M, "stt");
    const rec = new sherpa.OfflineRecognizer({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig: { moonshine: { preprocessor: path.join(s, "preprocess.onnx"), encoder: path.join(s, "encode.int8.onnx"), uncachedDecoder: path.join(s, "uncached_decode.int8.onnx"), cachedDecoder: path.join(s, "cached_decode.int8.onnx") }, tokens: path.join(s, "tokens.txt"), numThreads: 2, debug: 0 } });
    const st = rec.createStream();
    st.acceptWaveform({ samples: a.samples, sampleRate: a.sampleRate });
    const t1 = Date.now();
    rec.decode(st);
    const text = rec.getResult(st).text.trim();
    const { HAS_NAME } = require(path.join(ROOT, "voice.js"));
    if (HAS_NAME.test(text)) ok("heard it back: “" + text + "” (" + (Date.now() - t1) + " ms) — and spotted “Jarvis”");
    else bad("heard “" + text + "” but didn't spot “Jarvis”");

    const vad = new sherpa.Vad({ sileroVad: { model: path.join(M, "vad", "silero_vad.onnx"), threshold: 0.5, minSilenceDuration: 0.5, minSpeechDuration: 0.25, windowSize: 512, maxSpeechDuration: 20 }, sampleRate: 16000, numThreads: 1, debug: 0 }, 30);
    ok("voice-activity model loads");
  } catch (e) { bad("voice test failed: " + e.message); }
}

// 4. microphone (just open and read a moment)
try {
  const { PvRecorder } = require("@picovoice/pvrecorder-node");
  const r = new PvRecorder(512); r.start();
  const name = r.getSelectedDevice ? r.getSelectedDevice() : "";
  r.stop(); r.release();
  ok("microphone opens" + (name ? " (" + name + ")" : ""));
} catch (e) { bad("microphone: " + e.message, "allow Terminal (and Jarvis) under System Settings → Privacy & Security → Microphone"); }

// 5. the installed app
if (process.platform === "darwin") {
  const want = require(path.join(ROOT, "package.json")).version;
  let have = "";
  try { have = require("child_process").execFileSync("defaults", ["read", "/Applications/Jarvis.app/Contents/Info", "CFBundleShortVersionString"]).toString().trim(); } catch (e) {}
  if (!have) bad("Jarvis.app isn't in Applications", "run: bash scripts/update.sh");
  else if (have !== want) bad("Jarvis.app in Applications is version " + have + ", this folder is " + want, "run: bash scripts/update.sh");
  else ok("Jarvis.app in Applications is version " + have);
  const shared = path.join(os.homedir(), "Library", "Application Support", "Jarvis", "models", "tts", "model.onnx");
  if (fs.existsSync(shared)) ok("voice models are where the app looks for them");
  else bad("the app's copy of the voice models is missing", "run: bash scripts/update.sh");
}

// 6. log
const log = path.join(os.homedir(), "Library", "Logs", "Jarvis", "jarvis.log");
console.log("\nLast lines of " + log + ":");
try { console.log(fs.readFileSync(log, "utf8").trim().split("\n").slice(-15).map((l) => "  " + l).join("\n")); }
catch (e) { console.log("  (no log yet — the new Jarvis hasn't run, or hasn't heard anything)"); }

console.log(failed ? "\n" + failed + " problem(s) found.\n" : "\nAll good.\n");
process.exit(failed ? 1 : 0);
