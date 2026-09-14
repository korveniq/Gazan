"use strict";

const { baseDir } = require("./paths");

function entryPath(config) {
  const base = baseDir(config);
  const file = `server.${config.language}`;
  return base === "." ? file : `${base}/${file}`;
}

function buildPackageJson(config) {
  const dependencies = {
    express: "^4.21.1",
    dotenv: "^16.4.5",
    zod: "^3.23.8",
    cors: "^2.8.5",
    helmet: "^7.1.0",
    "express-rate-limit": "^7.4.1",
  };
  const devDependencies = {};

  if (config.redis) {
    dependencies.ioredis = "^5.4.1";
  }
  if (config.rateLimitStrategy === "redis") {
    dependencies["rate-limit-redis"] = "^4.2.0";
  }
  if (config.bullMQ) {
    dependencies.bullmq = "^5.21.2";
  }
  if (config.socketIO) {
    dependencies["socket.io"] = "^4.8.0";
  }
  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    dependencies["@prisma/client"] = "^5.20.0";
    devDependencies.prisma = "^5.20.0";
  }
  if (config.database.type === "mongodb" && config.database.orm === "mongoose") {
    dependencies.mongoose = "^8.7.0";
  }
  if (config.database.type === "mongodb" && config.database.orm === "native") {
    dependencies.mongodb = "^6.9.0";
  }
  if (config.authentication.enabled && config.authentication.methods.includes("email-password")) {
    dependencies.bcrypt = "^5.1.1";
  }
  if (
    config.authentication.enabled &&
    (config.authentication.methods.includes("jwt") || config.authentication.methods.includes("refresh-token"))
  ) {
    dependencies.jsonwebtoken = "^9.0.2";
  }
  // Deliberately no OAuth dependency here — see helpers/oauth.stub.{js,ts} and the README's
  // Authentication section. GAZAN scaffolds OAuth env vars only; picking and wiring a provider
  // (and its client library) is left to the project, since "OAuth" isn't one integration.

  if (config.language === "ts") {
    devDependencies.typescript = "^5.6.3";
    devDependencies.tsx = "^4.19.1";
    devDependencies["@types/node"] = "^22.7.5";
    devDependencies["@types/express"] = "^4.17.21";
    devDependencies["@types/cors"] = "^2.8.17";
    if (dependencies.bcrypt) devDependencies["@types/bcrypt"] = "^5.0.2";
    if (dependencies.jsonwebtoken) devDependencies["@types/jsonwebtoken"] = "^9.0.7";
  }

  const entry = entryPath(config);
  const scripts = {
    start: config.language === "ts" ? "node dist/server.js" : `node ${entry}`,
    dev: config.language === "ts" ? `tsx watch ${entry}` : `node --watch ${entry}`,
  };

  if (config.language === "ts") {
    scripts.build = "tsc";
  }

  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    scripts["db:generate"] = "prisma generate";
    scripts["db:migrate"] = "prisma migrate dev";
    scripts["db:push"] = "prisma db push";
    scripts["db:studio"] = "prisma studio";
  }

  const pkg = {
    name: config.packageName || config.projectName,
    version: "0.1.0",
    private: true,
    type: config.moduleSystem === "mjs" ? "module" : "commonjs",
    main: entry,
    scripts,
    dependencies: sortKeys(dependencies),
  };

  if (Object.keys(devDependencies).length > 0) {
    pkg.devDependencies = sortKeys(devDependencies);
  }

  return pkg;
}

function sortKeys(obj) {
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = obj[key];
  return sorted;
}

module.exports = { buildPackageJson, entryPath };
