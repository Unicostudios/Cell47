# Ops Voice

A tiny private MCP connector that gives the Ops Desk dashboard an ElevenLabs voice.
It has a single tool, `speak(text)`, which calls ElevenLabs text-to-speech and returns the MP3 as an MCP `audio` content block (base64). The dashboard plays that audio with the Web Audio API. Artifacts can't load audio from other websites, so the audio has to come through a connector.

## Deploy (Vercel)

1. Deploy this folder as a Vercel project. It has no dependencies and no build step.
2. In **Project → Settings → Environment Variables**, add:
   - `ELEVENLABS_API_KEY`: your ElevenLabs API key.
   - `ACCESS_CODE`: any long random string, for example 32 letters and digits.
   - `VOICE_ID` (optional): the ElevenLabs voice to use. The default is George, `JBFqnCBsd6RMkjVDRZzb`.
3. Redeploy so the variables take effect.

## Connect (claude.ai)

In **Settings → Connectors → Add custom connector**:

- Name: `Ops Voice`. The dashboard looks for this exact name.
- URL: `https://<your-project>.vercel.app/mcp/<ACCESS_CODE>`

Requests without the right access code get a 404. The API key never leaves Vercel.
