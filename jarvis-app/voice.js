/*
 * Voice engine for Jarvis (runs in its own background process, see voice-worker.js).
 *
 *   mic → voice activity detection (Silero VAD) cuts what you say into sentences
 *       → each sentence is turned into text on the Mac (Moonshine via sherpa-onnx)
 *       → if it contains "Jarvis" ("Jarvis, …", "Hey Jarvis …", "…, Jarvis?"),
 *         or Jarvis is waiting for your answer, it's a command.
 *
 * Everything runs on the Mac, free; your voice never leaves it. ElevenLabs
 * speech-to-text is only a backup, used if the on-device model is missing.
 * While Jarvis itself is talking the mic is ignored, so it can't hear itself.
 */
const { PvRecorder } = require("@picovoice/pvrecorder-node");   // free, open-source mic capture (no key)
const path = require("path");
const fs = require("fs");

const SAMPLE_RATE = 16000;
const FRAME = 512;                 // 32 ms, what the VAD expects
const MIN_SPEECH_MS = 300;         // shorter blips (a cough, a click) are ignored
const LISTEN_MS = 7000;            // after "Hey Jarvis" on its own: how long to wait for the request
const ECHO_TAIL_MS = 350;          // ignore the mic this long after Jarvis stops talking

// Finding "Jarvis" in what the speech model wrote. Accents and fast speech come
// out as "Javis", "Jauvis", "Jervis", "Charvis", "Jaw visa"…, so match loosely:
// a word (or two words run together) that starts with a J/G/Ch sound and is
// within two letters of "jarvis". "Travis" counts only at the start.
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function looksLikeJarvis(w) {
  return w.length >= 4 && w.length <= 8 && /^(j|g|ch|dj|zh|z)/.test(w) && lev(w, "jarvis") <= 2;
}
const CALL = /^(hey|hi|hello|ok|okay|yo|oi|a|the)$/i;
/** Where "Jarvis" (plus a "hey" before it) is in the text, or null. */
function nameSpan(text) {
  const toks = [];
  String(text || "").replace(/[A-Za-z']+/g, (w, at) => { toks.push({ w: w.toLowerCase().replace(/'/g, ""), at, end: at + w.length }); return w; });
  for (let i = 0; i < toks.length; i++) {
    let hit = looksLikeJarvis(toks[i].w) ? 1 : 0;
    if (!hit && i + 1 < toks.length && looksLikeJarvis(toks[i].w + toks[i + 1].w)) hit = 2;
    if (!hit && toks[i].w === "travis" && (i === 0 || (i === 1 && CALL.test(toks[0].w)))) hit = 1;
    if (!hit) continue;
    const from = i > 0 && CALL.test(toks[i - 1].w) ? i - 1 : i;
    return { start: toks[from].at, end: toks[i + hit - 1].end };
  }
  return null;
}
const HAS_NAME = { test: (t) => !!nameSpan(t) };

/** "Hey Jarvis, add milk." → "add milk." ; "What's next, Jarvis?" → "What's next?" */
function stripName(text) {
  const t = String(text || "").trim(), sp = nameSpan(t);
  if (!sp) return t;
  const out = (t.slice(0, sp.start).replace(/[\s,]+$/, "") + " " + t.slice(sp.end).replace(/^[\s,.!:;-]+/, "")).trim();
  return out.replace(/\s+/g, " ").replace(/\s+([?!.,])/g, "$1").replace(/^\W+(?=\w)/, "").trim();
}
function wordCount(t) { return (String(t).match(/[A-Za-z0-9']+/g) || []).length; }

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function toWav(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SAMPLE_RATE, 24); buf.writeUInt32LE(SAMPLE_RATE * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0, o = 44; i < samples.length; i++, o += 2) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32768))), o);
  return buf;
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

