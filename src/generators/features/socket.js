"use strict";

const { isEsm, specifier } = require("../syntax");

/** socket/index.{js,ts} — Socket.IO is initialized against the raw HTTP server, kept separate from the Express app. */
function generateSocketIndex(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const imports = esm ? `import { Server } from "socket.io";` : `const { Server } = require("socket.io");`;
  const envImport = esm
    ? `import { env } from "${specifier(config, "../helpers/env")}";`
    : `const { env } = require("../helpers/env");`;
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
