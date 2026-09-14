"use strict";

// Field names matching this pattern are treated as sensitive and stripped from every API response
// generated for a model's CRUD endpoints, regardless of database backend. This is a conservative,
// name-based heuristic — not a replacement for review — documented in the README's limitations.
const SENSITIVE_FIELD_PATTERN = /password|secret|hash/i;

function getSensitiveFields(model) {
  return model.fields.filter((f) => !f.primaryKey && SENSITIVE_FIELD_PATTERN.test(f.name)).map((f) => f.name);
}

module.exports = { getSensitiveFields, SENSITIVE_FIELD_PATTERN };
