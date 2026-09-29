/*
 * Voice engine for Jarvis (runs in Electron's main process).
 *
 *   idle mic → "Hey Jarvis" (Porcupine, fully on-device)
 *            → record until you stop talking (simple energy-based end-of-speech)
 *            → ElevenLabs speech-to-text → transcript
 *
 * Nothing leaves the Mac until the wake word is heard; then only that one
 * utterance is sent to ElevenLabs for transcription.
 */
const { Porcupine, BuiltinKeyword } = require("@picovoice/porcupine-node");
const { PvRecorder } = require("@picovoice/pvrecorder-node");

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
   *   picovoiceKey, elevenlabsKey, sensitivity (0-1), sttModel,
   *   onWake(), onState(state, detail), onTranscript(text), onError(err)
   */
  constructor(o) {
    this.o = o;
    this.mode = "off";
    this.noise = 300;
    this.cooldownUntil = 0;
  }

  start() {
    if (this.mode !== "off") return;
    this.porcupine = new Porcupine(this.o.picovoiceKey, [BuiltinKeyword.JARVIS], [this.o.sensitivity || 0.6]);
    this.recorder = new PvRecorder(this.porcupine.frameLength);
    this.recorder.start();
    this.mode = "wake";
    this.loop();
  }

  stop() {
    this.mode = "off";
    try { this.recorder && this.recorder.stop(); } catch (e) {}
    try { this.recorder && this.recorder.release(); } catch (e) {}
    try { this.porcupine && this.porcupine.release(); } catch (e) {}
    this.recorder = this.porcupine = null;
  }

  /** Start listening for a command right away (e.g. from a keyboard shortcut). */
  listenNow() {
    if (this.mode === "wake") this.beginCapture();
  }

  async loop() {
    while (this.mode !== "off") {
      let frame;
      try { frame = await this.recorder.read(); } catch (e) {
        if (this.mode !== "off") this.o.onError(e);
        return;
      }
      if (this.mode === "wake") {
        this.noise = this.noise * 0.97 + rms(frame) * 0.03;   // running background level
        if (Date.now() < this.cooldownUntil) continue;
        if (this.porcupine.process(frame) >= 0) {
          this.o.onWake();
          this.beginCapture();
        }
      } else if (this.mode === "capture") {
        this.capture(frame);
      }
    }
  }

  beginCapture() {
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

    if (!this.heard && this.elapsed >= NO_SPEECH_MS) return this.finish(false);
    if (this.heard && this.quietMs >= END_SILENCE_MS) return this.finish(true);
    if (this.elapsed >= MAX_UTTERANCE_MS) return this.finish(this.heard);
  }

  finish(gotSpeech) {
    const frames = this.frames;
    this.frames = [];
    this.mode = "wake";
    this.cooldownUntil = Date.now() + COOLDOWN_MS;
    if (!gotSpeech) { this.o.onState("idle", "Didn't catch anything"); return; }
    this.o.onState("thinking");
    transcribe(toWav(frames), this.o.elevenlabsKey, this.o.sttModel)
      .then((text) => {
        if (text) this.o.onTranscript(text);
        else this.o.onState("idle", "Didn't catch that");
      })
      .catch((e) => { this.o.onState("idle", "Couldn't understand"); this.o.onError(e); });
  }
}

module.exports = { Voice, toWav, transcribe };
