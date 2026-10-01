/*
 * Downloads the models Jarvis runs on your Mac into ./models (runs on npm install), all free:
 *  - Silero VAD: notices when you start and stop talking
 *  - Moonshine speech-to-text (via sherpa-onnx): turns what you say into text
 *  - Kokoro, voice "Sarah" (via sherpa-onnx): Jarvis's speaking voice
 * Models are from https://github.com/k2-fsa/sherpa-onnx releases.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const DIR = path.join(__dirname, "..", "models");
const VAD_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx";
const STT = "sherpa-onnx-moonshine-base-en-int8";
const STT_FILES = ["preprocess.onnx", "encode.int8.onnx", "uncached_decode.int8.onnx", "cached_decode.int8.onnx", "tokens.txt"];
// Jarvis's speaking voice: Kokoro v1.0 (voice "Sarah"), about 350 MB, one time.
const TTS = "kokoro-multi-lang-v1_0";
const TTS_FILES = ["model.onnx", "voices.bin", "tokens.txt", "lexicon-us-en.txt", "espeak-ng-data"];

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  await fetchVad();
  await fetchSpeechModel();
  await fetchVoiceModel();
})().catch((e) => { console.error("Couldn't download the Jarvis models: " + e.message); process.exit(1); });

async function fetchSpeechModel() {
  const dir = path.join(DIR, "stt");
  if (STT_FILES.every((f) => fs.existsSync(path.join(dir, f)))) return console.log("Speech-to-text model ready.");
  process.stdout.write("Downloading the speech-to-text model (about 250 MB, one time) … ");
  const res = await fetch("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/" + STT + ".tar.bz2");
  if (!res.ok) throw new Error("speech model: HTTP " + res.status);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-stt-"));
  const archive = path.join(tmp, "stt.tar.bz2");
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xjf", archive, "-C", tmp]);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of STT_FILES) fs.copyFileSync(path.join(tmp, STT, f), path.join(dir, f));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("done");
}

async function fetchVoiceModel() {
  const dir = path.join(DIR, "tts");
  if (TTS_FILES.every((f) => fs.existsSync(path.join(dir, f)))) return console.log("Voice model ready.");
  process.stdout.write("Downloading Jarvis's voice (about 350 MB, one time) … ");
  const res = await fetch("https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/" + TTS + ".tar.bz2");
  if (!res.ok) throw new Error("voice model: HTTP " + res.status);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-tts-"));
  const archive = path.join(tmp, "tts.tar.bz2");
  fs.writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  execFileSync("tar", ["-xjf", archive, "-C", tmp]);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of TTS_FILES) fs.cpSync(path.join(tmp, TTS, f), path.join(dir, f), { recursive: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("done");
}

async function fetchVad() {
  const dest = path.join(DIR, "vad", "silero_vad.onnx");
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500000) return console.log("Voice-activity model ready.");
  process.stdout.write("Downloading the voice-activity model … ");
  const res = await fetch(VAD_URL);
  if (!res.ok) throw new Error("voice-activity model: HTTP " + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500000) throw new Error("voice-activity model: download looks incomplete");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  console.log("done");
}
