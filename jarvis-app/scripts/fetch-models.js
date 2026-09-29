#!/usr/bin/env node
/*
 * Downloads the openWakeWord "Hey Jarvis" models into ./models (runs on npm install).
 * Models: https://github.com/dscripka/openWakeWord (pre-trained models are
 * CC BY-NC-SA 4.0: fine for personal, non-commercial use).
 */
const fs = require("fs");
const path = require("path");

const BASE = "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/";
const FILES = { "melspectrogram.onnx": 1000000, "embedding_model.onnx": 1200000, "hey_jarvis_v0.1.onnx": 1100000 };
const DIR = path.join(__dirname, "..", "models");

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  for (const [name, minBytes] of Object.entries(FILES)) {
    const dest = path.join(DIR, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) continue;
    process.stdout.write("Downloading " + name + " … ");
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(name + ": HTTP " + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < minBytes) throw new Error(name + ": download looks incomplete");
    fs.writeFileSync(dest, buf);
    console.log(Math.round(buf.length / 1024) + " KB");
  }
  console.log("Hey Jarvis models ready.");
})().catch((e) => { console.error("Couldn't download the Hey Jarvis models: " + e.message); process.exit(1); });
