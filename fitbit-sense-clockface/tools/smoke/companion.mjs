#!/usr/bin/env node
/*
 * Companion smoke test: bundles companion/index.js with fake Fitbit phone
 * modules and a fake Notion API (no network), then checks it writes the
 * watch's stats into the page's JSON code block.
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "out");
mkdirSync(OUT, { recursive: true });

// ---- fake phone modules ---------------------------------------------------
const store = {};
const listeners = {};
const queue = [];
globalThis.__companion = {
  settingsStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; }
  },
  inbox: {
    addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
    pop: () => Promise.resolve(queue.shift())
  }
};
const MODULES = {
  settings: "export const settingsStorage = globalThis.__companion.settingsStorage;",
  "file-transfer": "export const inbox = globalThis.__companion.inbox;"
};

// ---- fake Notion ----------------------------------------------------------
const calls = [];
let children = [{ id: "blk-1", type: "paragraph" }, { id: "blk-code", type: "code" }];
globalThis.fetch = async (url, init) => {
  calls.push({ url, method: init.method, headers: init.headers, body: init.body && JSON.parse(init.body) });
  if (init.headers.Authorization !== "Bearer ntn_test") return { ok: false, status: 401, text: async () => "unauthorized" };
  if (init.method === "GET") return { ok: true, json: async () => ({ results: children }) };
  return { ok: true, json: async () => ({}) };
};

const bundle = await build({
  entryPoints: [path.join(ROOT, "companion/index.js")],
  bundle: true, write: false, format: "cjs", platform: "neutral", target: "es2017",
  plugins: [{
    name: "fitbit-companion-mocks",
    setup(b) {
      b.onResolve({ filter: /^(settings|file-transfer)$/ }, (a) => ({ path: a.path, namespace: "fb" }));
      b.onLoad({ filter: /.*/, namespace: "fb" }, (a) => ({ contents: MODULES[a.path] }));
    }
  }]
});
const file = path.join(OUT, "companion.bundle.cjs");
writeFileSync(file, bundle.outputFiles[0].text);

let failures = 0;
const check = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
const settle = () => new Promise((r) => setTimeout(r, 20));
const item = (data) => ({ cbor: async () => data });

createRequire(import.meta.url)(file);
await settle();

console.log("\nCompanion → Notion");
queue.push(item({ steps: 8420, calories: 1359, heartRate: 78, sleepMinutes: 440, t: 1000 }));
listeners.newfile.forEach((f) => f());
await settle();
check(calls.length === 0 && /Notion key/.test(store.syncStatus), "no key yet → nothing sent, settings shows why");

store.notionToken = JSON.stringify({ name: "ntn_test" });
queue.push(item({ steps: 8000, t: 500 }), item({ steps: 9100, calories: 1500, heartRate: 81, sleepMinutes: 450, t: 2000 }));
listeners.newfile.forEach((f) => f());
await settle();
const patch = calls.find((c) => c.method === "PATCH");
check(calls[0] && calls[0].url.includes("/blocks/3e95bf6a9e3c81e5a206c7373b739844/children"), "reads the default Fitbit Stats page");
check(calls[0].headers["Notion-Version"] && calls.every((c) => c.url.startsWith("https://api.notion.com/v1/")), "only calls api.notion.com with a Notion-Version header");
check(patch && patch.url.endsWith("/blocks/blk-code"), "updates the existing JSON code block");
const written = patch && JSON.parse(patch.body.code.rich_text[0].text.content);
check(written && written.steps === 9100 && written.sleepMinutes === 450 && written.updated, "writes the newest snapshot as JSON");
check(/Last synced/.test(store.syncStatus), "settings page shows last sync time");

console.log("\nFirst run on an empty page + custom page link");
calls.length = 0;
children = [];
store.notionPage = JSON.stringify({ name: "https://www.notion.so/My-Stats-0123456789abcdef0123456789abcdef" });
queue.push(item({ steps: 1, t: 3000 }));
listeners.newfile.forEach((f) => f());
await settle();
check(calls[0].url.includes("/blocks/0123456789abcdef0123456789abcdef/children"), "page id parsed from a pasted link");
check(calls[1] && calls[1].method === "PATCH" && calls[1].body.children[0].type === "code", "creates the code block if missing");

console.log("\nBad key");
store.notionToken = JSON.stringify({ name: "wrong" });
queue.push(item({ steps: 2, t: 4000 }));
listeners.newfile.forEach((f) => f());
await settle();
check(/Sync failed — Notion 401/.test(store.syncStatus), "error surfaced in settings instead of crashing");

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll companion checks passed");
process.exit(failures ? 1 : 0);
