"use strict";

const fs = require("fs-extra");
const path = require("path");
const { EntityFileSchema, FIELD_TYPES } = require("./schema");
const { EntityValidationError } = require("./errors");
const { toPascalCase, toCamelCase, toKebabCase, toSnakeCase, pluralize, didYouMean } = require("../../utils/strings");

// Words that collide with JS/class semantics regardless of the selected database.
const JS_RESERVED_WORDS = new Set([
  "class",
  "constructor",
  "prototype",
  "__proto__",
  "function",
  "return",
  "new",
  "delete",
  "typeof",
  "instanceof",
  "this",
  "super",
  "extends",
  "import",
  "export",
  "default",
]);

// Prisma schema block keywords — using one as a model name breaks `model X { ... }` parsing.
const PRISMA_RESERVED_MODEL_WORDS = new Set(["datasource", "generator", "model", "enum", "type", "view"]);

// Fields that collide with Mongoose's own Document machinery if used as a schema field name.
const MONGO_RESERVED_FIELD_WORDS = new Set([
  "_id",
  "__v",
  "id",
  "save",
  "validate",
  "remove",
  "populate",
  "depopulate",
  "toobject",
  "tojson",
  "schema",
  "collection",
  "model",
  "db",
  "errors",
  "isnew",
  "prototype",
  "constructor",
]);

const NUMERIC_TYPES = new Set(["number", "integer", "float", "decimal", "bigint"]);

/**
 * Reads and validates entity.json from disk.
 * Throws EntityValidationError with detailed, field-level messages.
 *
 * @param {string} entityPath
 * @param {{ databaseType?: "postgresql" | "mongodb" | "none" }} [context]
 */
function readEntityFile(entityPath, context = {}) {
  const absolute = path.resolve(entityPath);

  if (!fs.existsSync(absolute)) {
    throw new EntityValidationError(`entity.json not found`, [
      { path: "file", message: `No file exists at: ${absolute}` },
    ]);
  }

  const raw = fs.readFileSync(absolute, "utf8");

  let json;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new EntityValidationError(`entity.json is not valid JSON`, [
      { path: "file", message: error.message },
    ]);
  }

  return parseEntityJson(json, context);
}

/**
 * Validates a raw parsed entity.json object against the schema and
 * semantic rules, then returns the normalized internal entity model.
 *
 * @param {unknown} json
 * @param {{ databaseType?: "postgresql" | "mongodb" | "none" }} [context]
 */
function parseEntityJson(json, context = {}) {
  const result = EntityFileSchema.safeParse(json);

  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: formatIssuePath(issue.path),
      message: issue.message,
    }));
    throw new EntityValidationError("entity.json failed schema validation", issues);
  }

  const semanticIssues = runSemanticValidation(result.data, context);
  if (semanticIssues.length > 0) {
    throw new EntityValidationError("entity.json failed semantic validation", semanticIssues);
  }

  return normalizeEntityModel(result.data);
}

function formatIssuePath(pathParts) {
  let out = "";
  for (const part of pathParts) {
    if (typeof part === "number") {
      out += `[${part}]`;
    } else if (out.length === 0) {
      out = String(part);
    } else {
      out += `.${part}`;
    }
  }
  return out;
}

function runSemanticValidation(data, context) {
  const issues = [];
  const modelNames = data.models.map((m) => m.name);
  const modelNameSet = new Set(modelNames);
  const seenNames = new Set();
  const databaseType = context.databaseType;

  data.models.forEach((model, mi) => {
    validateModelIdentity(model, mi, seenNames, databaseType, issues);
    validatePrimaryKeys(model, mi, databaseType, issues);
    validateFields(model, mi, databaseType, issues);
    validateRelations(model, mi, data.models, modelNames, modelNameSet, issues);
  });

  validateManyToManyPairing(data.models, issues);

  return issues;
}

function validateModelIdentity(model, mi, seenNames, databaseType, issues) {
  if (seenNames.has(model.name)) {
    issues.push({ path: `models[${mi}].name`, message: `duplicate model name '${model.name}'` });
  }
  seenNames.add(model.name);

  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(model.name)) {
    issues.push({
      path: `models[${mi}].name`,
      message: `model name must be a valid identifier (letters/digits, starting with a letter): '${model.name}'`,
    });
  }
  if (JS_RESERVED_WORDS.has(model.name.toLowerCase())) {
    issues.push({ path: `models[${mi}].name`, message: `'${model.name}' is a reserved word and cannot be used as a model name` });
  }
  if (databaseType === "postgresql" && PRISMA_RESERVED_MODEL_WORDS.has(model.name.toLowerCase())) {
    issues.push({
      path: `models[${mi}].name`,
      message: `'${model.name}' is a reserved Prisma schema keyword and cannot be used as a model name`,
    });
  }
}

