"use strict";

class EntityValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "EntityValidationError";
    this.issues = issues; // array of { path, message }
  }

  format() {
    const lines = [`Invalid entity.json`, ""];
    for (const issue of this.issues) {
      lines.push(`${issue.path}:`);
      lines.push(`  ${issue.message}`);
      lines.push("");
    }
    return lines.join("\n").trimEnd();
  }
}

module.exports = { EntityValidationError };
