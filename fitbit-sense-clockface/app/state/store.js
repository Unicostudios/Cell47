/*
 * Tiny persisted UI state (which metric each slot shows).
 * Written only when the user taps, never on a timer.
 */
import * as fs from "fs";

const FILE = "face-state.json";

export function loadSelection(slotConfig, persist) {
  const sel = [];
  let saved = null;
  if (persist) {
    try {
      if (fs.existsSync(FILE)) saved = fs.readFileSync(FILE, "json");
    } catch (e) {
      saved = null;
    }
  }
  for (let i = 0; i < slotConfig.length; i++) {
    const n = saved && saved.sel ? saved.sel[i] : 0;
    // Guard against a stale file after SLOTS was edited.
    sel.push(typeof n === "number" && n >= 0 && n < slotConfig[i].length ? n : 0);
  }
  return sel;
}

export function saveSelection(sel, persist) {
  if (!persist) return;
  try {
    fs.writeFileSync(FILE, { sel: sel }, "json");
  } catch (e) {
    console.warn("Could not persist state: " + e);
  }
}