function validatePrimaryKeys(model, mi, databaseType, issues) {
  const primaryKeys = Object.entries(model.fields).filter(([, f]) => f.primaryKey);
  if (primaryKeys.length > 1) {
    issues.push({
      path: `models[${mi}].fields`,
      message: `model '${model.name}' declares more than one primaryKey field`,
    });
  }
  for (const [fieldName, field] of primaryKeys) {
    if (field.nullable) {
      issues.push({
        path: `models[${mi}].fields.${fieldName}.nullable`,
        message: `primary key field '${fieldName}' cannot be nullable`,
      });
    }

    if (databaseType === "mongodb") {
      // MongoDB primary keys are always represented as the native `_id`. Only 'uuid' can be
      // mapped onto it (as a String _id with a generated default); anything else — most
      // importantly autoIncrement, which Mongo has no native equivalent for — would silently
      // produce different semantics than requested, so we reject it instead.
      if (field.autoIncrement) {
        issues.push({
          path: `models[${mi}].fields.${fieldName}.autoIncrement`,
          message: `autoIncrement is not supported for MongoDB — it has no native auto-increment primary key`,
        });
      } else if (field.type !== "uuid") {
        issues.push({
          path: `models[${mi}].fields.${fieldName}.type`,
          message: `MongoDB primary keys must be type 'uuid' (mapped to a String _id) or omitted entirely (falls back to ObjectId _id) — type '${field.type}' is not supported`,
        });
      }
    }
  }
}

function validateFields(model, mi, databaseType, issues) {
  const fieldNames = new Set(Object.keys(model.fields));

  for (const [fieldName, field] of Object.entries(model.fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(fieldName)) {
      issues.push({
        path: `models[${mi}].fields.${fieldName}`,
        message: `field name must be a valid identifier: '${fieldName}'`,
      });
    }
    if (JS_RESERVED_WORDS.has(fieldName.toLowerCase())) {
      issues.push({
        path: `models[${mi}].fields.${fieldName}`,
        message: `'${fieldName}' is a reserved word and cannot be used as a field name`,
      });
    }
    if (databaseType === "mongodb" && MONGO_RESERVED_FIELD_WORDS.has(fieldName.toLowerCase()) && fieldName.toLowerCase() !== "id") {
      issues.push({
        path: `models[${mi}].fields.${fieldName}`,
        message: `'${fieldName}' collides with a built-in Mongoose Document property and cannot be used as a field name`,
      });
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      issues.push({
        path: `models[${mi}].fields.${fieldName}`,
        message: `min (${field.min}) cannot be greater than max (${field.max})`,
      });
    }
    if (field.required && field.nullable) {
      issues.push({
        path: `models[${mi}].fields.${fieldName}`,
        message: `field cannot be both 'required: true' and 'nullable: true' — required implies non-null`,
      });
    }

    validateFieldDefault(model, mi, fieldName, field, issues);
  }

  // Relation names must not collide with a real field of the same name — both become
  // properties on the generated model/service and would otherwise silently shadow each other.
  for (const relationName of Object.keys(model.relations)) {
    if (fieldNames.has(relationName)) {
      issues.push({
        path: `models[${mi}].relations.${relationName}`,
        message: `relation name '${relationName}' collides with a field of the same name on model '${model.name}'`,
      });
    }
  }
}

function validateFieldDefault(model, mi, fieldName, field, issues) {
  if (field.default === undefined || field.default === null) return;
  const path_ = `models[${mi}].fields.${fieldName}.default`;

  if (field.type === "enum") {
    if (Array.isArray(field.values) && !field.values.includes(field.default)) {
      issues.push({ path: path_, message: `default '${field.default}' is not one of the declared enum values [${field.values.join(", ")}]` });
    }
    return;
  }

  if (field.type === "uuid" && field.default === "uuid") return; // sentinel meaning "generate one"
  if ((field.type === "date" || field.type === "datetime") && field.default === "now") return; // sentinel

  if (field.type === "boolean" && typeof field.default !== "boolean") {
    issues.push({ path: path_, message: `default must be a boolean for type 'boolean', got ${JSON.stringify(field.default)}` });
  } else if (NUMERIC_TYPES.has(field.type) && typeof field.default !== "number") {
    issues.push({ path: path_, message: `default must be a number for type '${field.type}', got ${JSON.stringify(field.default)}` });
  } else if (["string", "text", "uuid"].includes(field.type) && typeof field.default !== "string") {
    issues.push({ path: path_, message: `default must be a string for type '${field.type}', got ${JSON.stringify(field.default)}` });
  }
}

