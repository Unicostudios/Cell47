#!/usr/bin/env node
/*
 * Runs before every build (npm "prebuild"). Creates an empty
 * companion/secrets.js if it doesn't exist yet, so the build works before
 * `npm run set-key` has been used. Never overwrites a saved key.
 */
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../companion/secrets.js");
if (!existsSync(FILE)) {
  writeFileSync(FILE, "// Local only — git-ignored. Set with `npm run set-key`.\nexport const NOTION_TOKEN = \"\";\n");
}
