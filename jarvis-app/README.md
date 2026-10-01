# Jarvis for Mac

Jarvis is your Ops Desk dashboard as a Mac app. It gives you:

- **Its own window.** There's no browser and no address bar. It sits in the Dock and the menu bar, and keeps running when you close the window.
- **A voice-first home.** It opens on a living silver form that moves as you talk and as Jarvis answers. Click **Open dashboard**, or say "Jarvis, open the dashboard", to see everything; say "go back" or click the logo to return.
- **Always listening for "Jarvis".** Say "Jarvis, …", "Hey Jarvis, …" or "…, Jarvis?" and it does it. Say just "Jarvis" and it waits for your request. After it answers, you can reply without the name for a few seconds. Anything you say without "Jarvis" is ignored.
- **A keyboard shortcut.** Press **⌥Space** to talk without saying "Jarvis".
- **Sound that plays straight away.** The spoken greeting and replies don't need a click first.

Everything voice runs on your Mac, free, with [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx): Silero VAD notices when you start and stop talking, [Moonshine](https://github.com/moonshine-ai/moonshine) turns each sentence into text (about 0.1 s), and Jarvis speaks with Kokoro's "Sarah" voice. Your voice never leaves the Mac, and nothing uses ElevenLabs credits. While Jarvis is talking it ignores the mic, so it can't hear itself. `npm install` downloads the models (about 650 MB, once). The built app reads them from `~/Library/Application Support/Jarvis/models` (they're too big for macOS's signing tool inside the app); `scripts/update.sh` copies them there. An ElevenLabs key is optional: it's only a backup if the speech-to-text model is missing, and it's stored encrypted with your macOS Keychain. Problems are written to `~/Library/Logs/Jarvis/jarvis.log`.

You need a Mac with Apple Silicon (M1 or later).

## Install

You need Node.js, which you already have from the Fitbit setup.

Download the repo ZIP, unzip it in Downloads, then run:

```bash
bash ~/Downloads/Cell47-claude-fitbit-sense-clock-face-k7b4i1/jarvis-app/scripts/update.sh
```

It copies the files to `~/Cell47/jarvis-app`, installs, builds Jarvis.app, puts it in Applications, checks everything (`npm run doctor`) and opens it.

The first time you open it:

1. Allow **Microphone** access when macOS asks.
2. **Sign in to Claude** in the Jarvis window. You only need to do this once.
3. Optional: in **Settings** you can paste an **ElevenLabs key** (`sk_…`) as a backup for speech-to-text. Jarvis works without it.
4. Say **"Jarvis, what's on today?"**

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

- **It doesn't respond to "Jarvis".** Check the Mac has the microphone under **System Settings → Privacy & Security → Microphone → Jarvis**, and raise **sensitivity** in Settings if you speak softly. `~/Library/Logs/Jarvis/jarvis.log` shows what it heard.
- **It picks up background noise.** Lower the sensitivity.
- **"ElevenLabs rejected the key"** (only if you added one). Use the full `sk_…` key, not the key's ID, and make sure the key has Speech to Text allowed.
- **It hears you, but nothing happens.** Open the window and check you're signed in to Claude. The dashboard needs to have loaded once.
