/*
 * Ops Voice — a tiny private MCP server (Streamable HTTP, stateless, JSON
 * responses) with one tool, `speak`, that turns text into speech with
 * ElevenLabs and returns the MP3 as base64. The Ops Desk dashboard calls it
 * through claude.ai as a custom connector and plays the audio in the page.
 *
 * Environment variables (set in the Vercel project, never in code):
 *   ELEVENLABS_API_KEY  your ElevenLabs API key
 *   ACCESS_CODE         any long random string; the connector URL is
 *                       https://<your-app>.vercel.app/mcp/<ACCESS_CODE>
 *   VOICE_ID            optional default voice (defaults to "George")
 */

const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George — warm, British
const MAX_CHARS = 2500;
const PROTOCOL = "2025-06-18";

const SPEAK_TOOL = {
  name: "speak",
  title: "Speak text",
  description:
    "Convert text to natural speech with ElevenLabs. Returns the MP3 audio as an audio content block (base64).",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "What to say (plain text, up to 2500 characters)." },
      voice_id: { type: "string", description: "Optional ElevenLabs voice id. Defaults to the configured voice." },
      quality: { type: "string", enum: ["fast", "best"], description: "fast = lowest latency (default); best = richer delivery." }
    },
    required: ["text"]
  },
  annotations: { readOnlyHint: true, openWorldHint: true }
};

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function rpcResult(id, result) { return { jsonrpc: "2.0", id, result }; }
function rpcError(id, code, message) { return { jsonrpc: "2.0", id, error: { code, message } }; }

async function speak(args) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return { isError: true, content: [{ type: "text", text: "ELEVENLABS_API_KEY is not set on the server." }] };
  const text = String((args && args.text) || "").trim().slice(0, MAX_CHARS);
  if (!text) return { isError: true, content: [{ type: "text", text: "Nothing to say — text is empty." }] };
  const voice = String((args && args.voice_id) || process.env.VOICE_ID || DEFAULT_VOICE).replace(/[^A-Za-z0-9]/g, "");
  const model = args && args.quality === "best" ? "eleven_multilingual_v2" : "eleven_flash_v2_5";

  const res = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/" + voice + "?output_format=mp3_44100_64",
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true }
      })
    }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    return { isError: true, content: [{ type: "text", text: "ElevenLabs error " + res.status + ": " + detail }] };
  }
  const b64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return {
    content: [
      { type: "audio", data: b64, mimeType: "audio/mpeg" },
      { type: "text", text: "Spoke " + text.length + " characters." }
    ]
  };
}

async function handle(msg) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcError(msg && msg.id !== undefined ? msg.id : null, -32600, "Invalid request");
  }
  const isNotification = msg.id === undefined || msg.id === null;
  switch (msg.method) {
    case "initialize":
      return rpcResult(msg.id, {
        protocolVersion: (msg.params && msg.params.protocolVersion) || PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "ops-voice", title: "Ops Voice", version: "1.0.0" },
        instructions: "One tool: speak(text) returns spoken audio for the Ops Desk dashboard."
      });
    case "ping":
      return rpcResult(msg.id, {});
    case "tools/list":
      return rpcResult(msg.id, { tools: [SPEAK_TOOL] });
    case "tools/call": {
      const name = msg.params && msg.params.name;
      if (name !== "speak") return rpcError(msg.id, -32602, "Unknown tool: " + name);
      try {
        return rpcResult(msg.id, await speak((msg.params && msg.params.arguments) || {}));
      } catch (e) {
        return rpcResult(msg.id, { isError: true, content: [{ type: "text", text: "Speech failed: " + e.message }] });
      }
    }
    default:
      if (isNotification) return null; // notifications/initialized etc.
      return rpcError(msg.id, -32601, "Method not found: " + msg.method);
  }
}

module.exports = async function (req, res) {
  const expected = process.env.ACCESS_CODE || "";
  const given = String((req.query && req.query.key) || "");
  if (!expected || !safeEqual(given, expected)) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.statusCode = 405;
    return res.end("Method not allowed");
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  if (!body) {
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 400;
    return res.end(JSON.stringify(rpcError(null, -32700, "Parse error")));
  }

  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!replies.length) {
    res.statusCode = 202;
    return res.end();
  }
  res.setHeader("Content-Type", "application/json");
  res.statusCode = 200;
  res.end(JSON.stringify(batch ? replies : replies[0]));
};
