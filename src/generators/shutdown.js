"use strict";

const { isEsm } = require("./syntax");

/**
 * Generic, idempotent graceful-shutdown orchestrator. It knows nothing about
 * which features are enabled — server.js wires in only the resources that
 * actually exist, so a resource that was never enabled is never touched.
 */
function generateShutdownFile(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";

  const typeBlock = isTs
    ? `export interface ShutdownResources {
  httpServer?: { close: (cb: (err?: Error) => void) => void };
  io?: { close: () => Promise<void> | void };
  workers?: Array<{ close: () => Promise<void> }>;
  queues?: Array<{ close: () => Promise<void> }>;
  redis?: { quit: () => Promise<unknown> };
  db?: { disconnect?: () => Promise<void>; close?: () => Promise<void> };
}

`
    : "";

  const fnSignature = isTs ? "createShutdown(resources: ShutdownResources = {})" : "createShutdown(resources = {})";

  const body = `${typeBlock}function ${fnSignature} {
  let shuttingDown = false;

  return async function shutdown(signal${isTs ? ": string" : ""} = "SIGTERM") {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(\`\\n[shutdown] received \${signal}, closing resources...\`);

    if (resources.httpServer) {
      const server = resources.httpServer;
      await new Promise((resolve) => server.close(() => resolve(undefined)));
      console.log("[shutdown] http server closed");
    }

    if (resources.io) {
      await resources.io.close();
      console.log("[shutdown] socket.io closed");
    }

    if (resources.workers && resources.workers.length > 0) {
      await Promise.all(resources.workers.map((worker) => worker.close()));
      console.log("[shutdown] bullmq workers closed");
    }

    if (resources.queues && resources.queues.length > 0) {
      await Promise.all(resources.queues.map((queue) => queue.close()));
      console.log("[shutdown] bullmq queues closed");
    }

    if (resources.redis) {
      await resources.redis.quit();
      console.log("[shutdown] redis connection closed");
    }

    if (resources.db) {
      if (resources.db.disconnect) await resources.db.disconnect();
      else if (resources.db.close) await resources.db.close();
      console.log("[shutdown] database connection closed");
    }

    console.log("[shutdown] complete");
    process.exit(0);
  };
}

${esm ? "export { createShutdown };" : "module.exports = { createShutdown };"}
`;

  return body;
}

function generateProcessEventsFile(config, shutdownImportPath) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const shutdownImport = esm
    ? `import type { createShutdown } from "${shutdownImportPath}";`
    : "";

  const fnSignature = isTs
    ? "registerProcessEvents(shutdown: ReturnType<typeof createShutdown>)"
    : "registerProcessEvents(shutdown)";

  const body = `${isTs && shutdownImport ? shutdownImport + "\n\n" : ""}function ${fnSignature} {
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (error) => {
    console.error("[process] uncaught exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[process] unhandled rejection:", reason);
    shutdown("unhandledRejection");
  });
}

${esm ? "export { registerProcessEvents };" : "module.exports = { registerProcessEvents };"}
`;

  return body;
}

module.exports = { generateShutdownFile, generateProcessEventsFile };
