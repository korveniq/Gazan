"use strict";

const path = require("path");
const { GeneratorEngine } = require("./engine");
const { baseDir, sharedDir, archDirs } = require("./paths");
const { buildAliasConfig } = require("../config/aliases");
const { resolveImportPath } = require("./aliasResolver");
const {
  buildModuleAliasPackageFragment,
  generateAliasLoaderFile,
  buildTsconfigAliasFragment,
  buildJsconfigJson,
} = require("./aliasRuntime");
const { generateAppFile, generateServerFile, generateRoutesIndex } = require("./project");
const { buildPackageJson, entryPath } = require("./packageJson");
const { buildTsconfig } = require("./tsconfig");
const { buildGitignore } = require("./gitignore");
const { buildReadme } = require("./readme");
const { generateErrorsFile } = require("./errors");
const { generateValidateEnvFile, generateEnvHelperFile, buildEnvFileContents } = require("./env");
const { generateShutdownFile, generateProcessEventsFile } = require("./shutdown");
const {
  generateNotFoundMiddleware,
  generateErrorHandlerMiddleware,
  generateValidateMiddleware,
  generateRateLimitMiddleware,
} = require("./middlewares");
const { generateBcryptHelper, generateJwtHelper, generateAuthMiddleware, generateOAuthStub } = require("./features/auth");
const { generateRedisConfig } = require("./features/redis");
const { generateSocketIndex } = require("./features/socket");
const { generateQueueFactory, generateExampleWorker, generateWorkersIndex } = require("./features/bullmq");
const { generateSchemaPrisma, generatePrismaDbConfig } = require("./database/prisma");
const { generateMongooseDbConfig } = require("./database/mongoose");
const { generateMongoNativeDbConfig } = require("./database/mongoNative");
const { generateMongooseModel } = require("./entity/toMongoose");
const { generateEntityValidator } = require("./entity/toZod");
const { generateService, generateController, generateRoutes } = require("./entity/toApp");
const { getSensitiveFields } = require("./entity/sensitiveFields");
const { generateStripSensitiveFieldsHelper } = require("./stripSensitiveFieldsHelper");

function ext(config) {
  return config.language === "ts" ? "ts" : "js";
}

function file(dir, name, config) {
  return path.join(dir, `${name}.${ext(config)}`);
}

/** Phase: base folder skeleton + app/server entrypoints. */
function generateProject(engine, config) {
  const base = baseDir(config);

  for (const dir of ["controllers", "routes", "services", "validators", "middlewares", "helpers", "utils", "configs"]) {
    if (config.architecture === "mvc" || !["controllers", "routes", "services", "validators"].includes(dir)) {
      engine.createDirectory(sharedDir(config, dir));
    }
  }
  if (config.architecture === "hmvc") {
    engine.createDirectory(`${base}/modules`);
  }

  engine.writeJson("package.json", buildPackageJson(config));
  engine.createFile(".gitignore", buildGitignore(config));

  if (config.language === "ts") {
    engine.writeJson("tsconfig.json", buildTsconfig(config));
  }
}

/** Phase: helpers/errors, helpers/env + utils/validate-env, process-events, shutdown. */
function generateEnvironment(engine, config, aliasConfig) {
  const helpersDir = sharedDir(config, "helpers");
  const utilsDir = sharedDir(config, "utils");

  engine.createFile(file(helpersDir, "errors", config), generateErrorsFile(config));

  engine.createFile(file(utilsDir, "validate-env", config), generateValidateEnvFile(config));
  engine.createFile(
    file(helpersDir, "env", config),
    generateEnvHelperFile(config, resolveImportPath(config, aliasConfig, helpersDir, `${utilsDir}/validate-env`))
  );

  engine.createFile(file(utilsDir, "shutdown", config), generateShutdownFile(config));
  engine.createFile(
    file(helpersDir, "process-events", config),
    generateProcessEventsFile(config, resolveImportPath(config, aliasConfig, helpersDir, `${utilsDir}/shutdown`))
  );

  engine.createFile(".env", buildEnvFileContents(config, { forExample: false }));
  engine.createFile(".env.example", buildEnvFileContents(config, { forExample: true }));
}

/** Phase: cors/helmet (wired into app.js directly) + rate-limit, error-handler, not-found, validate middlewares. */
function generateSecurity(engine, config, aliasConfig) {
  const dir = sharedDir(config, "middlewares");
  engine.createFile(file(dir, "not-found", config), generateNotFoundMiddleware(config, aliasConfig));
  engine.createFile(file(dir, "error-handler", config), generateErrorHandlerMiddleware(config, aliasConfig));
  engine.createFile(file(dir, "validate", config), generateValidateMiddleware(config, aliasConfig));
  engine.createFile(file(dir, "rate-limit", config), generateRateLimitMiddleware(config, aliasConfig));
}

