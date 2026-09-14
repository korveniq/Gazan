"use strict";

const MONGOOSE_TYPE_MAP = {
  string: "String",
  text: "String",
  number: "Number",
  integer: "Number",
  float: "Number",
  boolean: "Boolean",
  date: "Date",
  datetime: "Date",
  uuid: "String",
  json: "mongoose.Schema.Types.Mixed",
  enum: "String",
  decimal: "mongoose.Schema.Types.Decimal128",
  bigint: "mongoose.Schema.Types.Mixed",
};

function buildFieldDefinition(model, field, allModels) {
  const belongsTo = model.relations.find((r) => r.type === "belongsTo" && r.foreignKey === field.name);
  const props = [];

  if (belongsTo) {
    const target = allModels.find((m) => m.name === belongsTo.model);
    // Every Mongo primary key is a String UUID (see buildIdOverride), so the FK referencing it
    // must be String too — mongoose.Schema.Types.ObjectId would throw a CastError on every write.
    props.push(`type: String`);
    if (target) props.push(`ref: "${target.pascalName}"`);
  } else {
    props.push(`type: ${MONGOOSE_TYPE_MAP[field.type]}`);
    if (field.type === "enum") props.push(`enum: ${JSON.stringify(field.values)}`);
  }

  if (field.required) props.push(`required: true`);
  if (field.unique) props.push(`unique: true`);
  if (field.index && !field.unique) props.push(`index: true`);
  if (field.default !== undefined && field.default !== null && field.default !== "uuid") {
    props.push(`default: ${JSON.stringify(field.default)}`);
  }
  if (field.min !== undefined) props.push(`min: ${field.min}`);
  if (field.max !== undefined) props.push(`max: ${field.max}`);
  if (field.length !== undefined) props.push(`maxlength: ${field.length}`);

  return `    ${field.camelName}: { ${props.join(", ")} },`;
}

/**
 * Entity validation guarantees that a MongoDB model's primary key, if declared explicitly, is
 * always type 'uuid' (anything else — including autoIncrement — is rejected at parse time since
 * Mongo has no native equivalent). So rather than emitting a redundant parallel 'id' field next to
 * Mongo's native `_id`, we always route the primary key through `_id` itself: overriding its type
 * to a generated UUID string. This is the one documented strategy GAZAN uses for Mongo primary
 * keys — see README's MongoDB section.
 */
function buildIdOverride() {
  return `    _id: { type: String, default: () => randomUUID() },`;
}

/**
 * belongsToMany has no scalar FK column to hang off buildFieldDefinition (it only walks
 * model.fields) — Mongoose represents it as its own array-of-refs field instead.
 */
function buildManyToManyFields(model, allModels) {
  const lines = [];
  for (const relation of model.relations) {
    if (relation.type !== "belongsToMany") continue;
    const target = allModels.find((m) => m.name === relation.model);
    if (!target) continue;
    lines.push(`    ${relation.camelName}: { type: [String], ref: "${target.pascalName}", default: [] },`);
  }
  return lines;
}

function buildVirtuals(model, allModels) {
  const lines = [];
  for (const relation of model.relations) {
    if (relation.type === "hasMany" || relation.type === "hasOne") {
      const target = allModels.find((m) => m.name === relation.model);
      if (!target) continue;
      lines.push(`${model.camelName}Schema.virtual("${relation.name}", {`);
      lines.push(`  ref: "${target.pascalName}",`);
      lines.push(`  localField: "_id",`);
      lines.push(`  foreignField: "${relation.foreignKey}",`);
      lines.push(`  justOne: ${relation.type === "hasOne"},`);
      lines.push(`});`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

function generateMongooseModel(model, allModels, config) {
  const nonPkFields = model.fields.filter((f) => !f.primaryKey);
  const fieldLines = [
    buildIdOverride(),
    ...nonPkFields.map((f) => buildFieldDefinition(model, f, allModels)),
    ...buildManyToManyFields(model, allModels),
  ].join("\n");

  const virtuals = buildVirtuals(model, allModels);
  const isTs = config.language === "ts";
  const esm = config.moduleSystem === "mjs" || isTs;

  const cryptoImport = esm ? `import { randomUUID } from "node:crypto";` : `const { randomUUID } = require("node:crypto");`;
  const mongooseImport = isTs
    ? `import mongoose, { Document } from "mongoose";`
    : config.moduleSystem === "mjs"
    ? `import mongoose from "mongoose";`
    : `const mongoose = require("mongoose");`;

  const header = `${mongooseImport}\n${cryptoImport}\n`;

  const interfaceBlock = isTs ? buildTsInterface(model) : "";

  const schemaBody = [
    `const ${model.camelName}Schema = new mongoose.Schema(`,
    `  {`,
    fieldLines,
    `  },`,
    `  {`,
    `    timestamps: ${model.timestamps},`,
    `    collection: "${model.tableName}",`,
    `  }`,
    `);`,
    ``,
    virtuals ? virtuals : "",
    `${model.camelName}Schema.set("toJSON", { virtuals: true });`,
    ``,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const exportBlock = isTs
    ? `export const ${model.pascalName} = mongoose.model<${model.pascalName}Document>("${model.pascalName}", ${model.camelName}Schema);\n`
    : config.moduleSystem === "mjs"
    ? `export const ${model.pascalName} = mongoose.model("${model.pascalName}", ${model.camelName}Schema);\n`
    : `const ${model.pascalName} = mongoose.model("${model.pascalName}", ${model.camelName}Schema);\n\nmodule.exports = ${model.pascalName};\n`;

  return [header, interfaceBlock, schemaBody, exportBlock].filter(Boolean).join("\n");
}

const TS_TYPE_MAP = {
  string: "string",
  text: "string",
  number: "number",
  integer: "number",
  float: "number",
  boolean: "boolean",
  date: "Date",
  datetime: "Date",
  uuid: "string",
  json: "Record<string, unknown>",
  enum: "string",
  decimal: "number",
  bigint: "number",
};

function buildTsInterface(model) {
  // Document<string, ...> types this model's `_id` (and the `.id` virtual) as a string, matching
  // the UUID primary key strategy above — Mongoose's default `Document` types `_id` as an ObjectId.
  const lines = [`export interface ${model.pascalName}Document extends Document<string> {`];
  for (const field of model.fields) {
    if (field.primaryKey) continue;
    const optional = field.required ? "" : "?";
    lines.push(`  ${field.camelName}${optional}: ${TS_TYPE_MAP[field.type]};`);
  }
  for (const relation of model.relations) {
    if (relation.type === "belongsToMany") {
      lines.push(`  ${relation.camelName}: string[];`);
    }
  }
  if (model.timestamps) {
    lines.push(`  createdAt: Date;`);
    lines.push(`  updatedAt: Date;`);
  }
  lines.push(`}`);
  return lines.join("\n") + "\n";
}

module.exports = { generateMongooseModel };
