# Jarvis for Mac

Jarvis is your Ops Desk dashboard as a Mac app. It gives you:

- **Its own window.** There's no browser and no address bar. It sits in the Dock and the menu bar, and keeps running when you close the window.
- **"Hey Jarvis".** It listens in the background. Say the wake word, then what you want. When you stop talking, it turns what you said into text on your Mac and runs it in the Ask Jarvis bar, and Jarvis answers out loud in its own voice. Listening is free and needs no account.
- **A keyboard shortcut.** Press **⌥Space** to talk without saying the wake word.
- **Sound that plays straight away.** The spoken greeting and replies don't need a click first.

The wake word runs entirely on your Mac, using [openWakeWord](https://github.com/dscripka/openWakeWord)'s "Hey Jarvis" model with ONNX Runtime. It uses about 4% of one processor core. What you say after it is turned into text on the Mac too, with the [Moonshine](https://github.com/moonshine-ai/moonshine) model via [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) (about 0.1 s per command), so your voice never leaves the Mac. Jarvis's voice ("Sarah", from [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)) is made on the Mac as well, so speaking is free and unlimited, with no ElevenLabs credits. `npm install` downloads the models (about 600 MB, once). An ElevenLabs key is optional: it's only used as a backup if the speech model is missing, and it's stored encrypted with your macOS Keychain.

You need a Mac with Apple Silicon (M1 or later). The pre-trained openWakeWord models are licensed CC BY-NC-SA 4.0, which is fine for personal use. `npm install` downloads them into `models/`.

## Install

You need Node.js, which you already have from the Fitbit setup.

```bash
cd ~/Cell47
git pull
cd jarvis-app
npm install
npm run app
```

This builds `dist/mac-arm64/Jarvis.app`. Drag the app into your **Applications** folder and open it.

The first time you open it:

1. Allow **Microphone** access when macOS asks.
2. **Sign in to Claude** in the Jarvis window. You only need to do this once.
3. Optional: in **Settings** you can paste an **ElevenLabs key** (`sk_…`) as a backup for speech-to-text. Jarvis works without it.
4. Save, then say **"Hey Jarvis"**.

To try it without building the app, run `npm start`. macOS will then ask for microphone access on behalf of "Electron" rather than Jarvis.

## Menu bar

Click the wave icon in the menu bar to:

- see what Jarvis is doing
- open the window
- talk now
- turn listening on or off
- choose whether Jarvis starts when your Mac starts
- open Settings
- reload the dashboard
- quit

## Troubleshooting

- **The wake word never triggers.** Raise **sensitivity** in Settings. Also check the Mac has the microphone under **System Settings → Privacy & Security → Microphone → Jarvis**.
- **It wakes by accident.** Lower the sensitivity.
- **"ElevenLabs rejected the key"** (only if you added one). Use the full `sk_…` key, not the key's ID, and make sure the key has Speech to Text allowed.
- **It hears you, but nothing happens.** Open the window and check you're signed in to Claude. The dashboard needs to have loaded once.