// The speech engine reads files itself, so use the unpacked copy inside the built app.
function unpacked(p) { return p.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked"); }

function loadVad(modelDir, sensitivity) {
  const model = unpacked(path.join(modelDir, "vad", "silero_vad.onnx"));
  if (!fs.existsSync(model)) throw new Error("The voice-activity model is missing. In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.");
  const sherpa = require("sherpa-onnx-node");
  return new sherpa.Vad({
    // Settings → sensitivity: higher picks up quieter speech (0.5 → threshold 0.5).
    sileroVad: { model, threshold: Math.min(0.7, Math.max(0.3, 1 - (Number(sensitivity) || 0.5))), minSilenceDuration: 0.5, minSpeechDuration: 0.25, windowSize: FRAME, maxSpeechDuration: 20 },
    sampleRate: SAMPLE_RATE, numThreads: 1, debug: 0
  }, 30);
}

// On-device speech-to-text. Returns null if the model isn't installed.
function loadLocalStt(modelDir) {
  const d = unpacked(path.join(modelDir, "stt"));
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
  return (samples) => {
    const stream = rec.createStream();
    stream.acceptWaveform({ samples, sampleRate: SAMPLE_RATE });
    rec.decode(stream);
    return String(rec.getResult(stream).text || "").trim();
  };
}

class Voice {
  /**
   * @param {object} o
   *   modelDir, elevenlabsKey (optional backup), sttModel,
   *   onWake(hasRequest), onState(state, detail), onTranscript(text), onLevel(0..1), onHeard(text), onError(err)
   */
  constructor(o) {
    this.o = o;
    this.mode = "off";
    this.captureOnWake = true;   // false while the window is closed: main greets first, then listens
    this.openUntil = 0;          // listening for a request without "Jarvis" until this time
    this.followUp = false;
    this.speaking = false;
    this.mutedUntil = 0;
    this.chain = Promise.resolve();
    this.lastLevelAt = 0;
  }

  async start() {
    if (this.mode !== "off") return;
    this.mode = "starting";
    this.vad = loadVad(this.o.modelDir, this.o.sensitivity);
    try { this.localStt = loadLocalStt(this.o.modelDir); } catch (e) { this.localStt = null; this.o.onError(e); }
    if (!this.localStt && !this.o.elevenlabsKey) throw new Error("The speech-to-text model is missing. In Terminal: cd ~/Cell47/jarvis-app && npm install, then rebuild.");
    this.recorder = new PvRecorder(FRAME);
    this.recorder.start();
    this.mode = "on";
    this.loop();
  }

  stop() {
    this.mode = "off";
    try { this.recorder && this.recorder.stop(); } catch (e) {}
    try { this.recorder && this.recorder.release(); } catch (e) {}
    this.recorder = null;
  }

  /** Listen for a request without "Jarvis" (keyboard shortcut, or a follow-up after Jarvis answers). */
  listenNow(opts) {
    if (this.mode !== "on") return;
    this.openUntil = Date.now() + ((opts && opts.noSpeechMs) || LISTEN_MS);
    this.closedAt = 0;
    this.followUp = !!(opts && opts.followUp);
    this.o.onState("listening");
  }

  /** Jarvis is talking (true) or has stopped (false): ignore the mic meanwhile. */
  setSpeaking(on) {
    this.speaking = !!on;
    if (!on) this.mutedUntil = Date.now() + ECHO_TAIL_MS;
    if (this.vad) { try { this.vad.reset(); } catch (e) {} }
  }

  async loop() {
    while (this.mode === "on") {
      let frame;
      try { frame = await this.recorder.read(); } catch (e) {
        if (this.mode !== "off") this.o.onError(e);
        return;
      }
      const now = Date.now();
      if (this.speaking || now < this.mutedUntil) continue;

      const f = new Float32Array(frame.length);
      for (let i = 0; i < frame.length; i++) f[i] = frame[i] / 32768;
      this.vad.acceptWaveform(f);

      // Your voice level, for the blob (only while you're talking).
      if (this.o.onLevel && now - this.lastLevelAt > 80) {
        const talking = this.vad.isDetected();
        if (talking || this.wasTalking) {
          this.lastLevelAt = now;
          this.o.onLevel(talking ? Math.min(1, rms(f) * 9) : 0);
        }
        this.wasTalking = talking;
      }

      // Waited for an answer and none came.
      if (this.openUntil && now > this.openUntil && !this.vad.isDetected()) {
        this.closedAt = this.openUntil;     // a sentence that started before this still counts
        this.openUntil = 0;
        this.o.onState("idle", this.followUp ? "" : "Didn't catch anything");
      }

      while (!this.vad.isEmpty()) {
        const seg = this.vad.front(false);   // false: Electron doesn't allow the engine's shared buffers
        this.vad.pop();
        const samples = Float32Array.from(seg.samples);
        const endedAt = Date.now();
        this.chain = this.chain.then(() => this.handle(samples, endedAt)).catch((e) => this.o.onError(e));
      }
    }
  }

  async toText(samples) {
    if (this.localStt) return this.localStt(samples);
    return transcribe(toWav(samples), this.o.elevenlabsKey, this.o.sttModel);
  }

  async handle(samples, endedAt) {
    const ms = (samples.length / SAMPLE_RATE) * 1000;
    if (ms < MIN_SPEECH_MS) return;
    // Was this said while Jarvis was waiting for an answer? (it started before the window closed)
    const startedAt = endedAt - ms - 500;
    const until = this.openUntil || this.closedAt || 0;
    const open = until > 0 && startedAt <= until;

    let text = "";
    try { text = await this.toText(samples); } catch (e) {
      if (open) this.o.onState("idle", "Couldn't understand");
      throw e;
    }
    if (!text) return;
    const named = HAS_NAME.test(text);
    if (this.o.onHeard) this.o.onHeard(text);
    if (!named && !open) return;            // just talking, not to Jarvis

    const request = named ? stripName(text) : text;
    if (named && wordCount(request) < 2 && !/^(stop|cancel|dashboard|home|thanks|yes|no)\b/i.test(request)) {
      // "Hey Jarvis" on its own: wake up and wait for the request.
      this.o.onWake(false);
      if (this.captureOnWake) this.listenNow({ noSpeechMs: LISTEN_MS });
      return;
    }
    this.openUntil = 0; this.closedAt = 0;
    if (named) this.o.onWake(true);
    this.o.onState("thinking");
    this.o.onTranscript(request);
  }
}

module.exports = { Voice, toWav, transcribe, stripName, HAS_NAME };
