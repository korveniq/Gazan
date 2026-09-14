"use strict";

const { isEsm } = require("./syntax");
const { baseDir, sharedDir, archDirs } = require("./paths");
const { resolveImportPath } = require("./aliasResolver");

function generateAppFile(config, aliasConfig) {
  const esm = isEsm(config);
  const base = baseDir(config);
  const r = (target) => resolveImportPath(config, aliasConfig, base, target);

  const imports = [];
  imports.push(esm ? `import express from "express";` : `const express = require("express");`);
  imports.push(esm ? `import cors from "cors";` : `const cors = require("cors");`);
  imports.push(esm ? `import helmet from "helmet";` : `const helmet = require("helmet");`);
  const envPath = r(`${sharedDir(config, "helpers")}/env`);
  imports.push(esm ? `import { env } from "${envPath}";` : `const { env } = require("${envPath}");`);
  const rateLimitPath = r(`${sharedDir(config, "middlewares")}/rate-limit`);
  imports.push(
    esm ? `import { rateLimiter } from "${rateLimitPath}";` : `const { rateLimiter } = require("${rateLimitPath}");`
  );
  const notFoundPath = r(`${sharedDir(config, "middlewares")}/not-found`);
  imports.push(esm ? `import { notFound } from "${notFoundPath}";` : `const { notFound } = require("${notFoundPath}");`);
  const errorHandlerPath = r(`${sharedDir(config, "middlewares")}/error-handler`);
  imports.push(
    esm
      ? `import { errorHandler } from "${errorHandlerPath}";`
      : `const { errorHandler } = require("${errorHandlerPath}");`
  );
  const routesPath = r(`${sharedDir(config, "routes")}/index`);
  imports.push(esm ? `import routes from "${routesPath}";` : `const routes = require("${routesPath}");`);

  const body = `if (env.NODE_ENV === "production" && env.CORS_ORIGIN === "*") {
  // CORS_ORIGIN="*" is fine for local development but should never ship to production —
  // lock it down to your actual frontend origin(s) via the CORS_ORIGIN env var.
  console.warn("[security] CORS_ORIGIN is \\"*\\" in production — restrict it to your real origin(s).");
}

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(rateLimiter);

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, data: { status: "ok" } });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);
`;

  const footer = esm ? "\nexport default app;\n" : "\nmodule.exports = app;\n";

  return `${imports.join("\n")}\n\n${body}${footer}`;
}

function generateServerFile(config, aliasConfig) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const base = baseDir(config);
  const r = (target) => resolveImportPath(config, aliasConfig, base, target);

  // CJS+JS is the one combination where aliases need an explicit runtime registration call —
  // TS relies on tsc-alias (build) / tsx (dev), and MJS+JS on a --experimental-loader flag, but
  // module-alias must be required before anything else in the process resolves a module.
  const moduleAliasRegister =
    aliasConfig && aliasConfig.enabled && config.language === "js" && config.moduleSystem === "cjs"
      ? `require("module-alias/register");\n\n`
      : "";

  const imports = [];
  imports.push(esm ? `import http from "http";` : `const http = require("http");`);
  const appPath = r(`${base}/app`);
  imports.push(esm ? `import app from "${appPath}";` : `const app = require("${appPath}");`);
  const envPath = r(`${sharedDir(config, "helpers")}/env`);
  imports.push(esm ? `import { env } from "${envPath}";` : `const { env } = require("${envPath}");`);
  const shutdownPath = r(`${sharedDir(config, "utils")}/shutdown`);
  imports.push(
    esm ? `import { createShutdown } from "${shutdownPath}";` : `const { createShutdown } = require("${shutdownPath}");`
  );
  const processEventsPath = r(`${sharedDir(config, "helpers")}/process-events`);
  imports.push(
    esm
      ? `import { registerProcessEvents } from "${processEventsPath}";`
      : `const { registerProcessEvents } = require("${processEventsPath}");`
  );

  if (config.database.type !== "none") {
    const dbPath = r(`${sharedDir(config, "configs")}/db/index`);
    imports.push(esm ? `import * as db from "${dbPath}";` : `const db = require("${dbPath}");`);
  }
  if (config.redis) {
    const redisPath = r(`${sharedDir(config, "configs")}/redis/index`);
    imports.push(
      esm ? `import { redisClient } from "${redisPath}";` : `const { redisClient } = require("${redisPath}");`
    );
  }
  if (config.socketIO) {
    const socketPath = r(`${sharedDir(config, "socket")}/index`);
    imports.push(
      esm ? `import { createSocketServer } from "${socketPath}";` : `const { createSocketServer } = require("${socketPath}");`
    );
  }
  if (config.bullMQ) {
    const workersPath = r(`${sharedDir(config, "workers")}/index`);
    imports.push(
      esm ? `import { queues, workers } from "${workersPath}";` : `const { queues, workers } = require("${workersPath}");`
    );
  }

  const bootLines = [];
  bootLines.push(`const httpServer = http.createServer(app);`);
  if (config.socketIO) {
    bootLines.push(`const io = createSocketServer(httpServer);`);
  }

  const shutdownResourceLines = [`    httpServer,`];
  if (config.socketIO) {
    shutdownResourceLines.push(`    io: { close: () => new Promise((resolve) => io.close(() => resolve())) },`);
  }
  if (config.bullMQ) {
    shutdownResourceLines.push(`    workers,`);
    shutdownResourceLines.push(`    queues,`);
  }
  if (config.redis) {
    shutdownResourceLines.push(`    redis: redisClient,`);
  }
  if (config.database.type !== "none") {
    shutdownResourceLines.push(`    db,`);
  }

  const dbConnectCall = config.database.type !== "none" ? `  await db.connect();\n` : "";

  const body = `async function start()${isTs ? ": Promise<void>" : ""} {
${dbConnectCall}
${bootLines.map((l) => "  " + l).join("\n")}

  const shutdown = createShutdown({
${shutdownResourceLines.join("\n")}
  });

  registerProcessEvents(shutdown);

  httpServer.listen(env.PORT, () => {
    console.log(\`[server] listening on port \${env.PORT} (\${env.NODE_ENV})\`);
  });
}

start().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
`;

  return `${moduleAliasRegister}${imports.join("\n")}\n\n${body}`;
}

function generateRoutesIndex(config, aliasConfig, models) {
  const esm = isEsm(config);
  const fromDir = sharedDir(config, "routes");
  const imports = [esm ? `import { Router } from "express";` : `const { Router } = require("express");`];

  const useLines = [];
  for (const model of models) {
    const varName = `${model.camelName}Routes`;
    const targetDir = archDirs(config, model.camelName).routes;
    const importPath = resolveImportPath(config, aliasConfig, fromDir, `${targetDir}/${model.kebabName}.routes`);
    imports.push(
      esm ? `import ${varName} from "${importPath}";` : `const ${varName} = require("${importPath}");`
    );
    useLines.push(`router.use("/${model.routePath}", ${varName});`);
  }

  const body = `const router = Router();

${useLines.join("\n")}
`;

  const footer = esm ? "\nexport default router;\n" : "\nmodule.exports = router;\n";

  return `${imports.join("\n")}\n\n${body}${footer}`;
}

module.exports = { generateAppFile, generateServerFile, generateRoutesIndex };