/** Phase: database config + lifecycle (+ prisma schema from entity when applicable). */
function generateDatabase(engine, config, aliasConfig, entityModel) {
  if (config.database.type === "none") return;

  const dbDir = `${sharedDir(config, "configs")}/db`;

  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    engine.createFile(file(dbDir, "index", config), generatePrismaDbConfig(config));
    engine.createFile("prisma/schema.prisma", generateSchemaPrisma(config, entityModel));
    return;
  }

  if (config.database.type === "mongodb" && config.database.orm === "mongoose") {
    engine.createFile(file(dbDir, "index", config), generateMongooseDbConfig(config, aliasConfig));
    return;
  }

  if (config.database.type === "mongodb" && config.database.orm === "native") {
    engine.createFile(file(dbDir, "index", config), generateMongoNativeDbConfig(config, aliasConfig));
  }
}

/** Phase: shared Redis client. */
function generateRedis(engine, config, aliasConfig) {
  if (!config.redis) return;
  const dir = `${sharedDir(config, "configs")}/redis`;
  engine.createFile(file(dir, "index", config), generateRedisConfig(config, aliasConfig));
}

/** Phase: Socket.IO server, kept separate from Express app + HTTP server. */
function generateSocket(engine, config, aliasConfig) {
  if (!config.socketIO) return;
  const dir = sharedDir(config, "socket");
  engine.createFile(file(dir, "index", config), generateSocketIndex(config, aliasConfig));
}

/** Phase: BullMQ queue/worker split, built on the shared Redis connection. */
function generateBullMQ(engine, config, aliasConfig) {
  if (!config.bullMQ) return;
  const dir = sharedDir(config, "workers");
  engine.createFile(file(dir, "queue", config), generateQueueFactory(config, aliasConfig));
  engine.createFile(file(dir, "example.worker", config), generateExampleWorker(config, aliasConfig));
  engine.createFile(file(dir, "index", config), generateWorkersIndex(config, aliasConfig));
}

/** Phase: bcrypt/jwt helpers + auth middleware, only for the selected methods. */
function generateAuth(engine, config, aliasConfig) {
  if (!config.authentication.enabled) return;
  const { methods } = config.authentication;
  const helpersDir = sharedDir(config, "helpers");

  if (methods.includes("email-password")) {
    engine.createFile(file(helpersDir, "bcrypt", config), generateBcryptHelper(config));
  }
  if (methods.includes("jwt") || methods.includes("refresh-token")) {
    engine.createFile(file(helpersDir, "jwt", config), generateJwtHelper(config, aliasConfig));
    engine.createFile(file(sharedDir(config, "middlewares"), "auth", config), generateAuthMiddleware(config, aliasConfig));
  }
  if (methods.includes("oauth")) {
    engine.createFile(file(helpersDir, "oauth.stub", config), generateOAuthStub(config));
  }

  if (config.language === "ts") {
    const usesJwt = methods.includes("jwt") || methods.includes("refresh-token");
    const userType = usesJwt ? "string | JwtPayload" : "Record<string, unknown>";
    const jwtImport = usesJwt ? `import { JwtPayload } from "jsonwebtoken";\n` : "";
    engine.createFile(
      `${baseDir(config)}/types/express.d.ts`,
      `import "express";\n${jwtImport}\ndeclare module "express-serve-static-core" {\n  interface Request {\n    user?: ${userType};\n  }\n}\n`
    );
  }
}

/** Phase: entity.json -> controllers/services/routes/validators (+ mongoose models). Skipped entirely without entity.json. */
function generateEntityModels(engine, config, aliasConfig, entityModel) {
  const base = baseDir(config);
  const models = entityModel ? entityModel.models : [];

  if (config.database.type === "mongodb" && config.database.orm === "mongoose") {
    const modelsDir = sharedDir(config, "models");
    for (const model of models) {
      engine.createFile(
        file(modelsDir, `${model.kebabName}.model`, config),
        generateMongooseModel(model, models, config)
      );
    }
  }

  const anySensitiveFields = models.some((m) => m.crud !== false && getSensitiveFields(m).length > 0);
  if (anySensitiveFields) {
    engine.createFile(
      file(sharedDir(config, "helpers"), "strip-sensitive-fields", config),
      generateStripSensitiveFieldsHelper(config)
    );
  }

  for (const model of models) {
    if (model.crud === false) continue;
    const dirs = archDirs(config, model.camelName);

    engine.createFile(file(dirs.validators, `${model.kebabName}.validator`, config), generateEntityValidator(model, config));
    engine.createFile(file(dirs.services, `${model.kebabName}.service`, config), generateService(model, config, aliasConfig, dirs));
    engine.createFile(
      file(dirs.controllers, `${model.kebabName}.controller`, config),
      generateController(model, config, aliasConfig, dirs)
    );
    engine.createFile(file(dirs.routes, `${model.kebabName}.routes`, config), generateRoutes(model, config, aliasConfig, dirs));
  }

  const routableModels = models.filter((m) => m.crud !== false);
  engine.createFile(file(sharedDir(config, "routes"), "index", config), generateRoutesIndex(config, aliasConfig, routableModels));
  engine.createFile(file(base, "app", config), generateAppFile(config, aliasConfig));
  engine.createFile(file(base, "server", config), generateServerFile(config, aliasConfig));
}

