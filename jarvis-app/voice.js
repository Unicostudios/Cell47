/*
 * Voice engine for Jarvis (runs in its own background process, see voice-worker.js).
 *
 *   idle mic → "Hey Jarvis" (openWakeWord via ONNX Runtime, fully on-device, free)
 *            → record until you stop talking (simple energy-based end-of-speech)
 *            → speech-to-text on the Mac (Moonshine via sherpa-onnx, free) → transcript
 *
 * Your voice never leaves the Mac. ElevenLabs speech-to-text is only a backup,
 * used if the on-device model is missing and an ElevenLabs key is set.
 */
const { PvRecorder } = require("@picovoice/pvrecorder-node");   // free, open-source mic capture (no key)
const { WakeWord, CHUNK } = require("./wakeword.js");
const path = require("path");
const fs = require("fs");

const SAMPLE_RATE = 16000;
const END_SILENCE_MS = 1200;     // this much quiet after speech = you're done
const NO_SPEECH_MS = 6000;       // nothing said after the wake word → give up
const MAX_UTTERANCE_MS = 15000;
const COOLDOWN_MS = 1500;        // ignore re-triggers right after a command

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function toWav(frames) {
  const samples = frames.reduce((n, f) => n + f.length, 0);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24); buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples * 2, 40);
  let o = 44;
  for (const f of frames) for (let i = 0; i < f.length; i++) { buf.writeInt16LE(f[i], o); o += 2; }
  return buf;
}

// On-device speech-to-text. Returns null if the model isn't installed.
function loadLocalStt(modelDir) {
  // The speech engine reads files itself, so use the unpacked copy inside the built app.
  const d = path.join(modelDir, "stt").replace(/app\.asar(?=[\\/])/, "app.asar.unpacked");
  const files = ["preprocess.onnx", "encode.int8.onnx", "uncached_decode.int8.onnx", "cached_decode.int8.onnx", "tokens.txt"];
  if (!files.every((f) => fs.existsSync(path.join(d, f)))) return null;
  const sherpa = require("sherpa-onnx-node");
  const rec = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
    modelConfig: {
      moonshine: {
        preprocessor: path.join(d, "preprocess.onnx"), encoder: path.join(d, "encode.int8.onnx"),
        uncachedDecoder: path.join(d, "uncached_decode.int8.onnx"), cachedDecoder: path.join(d, "cached_decode.int8.onnx")
      },
      tokens: path.join(d, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0
    }
  });
  return (frames) => {
    const n = frames.reduce((a, f) => a + f.length, 0), samples = new Float32Array(n);
    let o = 0;
    for (const f of frames) for (let i = 0; i < f.length; i++) samples[o++] = f[i] / 32768;
    const stream = rec.createStream();
    stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
    rec.decode(stream);
    return String(rec.getResult(stream).text || "").trim();
  };
}

async function transcribe(wav, apiKey, model) {
  const fd = new FormData();
  fd.append("model_id", model || "scribe_v1");
  fd.append("file", new Blob([wav], { type: "audio/wav" }), "command.wav");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: fd
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error("Speech-to-text failed (" + res.status + "): " + detail);
  }
  const json = await res.json();
  return String(json.text || "").trim();
}

class Voice {
  /**
   * @param {object} o
   *   modelDir, elevenlabsKey, sensitivity (0-1, higher wakes more easily), sttModel,
   *   onWake(), onState(state, detail), onTranscript(text), onError(err)
   */
  constructor(o) {
    this.o = o;
    this.mode = "off";
    this.noise = 300;
    this.cooldownMs = 0;
    this.captureOnWake = true;   // false while the window is closed: main greets first, then listens
  }

