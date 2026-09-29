# Jarvis for Mac

Jarvis is your Ops Desk dashboard as a Mac app. It gives you:

- **Its own window.** There's no browser and no address bar. It sits in the Dock and the menu bar, and keeps running when you close the window.
- **"Hey Jarvis".** It listens in the background. Say the wake word, then what you want. When you stop talking, it transcribes what you said and runs it in the Ask Jarvis bar, and Matilda answers.
- **A keyboard shortcut.** Press **⌥Space** to talk without saying the wake word.
- **Sound that plays straight away.** The spoken greeting and replies don't need a click first.

The wake word runs entirely on your Mac, using Picovoice Porcupine. Audio only leaves the Mac after you say "Hey Jarvis", and then only that one sentence goes to ElevenLabs to be turned into text. Your keys are stored encrypted with your macOS Keychain.

## Install

You need Node.js, which you already have from the Fitbit setup.

```bash
cd ~/Cell47
git pull
cd jarvis-app
npm install
npm run app
```

This builds `dist/mac-arm64/Jarvis.app`. On Intel Macs the folder is `dist/mac/Jarvis.app`. Drag the app into your **Applications** folder and open it.

The first time you open it:

1. Allow **Microphone** access when macOS asks.
2. **Sign in to Claude** in the Jarvis window. You only need to do this once.
3. **Settings** opens. Paste two keys:
   - your **Picovoice access key**, free from console.picovoice.ai
   - your **ElevenLabs key** (`sk_…`). It must be allowed to use **Speech to Text**.
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
- **"ElevenLabs rejected the key".** Use the full `sk_…` key, not the key's ID, and make sure the key has Speech to Text allowed.
- **It hears you, but nothing happens.** Open the window and check you're signed in to Claude. The dashboard needs to have loaded once.
