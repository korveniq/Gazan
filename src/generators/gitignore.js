"use strict";

function buildGitignore(config) {
  const lines = [
    "node_modules/",
    ".env",
    "*.log",
    "npm-debug.log*",
    ".DS_Store",
    "coverage/",
  ];
  if (config.language === "ts") lines.push("dist/");
  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    lines.push("prisma/*.db");
  }
  return lines.join("\n") + "\n";
}

module.exports = { buildGitignore };
