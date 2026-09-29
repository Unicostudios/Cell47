/*
 * "Hey Jarvis" detector: openWakeWord (https://github.com/dscripka/openWakeWord)
 * running on-device with ONNX Runtime. Free, no account or key.
 *
 * Pipeline per 80 ms of 16 kHz audio (1280 samples):
 *   raw audio → melspectrogram model → (x / 10 + 2) → mel frame buffer
 *   last 76 mel frames → embedding model → 96-dim feature
 *   last 16 features → hey_jarvis model → score 0..1
 */
const path = require("path");
const fs = require("fs");
const ort = require("onnxruntime-node");

const CHUNK = 1280;            // 80 ms at 16 kHz
const MEL_CONTEXT = 160 * 3;   // extra samples so mel frames line up across chunks
const MEL_WINDOW = 76;
const FEATURES = 16;

class WakeWord {
  static async create(modelDir) {
    const w = new WakeWord();
    const opts = { executionProviders: ["cpu"], intraOpNumThreads: 1, interOpNumThreads: 1 };
    w.mel = await ort.InferenceSession.create(fs.readFileSync(path.join(modelDir, "melspectrogram.onnx")), opts);
    w.emb = await ort.InferenceSession.create(fs.readFileSync(path.join(modelDir, "embedding_model.onnx")), opts);
    w.kw = await ort.InferenceSession.create(fs.readFileSync(path.join(modelDir, "hey_jarvis_v0.1.onnx")), opts);
    w.reset();
    return w;
  }

  reset() {
    this.raw = new Float32Array(0);
    this.melFrames = [];
    for (let i = 0; i < MEL_WINDOW; i++) this.melFrames.push(new Float32Array(32).fill(1));
    this.features = [];
    for (let i = 0; i < FEATURES; i++) this.features.push(new Float32Array(96));
    this.warmup = 20;          // ignore the first ~1.6 s while buffers fill with real audio
  }

  /** Feed exactly 1280 int16 samples; resolves to the "Hey Jarvis" score (0..1). */
  async process(int16) {
    // keep the last chunk + context of raw audio
    const joined = new Float32Array(this.raw.length + int16.length);
    joined.set(this.raw);
    for (let i = 0; i < int16.length; i++) joined[this.raw.length + i] = int16[i];
    const input = joined.subarray(Math.max(0, joined.length - (CHUNK + MEL_CONTEXT)));
    this.raw = joined.slice(Math.max(0, joined.length - MEL_CONTEXT));

    const melOut = await this.mel.run({ input: new ort.Tensor("float32", Float32Array.from(input), [1, input.length]) });
    const m = melOut[this.mel.outputNames[0]];
    const frames = m.dims[m.dims.length - 2], bins = m.dims[m.dims.length - 1];
    for (let f = 0; f < frames; f++) {
      const row = new Float32Array(bins);
      for (let b = 0; b < bins; b++) row[b] = m.data[f * bins + b] / 10 + 2;
      this.melFrames.push(row);
    }
    if (this.melFrames.length > 200) this.melFrames.splice(0, this.melFrames.length - 200);

    const win = new Float32Array(MEL_WINDOW * 32);
    const start = this.melFrames.length - MEL_WINDOW;
    for (let f = 0; f < MEL_WINDOW; f++) win.set(this.melFrames[start + f], f * 32);
    const embOut = await this.emb.run({ input_1: new ort.Tensor("float32", win, [1, MEL_WINDOW, 32, 1]) });
    this.features.push(Float32Array.from(embOut[this.emb.outputNames[0]].data));
    if (this.features.length > FEATURES) this.features.shift();

    const feat = new Float32Array(FEATURES * 96);
    this.features.forEach((v, i) => feat.set(v, i * 96));
    const kwOut = await this.kw.run({ [this.kw.inputNames[0]]: new ort.Tensor("float32", feat, [1, FEATURES, 96]) });
    const score = kwOut[this.kw.outputNames[0]].data[0];
    if (this.warmup > 0) { this.warmup--; return 0; }
    return score;
  }
}

module.exports = { WakeWord, CHUNK };
