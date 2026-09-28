/*
 * Companion — runs inside the Fitbit app on the phone.
 *
 * Receives the stats file queued by the watch (app/data/sync.js) and writes
 * it as JSON into the code block of the user's "Fitbit Stats" Notion page,
 * which the Ops Desk dashboard reads. Only talks to api.notion.com, only
 * with the key the user pasted into this clock face's settings.
 */
import { inbox } from "file-transfer";
import { settingsStorage } from "settings";

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
// The "Fitbit Stats" page created for this setup. Overridable in settings.
const DEFAULT_PAGE_ID = "3e95bf6a9e3c81e5a206c7373b739844";

/** TextInput stores {"name":"…"}; accept that or a plain string. */
function setting(key) {
  const raw = settingsStorage.getItem(key);
  if (!raw) return "";
  try {
    const v = JSON.parse(raw);
    return (v && v.name ? v.name : typeof v === "string" ? v : "").trim();
  } catch (e) {
    return raw.trim();
  }
}

/** Accepts a Notion link or a bare id; returns the 32-hex page id. */
function pageId() {
  const m = setting("notionPage").replace(/-/g, "").match(/[0-9a-f]{32}/i);
  return m ? m[0] : DEFAULT_PAGE_ID;
}

function status(text) {
  settingsStorage.setItem("syncStatus", text);
}

function notion(token, method, path, body) {
  return fetch(NOTION + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + token,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function (res) {
    if (!res.ok) {
      return res.text().then(function (t) {
        throw new Error("Notion " + res.status + ": " + t.slice(0, 120));
      });
    }
    return res.json();
  });
}

function codeBlock(json) {
  return { language: "json", rich_text: [{ type: "text", text: { content: json } }] };
}

function pushToNotion(stats) {
  const token = setting("notionToken");
  if (!token) {
    status("Waiting for your Notion key");
    return Promise.resolve();
  }
  const page = pageId();
  const json = JSON.stringify({
    steps: stats.steps === undefined ? null : stats.steps,
    calories: stats.calories === undefined ? null : stats.calories,
    heartRate: stats.heartRate === undefined ? null : stats.heartRate,
    sleepMinutes: stats.sleepMinutes === undefined ? null : stats.sleepMinutes,
    azm: stats.azm === undefined ? null : stats.azm,
    distance: stats.distance === undefined ? null : stats.distance,
    updated: new Date(stats.t || Date.now()).toISOString()
  });

  return notion(token, "GET", "/blocks/" + page + "/children?page_size=100")
    .then(function (res) {
      let block = null;
      for (let i = 0; i < res.results.length; i++) {
        if (res.results[i].type === "code") {
          block = res.results[i];
          break;
        }
      }
      if (block) return notion(token, "PATCH", "/blocks/" + block.id, { code: codeBlock(json) });
      return notion(token, "PATCH", "/blocks/" + page + "/children", {
        children: [{ object: "block", type: "code", code: codeBlock(json) }]
      });
    })
    .then(function () {
      status("Last synced " + new Date().toLocaleTimeString());
    })
    .catch(function (e) {
      status("Sync failed — " + e.message);
      console.error(e);
    });
}

/** Drain every queued file; only the newest snapshot is sent. */
function processInbox() {
  let latest = null;
  function next() {
    return inbox.pop().then(function (file) {
      if (!file) return latest ? pushToNotion(latest) : null;
      return file.cbor().then(function (data) {
        if (!latest || (data.t || 0) >= (latest.t || 0)) latest = data;
        return next();
      });
    });
  }
  return next();
}

inbox.addEventListener("newfile", processInbox);
processInbox();
