"use strict";

const { pluralize } = require("../../utils/strings");

/**
 * Normalized entity model -> Prisma schema string.
 * entity.json -> Entity Parser -> Normalized Entity Model -> (this) Database Generator
 */

const PRISMA_TYPE_MAP = {
  string: "String",
  text: "String",
  number: "Float",
  integer: "Int",
  float: "Float",
  boolean: "Boolean",
  date: "DateTime",
  datetime: "DateTime",
  uuid: "String",
  json: "Json",
  enum: null, // resolved to the generated enum name
  decimal: "Decimal",
  bigint: "BigInt",
};

function fieldEnumName(modelName, fieldName) {
  return `${modelName}${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
}

function buildPrismaField(model, field) {
  const parts = [field.name];
  const prismaType = field.type === "enum" ? fieldEnumName(model.pascalName, field.name) : PRISMA_TYPE_MAP[field.type];
  let typeStr = prismaType;
  // Primary keys are always non-optional in Prisma regardless of the entity.json 'required' flag.
  if (!field.primaryKey && (!field.required || field.nullable)) {
    typeStr += "?";
  }
  parts.push(typeStr);

  const attrs = [];
  if (field.primaryKey) {
    attrs.push("@id");
  }
  if (field.type === "uuid" && field.default === "uuid") {
    attrs.push("@default(uuid())");
  } else if (field.autoIncrement) {
    attrs.push("@default(autoincrement())");
  } else if ((field.type === "date" || field.type === "datetime") && field.default === "now") {
    attrs.push("@default(now())");
  } else if (field.default !== undefined && field.default !== null && field.default !== "uuid") {
    attrs.push(`@default(${formatDefault(field)})`);
  } else if (field.type === "datetime" && field.name.toLowerCase() === "createdat" && !field.default) {
    attrs.push("@default(now())");
  }
  if (field.unique) attrs.push("@unique");
  if (field.length && (field.type === "string" || field.type === "text")) {
    attrs.push(`@db.VarChar(${field.length})`);
  }

  if (attrs.length > 0) parts.push(attrs.join(" "));
  return parts.join(" ");
}

function formatDefault(field) {
  if (field.type === "boolean") return String(Boolean(field.default));
  if (["number", "integer", "float", "decimal", "bigint"].includes(field.type)) return String(field.default);
  if (field.type === "enum") return String(field.default);
  return JSON.stringify(field.default);
}

function buildEnums(model) {
  return model.fields
    .filter((f) => f.type === "enum")
    .map((f) => {
      const enumName = fieldEnumName(model.pascalName, f.name);
      const values = f.values.join("\n  ");
      return `enum ${enumName} {\n  ${values}\n}`;
    });
}

/**
 * Deterministic Prisma @relation name for the FK identified by (modelHoldingForeignKey, foreignKey).
 * Both the owning (belongsTo) side and the reverse (hasMany/hasOne/auto) side derive the same
 * string independently from these two inputs, so they always pair up — including self-relations
 * and multiple distinct relations between the same two models, which Prisma would otherwise
 * reject as ambiguous.
 */
function relationKey(modelHoldingForeignKey, foreignKey) {
  return `${modelHoldingForeignKey.pascalName}_${foreignKey}`;
}

/**
 * Builds a lookup of every hasMany/hasOne relation explicitly declared anywhere in the schema,
 * keyed by the (owner model holding the FK, foreignKey) pair it answers. Used so we never
 * auto-generate a reverse field that duplicates one the user already wrote by hand.
 */
function indexExplicitReverses(allModels) {
  const map = new Map();
  for (const declaringModel of allModels) {
    for (const relation of declaringModel.relations) {
      if (relation.type !== "hasMany" && relation.type !== "hasOne") continue;
      const owner = allModels.find((m) => m.name === relation.model);
      if (!owner || !relation.foreignKey) continue;
      map.set(relationKey(owner, relation.foreignKey), {
        declaringModelName: declaringModel.name,
        relationName: relation.name,
      });
    }
  }
  return map;
}

/**
 * Counts, per (owner model, target model) pair, how many auto-derived (non-explicit) belongsTo
 * relations need a reverse field — so that when there's more than one (e.g. Post.author and
 * Post.editor both pointing at User), every reverse field is disambiguated, not just the 2nd+.
 */
function countAutoReversePairs(allModels, explicitReverses) {
  const counts = new Map();
  for (const owner of allModels) {
    for (const relation of owner.relations) {
      if (relation.type !== "belongsTo") continue;
      const target = allModels.find((m) => m.name === relation.model);
      if (!target) continue;
      const key = relationKey(owner, relation.foreignKey);
      if (explicitReverses.has(key)) continue;
      const pairId = `${owner.name}->${target.name}`;
      counts.set(pairId, (counts.get(pairId) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Fields owned by `model` for its own declared relations (belongsTo/hasMany/hasOne/belongsToMany),
 * plus any auto-derived reverse array fields this model needs to receive because some other model
 * declared a belongsTo pointing at it without an explicit matching hasMany/hasOne.
 */
function buildRelationFields(model, allModels, explicitReverses, pairTotalCounts) {
  const lines = [];

  for (const relation of model.relations) {
    const target = allModels.find((m) => m.name === relation.model);
    if (!target) continue;

    if (relation.type === "belongsTo") {
      const key = relationKey(model, relation.foreignKey);
      // The relation field's optionality must mirror the FK scalar's — Prisma rejects a required
      // relation object backed by a nullable foreign key (and vice versa).
      const fkField = model.fields.find((f) => f.name === relation.foreignKey);
      const optional = !fkField || !fkField.required || fkField.nullable ? "?" : "";
      lines.push(
        `  ${relation.name} ${target.pascalName}${optional} @relation("${key}", fields: [${relation.foreignKey}], references: [${target.primaryKey.name}])`
      );
    } else if (relation.type === "hasMany") {
      const key = relationKey(target, relation.foreignKey);
      lines.push(`  ${relation.name} ${target.pascalName}[] @relation("${key}")`);
    } else if (relation.type === "hasOne") {
      const key = relationKey(target, relation.foreignKey);
      lines.push(`  ${relation.name} ${target.pascalName}? @relation("${key}")`);
    } else if (relation.type === "belongsToMany") {
      lines.push(`  ${relation.name} ${target.pascalName}[] @relation("${relation.through}")`);
    }
  }

  // Auto-derive the reverse side for every belongsTo (anywhere in the schema, including on this
  // model itself for self-relations) that points at `model` and has no explicit hasMany/hasOne.
  for (const owner of allModels) {
    for (const relation of owner.relations) {
      if (relation.type !== "belongsTo" || relation.model !== model.name) continue;

      const key = relationKey(owner, relation.foreignKey);
      if (explicitReverses.has(key)) continue; // user already declared this side by hand

      const pairId = `${owner.name}->${model.name}`;
      const base = pluralize(owner.camelName);
      const needsDisambiguation = (pairTotalCounts.get(pairId) || 0) > 1;
      const fieldName = needsDisambiguation ? `${base}As${relation.pascalName}` : base;

      lines.push(`  ${fieldName} ${owner.pascalName}[] @relation("${key}")`);
    }
  }

  return lines;
}

function generatePrismaSchema(entityModel, config) {
  const provider = "postgresql";
  const header = [
    `generator client {`,
    `  provider = "prisma-client-js"`,
    `}`,
    ``,
    `datasource db {`,
    `  provider = "${provider}"`,
    `  url      = env("DATABASE_URL")`,
    `}`,
  ].join("\n");

  const blocks = [];
  const enumBlocks = [];
  const explicitReverses = indexExplicitReverses(entityModel.models);
  const pairTotalCounts = countAutoReversePairs(entityModel.models, explicitReverses);

  for (const model of entityModel.models) {
    const lines = [`model ${model.pascalName} {`];
    for (const field of model.fields) {
      lines.push(`  ${buildPrismaField(model, field)}`);
    }
    const relationLines = buildRelationFields(model, entityModel.models, explicitReverses, pairTotalCounts);
    for (const line of relationLines) lines.push(line);

    if (model.timestamps) {
      lines.push(`  createdAt DateTime @default(now())`);
      lines.push(`  updatedAt DateTime @updatedAt`);
    }

    const indexedFields = model.fields.filter((f) => f.index && !f.unique && !f.primaryKey);
    for (const field of indexedFields) {
      lines.push(`\n  @@index([${field.name}])`);
    }

    lines.push(`\n  @@map("${model.tableName}")`);
    lines.push(`}`);
    blocks.push(lines.join("\n"));

    enumBlocks.push(...buildEnums(model));
  }

  return [header, ...enumBlocks, ...blocks].join("\n\n") + "\n";
}

module.exports = { generatePrismaSchema };
