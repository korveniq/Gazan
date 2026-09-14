"use strict";

const { isEsm, specifier } = require("./syntax");

function generateAppFile(config) {
  const esm = isEsm(config);
  const p = (rel) => specifier(config, rel);

  const imports = [];
  imports.push(esm ? `import express from "express";` : `const express = require("express");`);
  imports.push(esm ? `import cors from "cors";` : `const cors = require("cors");`);
  imports.push(esm ? `import helmet from "helmet";` : `const helmet = require("helmet");`);
  imports.push(esm ? `import { env } from "${p("./helpers/env")}";` : `const { env } = require("./helpers/env");`);
  imports.push(
    esm
      ? `import { rateLimiter } from "${p("./middlewares/rate-limit")}";`
      : `const { rateLimiter } = require("./middlewares/rate-limit");`
  );
  imports.push(
    esm
      ? `import { notFound } from "${p("./middlewares/not-found")}";`
      : `const { notFound } = require("./middlewares/not-found");`
  );
  imports.push(
    esm
      ? `import { errorHandler } from "${p("./middlewares/error-handler")}";`
      : `const { errorHandler } = require("./middlewares/error-handler");`
  );
  imports.push(esm ? `import routes from "${p("./routes/index")}";` : `const routes = require("./routes");`);

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

function generateServerFile(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const p = (rel) => specifier(config, rel);

  const imports = [];
  imports.push(esm ? `import http from "http";` : `const http = require("http");`);
  imports.push(esm ? `import app from "${p("./app")}";` : `const app = require("./app");`);
  imports.push(esm ? `import { env } from "${p("./helpers/env")}";` : `const { env } = require("./helpers/env");`);
  imports.push(
    esm
      ? `import { createShutdown } from "${p("./utils/shutdown")}";`
      : `const { createShutdown } = require("./utils/shutdown");`
  );
  imports.push(
    esm
      ? `import { registerProcessEvents } from "${p("./helpers/process-events")}";`
      : `const { registerProcessEvents } = require("./helpers/process-events");`
  );

  if (config.database.type !== "none") {
    imports.push(esm ? `import * as db from "${p("./configs/db/index")}";` : `const db = require("./configs/db");`);
  }
  if (config.redis) {
    imports.push(
      esm ? `import { redisClient } from "${p("./configs/redis/index")}";` : `const { redisClient } = require("./configs/redis");`
    );
  }
  if (config.socketIO) {
    imports.push(
      esm ? `import { createSocketServer } from "${p("./socket/index")}";` : `const { createSocketServer } = require("./socket");`
    );
  }
  if (config.bullMQ) {
    imports.push(
      esm ? `import { queues, workers } from "${p("./workers/index")}";` : `const { queues, workers } = require("./workers");`
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

  return `${imports.join("\n")}\n\n${body}`;
}

function generateRoutesIndex(config, models) {
  const esm = isEsm(config);
  const imports = [esm ? `import { Router } from "express";` : `const { Router } = require("express");`];

  const useLines = [];
  for (const model of models) {
    const varName = `${model.camelName}Routes`;
    const importPath =
      config.architecture === "hmvc"
        ? `../modules/${model.camelName}/routes/${model.kebabName}.routes`
        : `./${model.kebabName}.routes`;
    imports.push(
      esm ? `import ${varName} from "${specifier(config, importPath)}";` : `const ${varName} = require("${importPath}");`
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