function validateRelations(model, mi, allModels, modelNames, modelNameSet, issues) {
  for (const [relationName, relation] of Object.entries(model.relations)) {
    if (!modelNameSet.has(relation.model)) {
      const suggestion = didYouMean(relation.model, modelNames);
      issues.push({
        path: `models[${mi}].relations.${relationName}.model`,
        message: suggestion
          ? `unknown model '${relation.model}'. Did you mean '${suggestion}'?`
          : `unknown model '${relation.model}'`,
      });
      continue;
    }

    const target = allModels.find((m) => m.name === relation.model);

    if (relation.type === "belongsTo" && relation.foreignKey) {
      const fkField = model.fields[relation.foreignKey];
      if (!fkField) {
        issues.push({
          path: `models[${mi}].relations.${relationName}.foreignKey`,
          message: `foreignKey '${relation.foreignKey}' does not exist on model '${model.name}'`,
        });
      } else {
        const targetPk = Object.entries(target.fields).find(([, f]) => f.primaryKey);
        if (targetPk && targetPk[1].type !== fkField.type) {
          issues.push({
            path: `models[${mi}].relations.${relationName}.foreignKey`,
            message: `foreignKey '${relation.foreignKey}' has type '${fkField.type}' but '${relation.model}.${targetPk[0]}' (its primary key) has type '${targetPk[1].type}'`,
          });
        }
      }
    }

    if ((relation.type === "hasMany" || relation.type === "hasOne") && relation.foreignKey) {
      if (!target.fields[relation.foreignKey]) {
        issues.push({
          path: `models[${mi}].relations.${relationName}.foreignKey`,
          message: `foreignKey '${relation.foreignKey}' does not exist on related model '${relation.model}'`,
        });
      }
    }
  }
}

/**
 * Prisma's implicit many-to-many requires both sides to declare the array relation with a
 * matching join name. A one-sided belongsToMany silently breaks `prisma generate`, so we
 * reject it here instead of letting an invalid schema reach the database generator.
 */
function validateManyToManyPairing(models, issues) {
  models.forEach((model, mi) => {
    for (const [relationName, relation] of Object.entries(model.relations)) {
      if (relation.type !== "belongsToMany") continue;
      const target = models.find((m) => m.name === relation.model);
      if (!target) continue; // already reported as an unknown-model error

      const reciprocal = Object.entries(target.relations).find(
        ([, r]) => r.type === "belongsToMany" && r.model === model.name
      );

      if (!reciprocal) {
        issues.push({
          path: `models[${mi}].relations.${relationName}`,
          message: `many-to-many relation '${relationName}' has no matching belongsToMany declared on '${relation.model}' back to '${model.name}'`,
        });
        continue;
      }

      const [reciprocalName, reciprocalRelation] = reciprocal;
      if (relation.through !== reciprocalRelation.through) {
        issues.push({
          path: `models[${mi}].relations.${relationName}.through`,
          message: `through '${relation.through}' does not match '${relation.model}.relations.${reciprocalName}.through' ('${reciprocalRelation.through}') — both sides of a many-to-many must agree`,
        });
      }
    }
  });
}

function normalizeEntityModel(data) {
  const models = data.models.map((model) => normalizeModel(model));
  return { models };
}

function normalizeModel(model) {
  const pascalName = toPascalCase(model.name);
  const camelName = toCamelCase(model.name);
  const kebabName = toKebabCase(model.name);
  const snakeName = toSnakeCase(model.name);
  const tableName = model.tableName || pluralize(snakeName);
  const routePath = pluralize(kebabName);

  const fields = Object.entries(model.fields).map(([name, field]) => ({
    name,
    camelName: toCamelCase(name),
    ...field,
  }));

  let primaryKey = fields.find((f) => f.primaryKey) || null;
  if (!primaryKey) {
    primaryKey = {
      name: "id",
      camelName: "id",
      type: "uuid",
      required: true,
      nullable: false,
      unique: false,
      index: false,
      default: "uuid",
      primaryKey: true,
      autoIncrement: false,
      synthetic: true,
    };
    fields.unshift(primaryKey);
  }

  const relations = Object.entries(model.relations).map(([name, relation]) => ({
    name,
    camelName: toCamelCase(name),
    pascalName: toPascalCase(name),
    ...relation,
  }));

  return {
    name: model.name,
    pascalName,
    camelName,
    kebabName,
    snakeName,
    tableName,
    routePath,
    timestamps: model.timestamps,
    crud: model.crud,
    primaryKey,
    fields,
    relations,
  };
}

module.exports = { readEntityFile, parseEntityJson, FIELD_TYPES };
