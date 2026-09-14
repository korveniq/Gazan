"use strict";

const { isEsm } = require("./syntax");

/**
 * helpers/strip-sensitive-fields.{js,ts} — generated only when at least one entity.json model has
 * a field matching the sensitive-field heuristic (password/secret/hash). Services for those models
 * use this to keep such fields out of API responses without touching every ORM's query layer.
 *
 * `T extends object` (rather than `Record<string, unknown>`) so this also accepts ORM-specific
 * result types without an index signature (e.g. Mongoose Documents, Prisma model types) — the
 * internal cast is the narrow, deliberate escape hatch generic "delete an arbitrary key" needs.
 */
function generateStripSensitiveFieldsHelper(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";

  const singleSig = isTs
    ? "stripSensitiveFields<T extends object>(record: T | null | undefined, fields: string[]): T | null | undefined"
    : "stripSensitiveFields(record, fields)";
  const listSig = isTs
    ? "stripSensitiveFieldsFromList<T extends object>(records: T[], fields: string[]): T[]"
    : "stripSensitiveFieldsFromList(records, fields)";
  const cast = isTs ? " as Record<string, unknown>" : "";
  const returnCast = isTs ? " as T" : "";

  return `function ${singleSig} {
  if (!record) return record;
  const clone = { ...record }${cast};
  for (const field of fields) {
    delete clone[field];
  }
  return clone${returnCast};
}

function ${listSig} {
  return records.map((record) => {
    const clone = { ...record }${cast};
    for (const field of fields) {
      delete clone[field];
    }
    return clone${returnCast};
  });
}

${esm ? "export { stripSensitiveFields, stripSensitiveFieldsFromList };" : "module.exports = { stripSensitiveFields, stripSensitiveFieldsFromList };"}
`;
}

module.exports = { generateStripSensitiveFieldsHelper };
