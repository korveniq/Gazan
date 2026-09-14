"use strict";

const { isEsm } = require("../syntax");
const { sharedDir } = require("../paths");
const { resolveImportPath } = require("../aliasResolver");

/** socket/index.{js,ts} — Socket.IO is initialized against the raw HTTP server, kept separate from the Express app. */
function generateSocketIndex(config, aliasConfig) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const fromDir = sharedDir(config, "socket");
  const envPath = resolveImportPath(config, aliasConfig, fromDir, `${sharedDir(config, "helpers")}/env`);

  const imports = esm ? `import { Server } from "socket.io";` : `const { Server } = require("socket.io");`;
  const envImport = esm ? `import { env } from "${envPath}";` : `const { env } = require("${envPath}");`;
  const httpImport = isTs ? `import type { Server as HttpServer } from "http";\n` : "";

  const sig = isTs ? "createSocketServer(httpServer: HttpServer)" : "createSocketServer(httpServer)";

  return `${httpImport}${imports}
${envImport}

function ${sig} {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
    },
  });

  io.on("connection", (socket) => {
    console.log(\`[socket] client connected: \${socket.id}\`);

    socket.on("disconnect", () => {
      console.log(\`[socket] client disconnected: \${socket.id}\`);
    });
  });

  return io;
}

${esm ? "export { createSocketServer };" : "module.exports = { createSocketServer };"}
`;
}

module.exports = { generateSocketIndex };
