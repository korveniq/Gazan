"use strict";

const fs = require("fs-extra");

// The only entries safe to ignore when deciding whether a directory is "empty enough" to
// generate into without asking. Deliberately NOT a blanket dotfile exclusion — a pre-existing
// .env (real secrets), .gitignore, or editor config must still trip the not-empty safety prompt,
// since GeneratorEngine.createFile overwrites unconditionally once generation proceeds.
const IGNORABLE_ENTRIES = new Set([".git", ".DS_Store"]);

function isDirEmpty(dir) {
  if (!fs.existsSync(dir)) return true;
  const entries = fs.readdirSync(dir).filter((e) => !IGNORABLE_ENTRIES.has(e));
  return entries.length === 0;
}

module.exports = { isDirEmpty };
