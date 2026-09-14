"use strict";

const { isEsm } = require("../syntax");

const ZOD_BASE = {
  string: "z.string()",
  text: "z.string()",
  number: "z.number()",
  integer: "z.number().int()",
  float: "z.number()",
  boolean: "z.boolean()",
  date: "z.coerce.date()",
  datetime: "z.coerce.date()",
  uuid: "z.string().uuid()",
  json: "z.record(z.string(), z.any())",
  decimal: "z.number()",
  bigint: "z.number().int()",
};

function buildFieldZod(field) {
  if (field.type === "enum") {
    let expr = `z.enum(${JSON.stringify(field.values)})`;
    if (!field.required) expr += ".optional()";
    if (field.nullable) expr += ".nullable()";
    return expr;
  }

  let expr = ZOD_BASE[field.type];
  if (field.type === "string" || field.type === "text") {
    if (field.length) expr += `.max(${field.length})`;
    if (field.min !== undefined) expr += `.min(${field.min})`;
  } else if (["number", "integer", "float", "decimal", "bigint"].includes(field.type)) {
    if (field.min !== undefined) expr += `.min(${field.min})`;
    if (field.max !== undefined) expr += `.max(${field.max})`;
  }

  if (!field.required) expr += ".optional()";
  if (field.nullable) expr += ".nullable()";
  return expr;
}

/** entity model -> Zod create/update validators. Skips the primary key and timestamp fields on write payloads. */
function generateEntityValidator(model, config) {
  const esm = isEsm(config);
  const zodImport = esm ? `import { z } from "zod";` : `const { z } = require("zod");`;

  const writableFields = model.fields.filter((f) => !(f.primaryKey && f.synthetic));

  const createLines = writableFields.map((f) => `  ${f.camelName}: ${buildFieldZod(f)},`).join("\n");

  const createSchemaName = `create${model.pascalName}Schema`;
  const updateSchemaName = `update${model.pascalName}Schema`;

  const body = `${zodImport}

const ${createSchemaName} = z.object({
${createLines}
});

const ${updateSchemaName} = ${createSchemaName}.partial();
`;

  const footer = esm
    ? `\nexport { ${createSchemaName}, ${updateSchemaName} };\n`
    : `\nmodule.exports = { ${createSchemaName}, ${updateSchemaName} };\n`;

  return body + footer;
}

module.exports = { generateEntityValidator };
