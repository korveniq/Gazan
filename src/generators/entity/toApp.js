"use strict";

const { isEsm } = require("../syntax");
const { sharedDir } = require("../paths");
const { resolveImportPath } = require("../aliasResolver");
const { getSensitiveFields } = require("./sensitiveFields");

function serviceBody(model, config, sensitiveFields) {
  const orm = config.database.orm;
  const type = config.database.type;
  const isTs = config.language === "ts";
  const wrap = sensitiveFields.length > 0;

  const dataParam = isTs ? "data: Record<string, unknown>" : "data";
  const idParam = isTs ? "id: string" : "id";

  // Password/secret/hash-like fields are stripped from every response a generated CRUD service
  // returns, regardless of backend — see helpers/strip-sensitive-fields.
  const one = (expr) => (wrap ? `stripSensitiveFields(${expr}, SENSITIVE_FIELDS)` : expr);
  const many = (expr) => (wrap ? `stripSensitiveFieldsFromList(${expr}, SENSITIVE_FIELDS)` : expr);

  if (type === "postgresql" && orm === "prisma") {
    const ctor = isTs ? `constructor(private readonly db: PrismaClient = prisma) {}` : `constructor(db = prisma) {\n    this.db = db;\n  }`;
    // Data is already shaped by the Zod validator at the route boundary; the cast here just
    // bridges our generic service signature to Prisma's per-model input types.
    const createData = isTs ? `data: data as Prisma.${model.pascalName}CreateInput` : "data";
    const updateData = isTs ? `data: data as Prisma.${model.pascalName}UpdateInput` : "data";
    return `class ${model.pascalName}Service {
  ${ctor}

  async create(${dataParam}) {
    const record = await this.db.${model.camelName}.create({ ${createData} });
    return ${one("record")};
  }

  async findAll() {
    const records = await this.db.${model.camelName}.findMany();
    return ${many("records")};
  }

  async findById(${idParam}) {
    const record = await this.db.${model.camelName}.findUnique({ where: { ${model.primaryKey.camelName}: id } });
    return ${one("record")};
  }

  async update(${idParam}, ${dataParam}) {
    const record = await this.db.${model.camelName}.update({ where: { ${model.primaryKey.camelName}: id }, ${updateData} });
    return ${one("record")};
  }

  async delete(${idParam}) {
    return this.db.${model.camelName}.delete({ where: { ${model.primaryKey.camelName}: id } });
  }
}`;
  }

  if (type === "mongodb" && orm === "mongoose") {
    const ctor = isTs
      ? `constructor(private readonly model: Model<${model.pascalName}Document> = ${model.pascalName}) {}`
      : `constructor(model = ${model.pascalName}) {\n    this.model = model;\n  }`;
    return `class ${model.pascalName}Service {
  ${ctor}

  async create(${dataParam}) {
    const record = await this.model.create(data);
    return ${one("record")};
  }

  async findAll() {
    const records = await this.model.find();
    return ${many("records")};
  }

  async findById(${idParam}) {
    const record = await this.model.findById(id);
    return ${one("record")};
  }

  async update(${idParam}, ${dataParam}) {
    const record = await this.model.findByIdAndUpdate(id, data, { new: true });
    return ${one("record")};
  }

  async delete(${idParam}) {
    return this.model.findByIdAndDelete(id);
  }
}`;
  }

  if (type === "mongodb" && orm === "native") {
    // Mirrors the Mongoose _id strategy: the primary key is always Mongo's native `_id`, generated
    // as a UUID string here (the driver has no schema-level default, so we generate it ourselves).
    // The driver's default Collection<Document> types `_id` as ObjectId, so we type the collection
    // against a document shape with a string `_id` instead of casting at every call site.
    const collectionGeneric = isTs ? `<${model.pascalName}Doc>` : "";
    return `class ${model.pascalName}Service {
  collection() {
    return getDb().collection${collectionGeneric}("${model.tableName}");
  }

  async create(${dataParam}) {
    const doc = { _id: randomUUID(), ...data };
    await this.collection().insertOne(doc);
    return ${one("doc")};
  }

  async findAll() {
    const records = await this.collection().find().toArray();
    return ${many("records")};
  }

  async findById(${idParam}) {
    const record = await this.collection().findOne({ _id: id });
    return ${one("record")};
  }

  async update(${idParam}, ${dataParam}) {
    await this.collection().updateOne({ _id: id }, { $set: data });
    return this.findById(id);
  }

  async delete(${idParam}) {
    const result = await this.collection().deleteOne({ _id: id });
    return result.deletedCount > 0;
  }
}`;
  }

  // No database configured: in-memory store so entity.json can still be scaffolded end-to-end.
  const storeFields = isTs
    ? `private store = new Map<string, Record<string, unknown>>();\n  private seq = 1;`
    : `constructor() {\n    this.store = new Map();\n    this.seq = 1;\n  }`;

  return `class ${model.pascalName}Service {
  ${storeFields}

  async create(${dataParam}) {
    const id = String(this.seq++);
    const record = { id, ...data };
    this.store.set(id, record);
    return ${one("record")};
  }

  async findAll() {
    return ${many("Array.from(this.store.values())")};
  }

  async findById(${idParam}) {
    const record = this.store.get(id) || null;
    return ${one("record")};
  }

  async update(${idParam}, ${dataParam}) {
    const existing = this.store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data };
    this.store.set(id, updated);
    return ${one("updated")};
  }

  async delete(${idParam}) {
    return this.store.delete(id);
  }
}`;
}

