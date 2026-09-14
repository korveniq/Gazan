#!/usr/bin/env node
"use strict";

/**
 * End-to-end GAZAN generator tests. For each configuration in the matrix
 * below: generate into a scratch dir, sanity-check the entity parser (where
 * applicable), syntax-check every generated file, npm install, and — for
 * TypeScript projects — compile.
 *
 * This intentionally shells out to npm/tsc/prisma rather than mocking them:
 * the goal is to prove generated projects are actually usable, not just that
 * GAZAN produced *some* files.
 */

const path = require("path");
const fs = require("fs-extra");
const { execSync } = require("child_process");
const { generate } = require("../src/generators");
const { normalizeConfig } = require("../src/config/normalize");
const { readEntityFile } = require("../src/parser/entity/parse");
const { EntityValidationError } = require("../src/parser/entity/errors");
const { parseEntityJson } = require("../src/parser/entity/parse");

const SCRATCH = path.join(__dirname, "..", ".test-scratch");
const ENTITY_SAMPLE = path.join(__dirname, "fixtures", "entity.sample.json");
const ENTITY_RELATIONS = path.join(__dirname, "fixtures", "entity.relations.json");
const ENTITY_AUTH = path.join(__dirname, "fixtures", "entity.auth.json");
const ENTITY_REALISTIC = path.join(__dirname, "fixtures", "entity.realistic.json");

const BASE_ANSWERS = {
  moduleSystem: "cjs",
  language: "js",
  database: { type: "none" },
  architecture: "mvc",
  useSrc: true,
  socketIO: false,
  bullMQ: false,
  rateLimitStrategy: "memory",
  authentication: { enabled: false, methods: [] },
  entityFile: null,
};

