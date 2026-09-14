"use strict";

/**
 * Turns raw prompt answers into the single normalized configuration object
 * that every generator consumes. Generators must never read prompt answers
 * directly — only this shape.
 */
function normalizeConfig(answers) {
  const moduleSystem = answers.moduleSystem === "mjs" ? "mjs" : "cjs";
  const language = answers.language === "ts" ? "ts" : "js";
  const ext = language === "ts" ? "ts" : "js";

  const database = normalizeDatabase(answers.database);
  const architecture = answers.architecture === "hmvc" ? "hmvc" : "mvc";
  const useSrc = Boolean(answers.useSrc);
  const socketIO = Boolean(answers.socketIO);
  const bullMQ = Boolean(answers.bullMQ);

  const authentication = normalizeAuth(answers.authentication);

  const rateLimitStrategy = bullMQ ? "redis" : answers.rateLimitStrategy || "memory";
  const needsRedis = bullMQ || rateLimitStrategy === "redis";

  return {
    projectName: answers.projectName,
    targetDir: answers.targetDir,
    moduleSystem,
    language,
    ext,
    database,
    architecture,
    useSrc,
    socketIO,
    bullMQ,
    redis: needsRedis,
    rateLimitStrategy: needsRedis ? "redis" : "memory",
    authentication,
    entityFile: answers.entityFile || null,
  };
}

function normalizeDatabase(db) {
  if (!db || db.type === "none") {
    return { type: "none", orm: null };
  }
  if (db.type === "postgresql") {
    return { type: "postgresql", orm: "prisma" };
  }
  if (db.type === "mongodb") {
    return { type: "mongodb", orm: db.orm === "native" ? "native" : "mongoose" };
  }
  return { type: "none", orm: null };
}

function normalizeAuth(auth) {
  if (!auth || !auth.enabled) {
    return { enabled: false, methods: [] };
  }
  const allowed = ["email-password", "jwt", "oauth", "refresh-token"];
  const methods = (auth.methods || []).filter((m) => allowed.includes(m));
  return { enabled: methods.length > 0, methods };
}

module.exports = { normalizeConfig };