function generateService(model, config, aliasConfig, dirs) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const type = config.database.type;
  const orm = config.database.orm;
  const fromDir = dirs.services;
  const r = (target) => resolveImportPath(config, aliasConfig, fromDir, target);

  const dbFile = `${sharedDir(config, "configs")}/db/index`;
  const dbPath = r(dbFile);

  const imports = [];
  if (type === "postgresql" && orm === "prisma") {
    imports.push(esm ? `import { prisma } from "${dbPath}";` : `const { prisma } = require("${dbPath}");`);
    if (isTs) imports.push(`import { PrismaClient, Prisma } from "@prisma/client";`);
  } else if (type === "mongodb" && orm === "mongoose") {
    const modelFile = `${sharedDir(config, "models")}/${model.kebabName}.model`;
    const modelPath = r(modelFile);
    const names = isTs ? `${model.pascalName}, ${model.pascalName}Document` : model.pascalName;
    imports.push(esm ? `import { ${names} } from "${modelPath}";` : `const { ${names} } = require("${modelPath}");`);
    if (isTs) imports.push(`import { Model } from "mongoose";`);
  } else if (type === "mongodb" && orm === "native") {
    imports.push(esm ? `import { getDb } from "${dbPath}";` : `const { getDb } = require("${dbPath}");`);
    imports.push(esm ? `import { randomUUID } from "node:crypto";` : `const { randomUUID } = require("node:crypto");`);
    if (isTs) imports.push(`\ninterface ${model.pascalName}Doc {\n  _id: string;\n  [key: string]: unknown;\n}`);
  }

  const sensitiveFields = getSensitiveFields(model);
  if (sensitiveFields.length > 0) {
    const helperPath = r(`${sharedDir(config, "helpers")}/strip-sensitive-fields`);
    imports.push(
      esm
        ? `import { stripSensitiveFields, stripSensitiveFieldsFromList } from "${helperPath}";`
        : `const { stripSensitiveFields, stripSensitiveFieldsFromList } = require("${helperPath}");`
    );
    imports.push(`const SENSITIVE_FIELDS = ${JSON.stringify(sensitiveFields)};`);
  }

  const body = serviceBody(model, config, sensitiveFields);
  const footer = esm ? `\n\nexport { ${model.pascalName}Service };` : `\n\nmodule.exports = ${model.pascalName}Service;`;

  return `${imports.join("\n")}${imports.length ? "\n\n" : ""}${body}${footer}\n`;
}