const CASES = [
  {
    name: "1-js-cjs-mvc-postgres-prisma-src",
    answers: {
      projectName: "case1",
      moduleSystem: "cjs",
      language: "js",
      database: { type: "postgresql", orm: "prisma" },
      architecture: "mvc",
      useSrc: true,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: null,
    },
  },
  {
    name: "2-ts-mjs-mvc-postgres-prisma-src-redis-bullmq-socket-auth",
    answers: {
      projectName: "case2",
      moduleSystem: "mjs",
      language: "ts",
      database: { type: "postgresql", orm: "prisma" },
      architecture: "mvc",
      useSrc: true,
      socketIO: true,
      bullMQ: true,
      authentication: { enabled: true, methods: ["email-password", "jwt", "refresh-token"] },
      entityFile: ENTITY_SAMPLE,
    },
  },
  {
    name: "3-ts-mjs-hmvc-mongodb-mongoose",
    answers: {
      projectName: "case3",
      moduleSystem: "mjs",
      language: "ts",
      database: { type: "mongodb", orm: "mongoose" },
      architecture: "hmvc",
      useSrc: true,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: ENTITY_SAMPLE,
    },
  },
  {
    name: "4-js-cjs-mvc-nodb-noredis-nosocket-nobullmq",
    answers: {
      projectName: "case4",
      moduleSystem: "cjs",
      language: "js",
      database: { type: "none" },
      architecture: "mvc",
      useSrc: false,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: null,
    },
  },
  {
    name: "5-postgres-real-entity",
    answers: {
      projectName: "case5",
      moduleSystem: "cjs",
      language: "js",
      database: { type: "postgresql", orm: "prisma" },
      architecture: "mvc",
      useSrc: true,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: ENTITY_SAMPLE,
    },
  },
  // Extra coverage beyond the mandatory 5, matching section 42's matrix.
  {
    name: "6-js-mjs-mvc-src",
    answers: {
      projectName: "case6",
      moduleSystem: "mjs",
      language: "js",
      database: { type: "none" },
      architecture: "mvc",
      useSrc: true,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: null,
    },
  },
  {
    name: "7-ts-cjs-mvc-mongo-native",
    answers: {
      projectName: "case7",
      moduleSystem: "cjs",
      language: "ts",
      database: { type: "mongodb", orm: "native" },
      architecture: "mvc",
      useSrc: true,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: ENTITY_SAMPLE,
    },
  },
  {
    name: "8-hmvc-no-src",
    answers: {
      projectName: "case8",
      moduleSystem: "cjs",
      language: "js",
      database: { type: "postgresql", orm: "prisma" },
      architecture: "hmvc",
      useSrc: false,
      socketIO: false,
      bullMQ: false,
      authentication: { enabled: false, methods: [] },
      entityFile: ENTITY_SAMPLE,
    },
  },
  // --- Additional coverage: relation edge cases, sensitive fields, auth methods in isolation,
  // redis-without-bullmq, socket-only, and one large realistic multi-entity schema. ---
  {
    name: "9-prisma-relation-edge-cases",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case9",
      database: { type: "postgresql", orm: "prisma" },
      entityFile: ENTITY_RELATIONS, // self-relation, dual FK to same model, many-to-many
    },
  },
  {
    name: "10-prisma-sensitive-fields-ts",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case10",
      language: "ts",
      database: { type: "postgresql", orm: "prisma" },
      entityFile: ENTITY_AUTH, // has a 'password' field — must not leak in responses
    },
    extraChecks(dir) {
      const service = fs.readFileSync(path.join(dir, "src/services/user.service.ts"), "utf8");
      if (!service.includes("stripSensitiveFields(record, SENSITIVE_FIELDS)")) {
        throw new Error("sensitive-field stripping not wired into the generated service");
      }
      if (!fs.existsSync(path.join(dir, "src/helpers/strip-sensitive-fields.ts"))) {
        throw new Error("strip-sensitive-fields helper was not generated");
      }
    },
  },
  {
    name: "11-auth-jwt-only",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case11",
      language: "ts",
      authentication: { enabled: true, methods: ["jwt"] },
    },
    extraChecks(dir) {
      fileMustExist(dir, "src/helpers/jwt.ts");
      fileMustExist(dir, "src/middlewares/auth.ts");
      if (fs.existsSync(path.join(dir, "src/helpers/bcrypt.ts"))) {
        throw new Error("bcrypt helper should not be generated without email-password auth");
      }
    },
  },
  {
    name: "12-auth-email-password-only",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case12",
      authentication: { enabled: true, methods: ["email-password"] },
    },
    extraChecks(dir) {
      fileMustExist(dir, "src/helpers/bcrypt.js");
      if (fs.existsSync(path.join(dir, "src/helpers/jwt.js"))) {
        throw new Error("jwt helper should not be generated without jwt/refresh-token auth");
      }
      if (fs.existsSync(path.join(dir, "src/middlewares/auth.js"))) {
        throw new Error("auth middleware should not be generated without jwt/refresh-token auth");
      }
      const pkg = fs.readJsonSync(path.join(dir, "package.json"));
      if (pkg.dependencies.jsonwebtoken) throw new Error("jsonwebtoken dependency present without jwt/refresh-token auth");
    },
  },
  {
    name: "13-auth-refresh-token-only",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case13",
      language: "ts",
      authentication: { enabled: true, methods: ["refresh-token"] },
    },
    extraChecks(dir) {
      const jwt = fs.readFileSync(path.join(dir, "src/helpers/jwt.ts"), "utf8");
      if (!jwt.includes("signRefreshToken") || !jwt.includes("verifyRefreshToken")) {
        throw new Error("refresh token functions missing from jwt helper");
      }
    },
  },
  {
    name: "14-auth-oauth-stub",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case14",
      authentication: { enabled: true, methods: ["oauth"] },
    },
    extraChecks(dir) {
      fileMustExist(dir, "src/helpers/oauth.stub.js");
      if (fs.existsSync(path.join(dir, "src/helpers/jwt.js"))) {
        throw new Error("jwt helper should not be generated for oauth-only auth");
      }
      if (fs.existsSync(path.join(dir, "src/helpers/bcrypt.js"))) {
        throw new Error("bcrypt helper should not be generated for oauth-only auth");
      }
      const pkg = fs.readJsonSync(path.join(dir, "package.json"));
      if (pkg.dependencies.passport) throw new Error("no OAuth library should be installed for the stub");
    },
  },
  {
    name: "15-redis-rate-limit-without-bullmq",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case15",
      rateLimitStrategy: "redis",
    },
    extraChecks(dir) {
      fileMustExist(dir, "src/configs/redis/index.js");
      if (fs.existsSync(path.join(dir, "src/workers"))) {
        throw new Error("workers/ should not exist when bullMQ is disabled");
      }
      const rateLimit = fs.readFileSync(path.join(dir, "src/middlewares/rate-limit.js"), "utf8");
      if (!rateLimit.includes("RedisStore")) {
        throw new Error("rate-limit middleware should use RedisStore when rateLimitStrategy is redis");
      }
      const pkg = fs.readJsonSync(path.join(dir, "package.json"));
      if (pkg.dependencies.bullmq) throw new Error("bullmq dependency present without bullMQ enabled");
    },
  },
  {
    name: "16-socket-only",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case16",
      socketIO: true,
    },
    extraChecks(dir) {
      fileMustExist(dir, "src/socket/index.js");
      const server = fs.readFileSync(path.join(dir, "src/server.js"), "utf8");
      if (!server.includes("createSocketServer")) {
        throw new Error("server.js should wire up Socket.IO when socketIO is enabled");
      }
      const pkg = fs.readJsonSync(path.join(dir, "package.json"));
      if (!pkg.dependencies["socket.io"]) throw new Error("socket.io dependency missing");
      if (pkg.dependencies.bullmq) throw new Error("bullmq dependency present without bullMQ enabled");
      if (pkg.dependencies.ioredis) throw new Error("ioredis dependency present without redis needed");
    },
  },
  {
    name: "17-mongoose-realistic-schema",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case17",
      language: "ts",
      moduleSystem: "mjs",
      database: { type: "mongodb", orm: "mongoose" },
      architecture: "hmvc",
      entityFile: ENTITY_REALISTIC,
    },
  },
  {
    name: "18-prisma-realistic-schema",
    answers: {
      ...BASE_ANSWERS,
      projectName: "case18",
      database: { type: "postgresql", orm: "prisma" },
      entityFile: ENTITY_REALISTIC,
    },
  },
];