  async start() {
    if (this.mode !== "off") return;
    this.mode = "starting";
    this.wake = await WakeWord.create(this.o.modelDir);
    try { this.localStt = loadLocalStt(this.o.modelDir); } catch (e) { this.localStt = null; this.o.onError(e); }
    if (!this.localStt && !this.o.elevenlabsKey) throw new Error("The speech-to-text model is missing. In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.");
    // sensitivity 0.5 → wake when the model is 50% sure; 0.7 → 30% sure (wakes more easily)
    this.threshold = Math.min(0.9, Math.max(0.1, 1 - (Number(this.o.sensitivity) || 0.5)));
    this.recorder = new PvRecorder(CHUNK);
    this.recorder.start();
    this.mode = "wake";
    this.loop();
  }

  stop() {
    this.mode = "off";
    try { this.recorder && this.recorder.stop(); } catch (e) {}
    try { this.recorder && this.recorder.release(); } catch (e) {}
    this.recorder = null;
  }

  /**
   * Start listening for a command right away (keyboard shortcut, or a follow-up
   * after Jarvis answers). opts.noSpeechMs: how long to wait for you to start talking.
   */
  listenNow(opts) {
    if (this.mode === "wake") this.beginCapture(opts);
  }

  async loop() {
    while (this.mode !== "off") {
      let frame;
      try { frame = await this.recorder.read(); } catch (e) {
        if (this.mode !== "off") this.o.onError(e);
        return;
      }
      if (this.mode === "wake") {
        // Background level: drops quickly to quiet, rises only slowly (so speech doesn't count as noise).
        const r = rms(frame);
        this.noise = r < this.noise ? this.noise * 0.8 + r * 0.2 : this.noise * 0.998 + r * 0.002;
        const score = await this.wake.process(frame);
        if (this.cooldownMs > 0) { this.cooldownMs -= (frame.length / SAMPLE_RATE) * 1000; continue; }
        if (this.mode !== "wake") continue;
        if (score >= this.threshold) {
          this.o.onWake();
          if (this.captureOnWake) this.beginCapture();
          else { this.wake.reset(); this.cooldownMs = COOLDOWN_MS; }
        }
      } else if (this.mode === "capture") {
        this.capture(frame);
      }
    }
  }

  beginCapture(opts) {
    if (this.wake) this.wake.reset();
    this.noSpeechMs = (opts && opts.noSpeechMs) || NO_SPEECH_MS;
    this.followUp = !!(opts && opts.followUp);
    this.mode = "capture";
    this.frames = [];
    this.heard = false;
    this.quietMs = 0;
    this.elapsed = 0;
    this.o.onState("listening");
  }

  capture(frame) {
    const ms = (frame.length / SAMPLE_RATE) * 1000;
    this.frames.push(frame);
    this.elapsed += ms;
    const loud = rms(frame) > Math.max(this.noise * 2.8, 450);
    if (loud) { this.heard = true; this.quietMs = 0; } else if (this.heard) { this.quietMs += ms; }

    if (!this.heard && this.elapsed >= this.noSpeechMs) return this.finish(false);
    if (this.heard && this.quietMs >= END_SILENCE_MS) return this.finish(true);
    if (this.elapsed >= MAX_UTTERANCE_MS) return this.finish(this.heard);
  }

  // On the Mac first; ElevenLabs only if the on-device model isn't there.
  async toText(frames) {
    if (this.localStt) {
      await new Promise((r) => setImmediate(r));   // let the "thinking" state go out first
      return this.localStt(frames);
    }
    return transcribe(toWav(frames), this.o.elevenlabsKey, this.o.sttModel);
  }

  finish(gotSpeech) {
    const frames = this.frames;
    this.frames = [];
    this.mode = "wake";
    this.cooldownMs = COOLDOWN_MS;       // measured in audio, not clock time
    // A follow-up nobody answered just ends quietly.
    if (!gotSpeech) { this.o.onState("idle", this.followUp ? "" : "Didn't catch anything"); return; }
    this.o.onState("thinking");
    this.toText(frames)
      .then((text) => {
        if (text) this.o.onTranscript(text);
        else this.o.onState("idle", "Didn't catch that");
      })
      .catch((e) => { this.o.onState("idle", "Couldn't understand"); this.o.onError(e); });
  }
}

module.exports = { Voice, toWav, transcribe };
