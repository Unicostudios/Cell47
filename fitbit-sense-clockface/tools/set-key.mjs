#!/usr/bin/env node
/*
 * npm run set-key
 *
 * Asks for your Notion integration secret and saves it to
 * companion/secrets.js (git-ignored — never committed or pushed). The next
 * `build-and-install` bakes it into the phone companion, for when the Fitbit
 * app doesn't show this face's Settings screen (sideloaded faces are hidden
 * in the redesigned app).
 *
 *   npm run set-key            prompt for the key (input is hidden)
 *   npm run set-key -- --clear remove the saved key
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../companion/secrets.js");

function write(token) {
  writeFileSync(
    FILE,
    "// Local only — git-ignored. Written by `npm run set-key`.\n" +
      "export const NOTION_TOKEN = " + JSON.stringify(token) + ";\n"
  );
}

if (process.argv.includes("--clear")) {
  write("");
  console.log("Saved key removed. Run build-and-install to update the watch.");
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
// Hide what's typed/pasted after the prompt.
rl._writeToOutput = function (s) {
  if (!rl.muted) rl.output.write(s);
};
rl.muted = false;
rl.question("Paste your Notion secret (starts with ntn_ or secret_), then press Enter: ", (answer) => {
  rl.close();
  process.stdout.write("\n");
  const token = answer.trim();
  if (!/^(ntn_|secret_)\S{20,}$/.test(token)) {
    console.error("That doesn't look like a Notion secret. Nothing was saved.");
    process.exit(1);
  }
  write(token);
  console.log("Key saved on this Mac (not uploaded anywhere).");
  console.log("Next: npx fitbit  →  build-and-install");
});
rl.muted = true;