function sh(cmd, cwd) {
  return execSync(cmd, { cwd, stdio: "pipe" }).toString();
}

function syntaxCheckAll(dir, ext) {
  const files = [];
  walk(dir, files, ext);
  for (const f of files) {
    execSync(`node -c ${JSON.stringify(f)}`, { stdio: "pipe" });
  }
  return files.length;
}

function walk(dir, out, ext) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out, ext);
    else if (entry.name.endsWith(`.${ext}`)) out.push(full);
  }
}

function fileMustExist(dir, rel) {
  if (!fs.existsSync(path.join(dir, rel))) {
    throw new Error(`expected file missing: ${rel}`);
  }
}

async function runCase(testCase) {
  const dir = path.join(SCRATCH, testCase.name);
  fs.removeSync(dir);
  fs.ensureDirSync(dir);

  const answers = { ...testCase.answers, targetDir: dir };
  const config = normalizeConfig(answers);

  let entityModel = null;
  if (config.entityFile) {
    entityModel = readEntityFile(config.entityFile, { databaseType: config.database.type });
  }

  generate(dir, config, entityModel);

  fileMustExist(dir, "package.json");
  const pkg = fs.readJsonSync(path.join(dir, "package.json"));
  if (!pkg.name) throw new Error("package.json missing name");

  if (testCase.extraChecks) {
    testCase.extraChecks(dir, config);
  }

  if (config.language === "js") {
    const count = syntaxCheckAll(dir, "js");
    if (count === 0) throw new Error("no .js files generated");
  }

  sh("npm install --no-audit --no-fund --silent", dir);

  if (config.language === "ts") {
    sh("npx tsc --noEmit", dir);
  }

  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    fileMustExist(dir, "prisma/schema.prisma");
    sh("npx prisma validate", dir);
  }

  return { ok: true };
}

async function main() {
  fs.ensureDirSync(SCRATCH);

  // Entity parser unit checks (fast, no fs writes needed beyond this process).
  runEntityParserChecks();

  const results = [];
  for (const testCase of CASES) {
    process.stdout.write(`\n=== ${testCase.name} ===\n`);
    try {
      await runCase(testCase);
      results.push({ name: testCase.name, ok: true });
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      results.push({ name: testCase.name, ok: false, error });
      console.error(`FAIL ${testCase.name}`);
      console.error(error.stdout ? error.stdout.toString() : error.stack || error.message);
      if (error.stderr) console.error(error.stderr.toString());
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    process.exitCode = 1;
  }
}

function runEntityParserChecks() {
  const goodPath = ENTITY_SAMPLE;
  const model = readEntityFile(goodPath);
  if (model.models.length !== 2) throw new Error("entity parser: expected 2 models");

  const bad = { models: [{ name: "User", fields: { email: { type: "string", unique: "yes" } } }] };
  let threw = false;
  try {
    parseEntityJson(bad);
  } catch (error) {
    threw = error instanceof EntityValidationError;
  }
  if (!threw) throw new Error("entity parser: expected EntityValidationError for invalid schema");

  console.log("entity parser checks: PASS");
}

main();