function generateController(model, config, aliasConfig, dirs) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const reqType = isTs ? `import { Request, Response, NextFunction } from "express";\n` : "";

  let serviceImport = "";
  if (isTs) {
    const servicePath = resolveImportPath(config, aliasConfig, dirs.controllers, `${dirs.services}/${model.kebabName}.service`);
    serviceImport = `import { ${model.pascalName}Service } from "${servicePath}";\n`;
  }

  const ctorParam = isTs ? `private readonly service: ${model.pascalName}Service` : "service";
  const handlerSig = isTs ? "async (req: Request, res: Response, next: NextFunction)" : "async (req, res, next)";
  const serviceRef = "this.service";

  const classKw = esm ? "export class" : "class";

  const ctorBody = isTs ? "" : `\n    this.service = service;`;

  return `${reqType}${serviceImport}${reqType || serviceImport ? "\n" : ""}${classKw} ${model.pascalName}Controller {
  constructor(${ctorParam}) {${ctorBody}
  }

  create = ${handlerSig} => {
    try {
      const item = await ${serviceRef}.create(req.body);
      return res.status(201).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  findAll = ${handlerSig} => {
    try {
      const items = await ${serviceRef}.findAll();
      return res.status(200).json({ success: true, data: items });
    } catch (error) {
      next(error);
    }
  };

  findOne = ${handlerSig} => {
    try {
      const item = await ${serviceRef}.findById(req.params.id);
      return res.status(200).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  update = ${handlerSig} => {
    try {
      const item = await ${serviceRef}.update(req.params.id, req.body);
      return res.status(200).json({ success: true, data: item });
    } catch (error) {
      next(error);
    }
  };

  remove = ${handlerSig} => {
    try {
      await ${serviceRef}.delete(req.params.id);
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
${esm ? "" : `\nmodule.exports = ${model.pascalName}Controller;\n`}`;
}

function generateRoutes(model, config, aliasConfig, dirs) {
  const esm = isEsm(config);
  const routesDir = dirs.routes;
  const r = (target) => resolveImportPath(config, aliasConfig, routesDir, target);

  const controllerPath = r(`${dirs.controllers}/${model.kebabName}.controller`);
  const servicePath = r(`${dirs.services}/${model.kebabName}.service`);
  const validatorPath = r(`${dirs.validators}/${model.kebabName}.validator`);
  const validatePath = r(`${sharedDir(config, "middlewares")}/validate`);

  const imports = esm
    ? [
        `import { Router } from "express";`,
        `import { validate } from "${validatePath}";`,
        `import { ${model.pascalName}Controller } from "${controllerPath}";`,
        `import { ${model.pascalName}Service } from "${servicePath}";`,
        `import { create${model.pascalName}Schema, update${model.pascalName}Schema } from "${validatorPath}";`,
      ]
    : [
        `const { Router } = require("express");`,
        `const { validate } = require("${validatePath}");`,
        `const ${model.pascalName}Controller = require("${controllerPath}");`,
        `const ${model.pascalName}Service = require("${servicePath}");`,
        `const { create${model.pascalName}Schema, update${model.pascalName}Schema } = require("${validatorPath}");`,
      ];

  const body = `const router = Router();

const service = new ${model.pascalName}Service();
const controller = new ${model.pascalName}Controller(service);

router.post("/", validate(create${model.pascalName}Schema), controller.create);
router.get("/", controller.findAll);
router.get("/:id", controller.findOne);
router.patch("/:id", validate(update${model.pascalName}Schema), controller.update);
router.delete("/:id", controller.remove);
`;

  const footer = esm ? "\nexport default router;\n" : "\nmodule.exports = router;\n";

  return `${imports.join("\n")}\n\n${body}${footer}`;
}

module.exports = { generateService, generateController, generateRoutes };
