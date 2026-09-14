"use strict";

const p = require("@clack/prompts");
const fs = require("fs-extra");
const path = require("path");
const { EntityValidationError } = require("../parser/entity/errors");
const { readEntityFile } = require("../parser/entity/parse");

function onCancel() {
  p.cancel("Operation cancelled.");
  process.exit(1);
}

async function ask(fn, opts) {
  const result = await fn(opts);
  if (p.isCancel(result)) onCancel();
  return result;
}

async function runPrompts(defaults = {}) {
  p.intro("GAZAN — backend project initializer");

  const projectName = await ask(p.text, {
    message: "Project name/path",
    placeholder: "my-app  (or '.' for the current directory)",
    initialValue: defaults.projectName,
    validate: (value) => {
      if (!value || !value.trim()) return "Project name/path is required";
      const trimmed = value.trim();
      // '.', './relative', '../relative', and absolute paths are all valid OUTPUT PATHS — they're
      // resolved with Node's `path` APIs (never string concatenation) and are not further
      // restricted here; existing-directory safety is enforced later, once the path is resolved.
      if (trimmed === "." || trimmed.startsWith("./") || trimmed.startsWith("../") || path.isAbsolute(trimmed)) {
        return undefined;
      }
      if (!/^[a-z0-9][a-z0-9-_]*$/i.test(trimmed)) {
        return "Use letters, digits, - and _ only, or a path like '.', './backend', '../backend'";
      }
    },
  });
  const projectNamePath = projectName.trim();

  const moduleSystem = await ask(p.select, {
    message: "Which module system do you want?",
    options: [
      { value: "cjs", label: "CommonJS (CJS)" },
      { value: "mjs", label: "ES Modules (MJS)" },
    ],
  });

  const language = await ask(p.select, {
    message: "Which language do you want?",
    options: [
      { value: "js", label: "JavaScript" },
      { value: "ts", label: "TypeScript" },
    ],
  });

  const aliasesEnabled = await ask(p.confirm, {
    message: "Do you want to enable module/path aliases? (e.g. @/services/x instead of ../../services/x)",
    initialValue: true,
  });

  const databaseChoice = await ask(p.select, {
    message: "Which database do you want?",
    options: [
      { value: "postgresql-prisma", label: "PostgreSQL + Prisma" },
      { value: "mongodb-mongoose", label: "MongoDB + Mongoose" },
      { value: "mongodb-native", label: "MongoDB + native mongosh/driver" },
      { value: "none", label: "None" },
    ],
  });

  const database = parseDatabaseChoice(databaseChoice);

  const architecture = await ask(p.select, {
    message: "Which architecture do you want?",
    options: [
      { value: "mvc", label: "MVC" },
      { value: "hmvc", label: "HMVC" },
    ],
  });

  const useSrc = await ask(p.confirm, {
    message: "Use src/ directory?",
    initialValue: true,
  });

  const socketIO = await ask(p.confirm, {
    message: "Do you need Socket.IO?",
    initialValue: false,
  });

  const bullMQ = await ask(p.confirm, {
    message: "Do you need BullMQ workers?",
    initialValue: false,
  });

  // BullMQ already requires Redis, so rate limiting rides on that connection for free. Only ask
  // when it wouldn't otherwise exist, so a "Redis-only-for-rate-limiting" setup stays reachable.
  let rateLimitStrategy = "memory";
  if (!bullMQ) {
    const useRedisForRateLimit = await ask(p.confirm, {
      message: "Use Redis for rate limiting? (No = in-memory rate limiting)",
      initialValue: false,
    });
    rateLimitStrategy = useRedisForRateLimit ? "redis" : "memory";
  }

  const authEnabled = await ask(p.confirm, {
    message: "Do you need authentication?",
    initialValue: false,
  });

  let authMethods = [];
  if (authEnabled) {
    authMethods = await ask(p.multiselect, {
      message: "Which authentication methods?",
      options: [
        { value: "email-password", label: "Email/password" },
        { value: "jwt", label: "JWT" },
        { value: "oauth", label: "OAuth" },
        { value: "refresh-token", label: "Refresh tokens" },
      ],
      required: false,
    });
  }

  const hasEntityFile = await ask(p.confirm, {
    message: "Do you have an entity.json file?",
    initialValue: false,
  });

  let entityFile = null;
  if (hasEntityFile) {
    entityFile = await promptEntityPath(database.type);
  }

  p.outro("Configuration collected.");

  return {
    projectName: projectNamePath,
    moduleSystem,
    language,
    aliasesEnabled,
    database,
    architecture,
    useSrc,
    socketIO,
    bullMQ,
    rateLimitStrategy,
    authentication: { enabled: authEnabled, methods: authMethods },
    entityFile,
  };
}

async function promptEntityPath(databaseType) {
  for (;;) {
    const candidate = await ask(p.text, {
      message: "Enter entity.json path",
      placeholder: "./entity.json",
      validate: (value) => {
        if (!value || !value.trim()) return "A path is required";
      },
    });

    const absolute = path.resolve(candidate.trim());
    if (!fs.existsSync(absolute)) {
      p.log.error(`No file exists at: ${absolute}`);
      continue;
    }

    try {
      readEntityFile(absolute, { databaseType });
      p.log.success(`entity.json is valid (${absolute})`);
      return absolute;
    } catch (error) {
      if (error instanceof EntityValidationError) {
        p.log.error(error.format());
      } else {
        p.log.error(error.message);
      }
      const retry = await ask(p.confirm, { message: "Try a different path?", initialValue: true });
      if (!retry) return null;
    }
  }
}

function parseDatabaseChoice(choice) {
  if (choice === "postgresql-prisma") return { type: "postgresql", orm: "prisma" };
  if (choice === "mongodb-mongoose") return { type: "mongodb", orm: "mongoose" };
  if (choice === "mongodb-native") return { type: "mongodb", orm: "native" };
  return { type: "none", orm: null };
}

module.exports = { runPrompts };
