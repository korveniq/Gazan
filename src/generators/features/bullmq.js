"use strict";

const { isEsm } = require("../syntax");
const { sharedDir } = require("../paths");
const { resolveImportPath } = require("../aliasResolver");

/** workers/queue.js — thin factory around BullMQ Queue, reusing the shared Redis connection. */
function generateQueueFactory(config, aliasConfig) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const fromDir = sharedDir(config, "workers");
  const redisPath = resolveImportPath(config, aliasConfig, fromDir, `${sharedDir(config, "configs")}/redis/index`);

  const imports = esm ? `import { Queue } from "bullmq";` : `const { Queue } = require("bullmq");`;
  const redisImport = esm
    ? `import { redisClient } from "${redisPath}";`
    : `const { redisClient } = require("${redisPath}");`;

  const sig = isTs ? "createQueue(name: string)" : "createQueue(name)";

  return `${imports}
${redisImport}

function ${sig} {
  return new Queue(name, { connection: redisClient });
}

${esm ? "export { createQueue };" : "module.exports = { createQueue };"}
`;
}

/** workers/example.worker.js — a starter BullMQ worker demonstrating the queue/worker split. */
function generateExampleWorker(config, aliasConfig) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const fromDir = sharedDir(config, "workers");
  const redisPath = resolveImportPath(config, aliasConfig, fromDir, `${sharedDir(config, "configs")}/redis/index`);

  const imports = esm ? `import { Worker } from "bullmq";` : `const { Worker } = require("bullmq");`;
  const redisImport = esm
    ? `import { redisClient } from "${redisPath}";`
    : `const { redisClient } = require("${redisPath}");`;

  const jobType = isTs ? ": import(\"bullmq\").Job" : "";

  return `${imports}
${redisImport}

const exampleWorker = new Worker(
  "example",
  async (job${jobType}) => {
    console.log(\`[worker:example] processing job \${job.id}\`, job.data);
  },
  { connection: redisClient }
);

exampleWorker.on("completed", (job) => {
  console.log(\`[worker:example] job \${job.id} completed\`);
});

exampleWorker.on("failed", (job, error) => {
  console.error(\`[worker:example] job \${job?.id} failed:\`, error);
});

${esm ? "export { exampleWorker };" : "module.exports = { exampleWorker };"}
`;
}

/** workers/index.js — aggregates queues/workers so server.js can wire them into graceful shutdown in one place. */
function generateWorkersIndex(config, aliasConfig) {
  const esm = isEsm(config);
  const fromDir = sharedDir(config, "workers");
  // Same-directory siblings — always relative, alias or not.
  const workerPath = resolveImportPath(config, aliasConfig, fromDir, `${fromDir}/example.worker`);
  const queuePath = resolveImportPath(config, aliasConfig, fromDir, `${fromDir}/queue`);

  const workerImport = esm
    ? `import { exampleWorker } from "${workerPath}";`
    : `const { exampleWorker } = require("${workerPath}");`;
  const queueImport = esm
    ? `import { createQueue } from "${queuePath}";`
    : `const { createQueue } = require("${queuePath}");`;

  return `${queueImport}
${workerImport}

const exampleQueue = createQueue("example");

const queues = [exampleQueue];
const workers = [exampleWorker];

${esm ? "export { queues, workers, exampleQueue };" : "module.exports = { queues, workers, exampleQueue };"}
`;
}

module.exports = { generateQueueFactory, generateExampleWorker, generateWorkersIndex };