/**
 * Phase: alias runtime support — only runs when aliases are enabled. Merges tsconfig `paths` (TS)
 * or generates jsconfig.json (JS, editor-only) from the SAME aliasConfig every other phase used,
 * plus whatever makes the aliases actually resolve at runtime for the selected module system:
 * tsc-alias (TS build), module-alias (CJS+JS), or a generated ESM loader (MJS+JS).
 */
function generateAliasRuntime(engine, config, aliasConfig) {
  if (!aliasConfig.enabled) return;

  if (config.language === "ts") {
    const { baseUrl, paths } = buildTsconfigAliasFragment(aliasConfig);
    engine.mergeJson("tsconfig.json", { compilerOptions: { baseUrl, paths } });
    engine.updatePackageJson({
      devDependencies: { "tsc-alias": "^1.8.10" },
      scripts: { build: "tsc && tsc-alias" },
    });
    return;
  }

  // JS: jsconfig.json is editor-only DX (VS Code path-alias intellisense) — it has no effect on
  // how the project actually runs; module-alias / the generated loader below handle that.
  engine.writeJson("jsconfig.json", buildJsconfigJson(aliasConfig));

  const entry = entryPath(config);
  if (config.moduleSystem === "mjs") {
    engine.createFile("alias-loader.mjs", generateAliasLoaderFile(aliasConfig));
    engine.updatePackageJson({
      scripts: {
        dev: `node --watch --experimental-loader=./alias-loader.mjs ${entry}`,
        start: `node --experimental-loader=./alias-loader.mjs ${entry}`,
      },
    });
  } else {
    engine.updatePackageJson({
      dependencies: { "module-alias": "^2.2.3" },
      ...buildModuleAliasPackageFragment(aliasConfig),
    });
  }
}

function generateReadmeFile(engine, config, aliasConfig, entityModel) {
  engine.createFile("README.md", buildReadme(config, aliasConfig, entityModel));
}

function generate(targetDir, config, entityModel) {
  const engine = new GeneratorEngine(targetDir);

  // Computed once, up front — every phase below reads this same object, and nothing is written
  // yet if it throws (an HMVC module alias colliding with a reserved name), keeping the atomic
  // generate-then-copy guarantee intact.
  const aliasConfig = buildAliasConfig(config, entityModel);

  const steps = [
    ["Project structure created", () => generateProject(engine, config)],
    ["Environment & error handling configured", () => generateEnvironment(engine, config, aliasConfig)],
    ["Security middleware configured", () => generateSecurity(engine, config, aliasConfig)],
    ["Database configured", () => generateDatabase(engine, config, aliasConfig, entityModel)],
    ["Redis configured", () => generateRedis(engine, config, aliasConfig)],
    ["BullMQ configured", () => generateBullMQ(engine, config, aliasConfig)],
    ["Socket.IO configured", () => generateSocket(engine, config, aliasConfig)],
    ["Authentication configured", () => generateAuth(engine, config, aliasConfig)],
    ["Entity models generated", () => generateEntityModels(engine, config, aliasConfig, entityModel)],
    ["Module aliases configured", () => generateAliasRuntime(engine, config, aliasConfig)],
    ["README generated", () => generateReadmeFile(engine, config, aliasConfig, entityModel)],
  ];

  const results = [];
  for (const [label, fn] of steps) {
    fn();
    results.push(label);
  }

  const warnings = [];
  if (config.authentication.enabled && config.authentication.methods.includes("oauth")) {
    warnings.push(
      "OAuth is scaffolded as a stub only (env vars + helpers/oauth.stub — no provider is wired up). See that file and the README's Authentication section before relying on it."
    );
  }
  if (aliasConfig.enabled && config.language === "js" && config.moduleSystem === "mjs") {
    warnings.push(
      "Module aliases on JS+MJS use a custom --experimental-loader — Node will print a one-line ExperimentalWarning on startup. This is expected; see the README's Import Aliases section."
    );
  }

  return { engine, results, warnings };
}

module.exports = {
  generate,
  generateProject,
  generateEnvironment,
  generateSecurity,
  generateDatabase,
  generateRedis,
  generateSocket,
  generateBullMQ,
  generateAuth,
  generateEntityModels,
  generateAliasRuntime,
  generateReadmeFile,
};
