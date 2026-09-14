"use strict";

const { isEsm } = require("../syntax");
const { generatePrismaSchema } = require("../entity/toPrisma");

function defaultPrismaSchema() {
  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Starter model so \`prisma generate\`/\`migrate\` work out of the box.
// Replace this with your own models, or regenerate with an entity.json.
model Example {
  id        String   @id @default(uuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("examples")
}
`;
}

function generateSchemaPrisma(config, entityModel) {
  if (entityModel && entityModel.models.length > 0) {
    return generatePrismaSchema(entityModel, config);
  }
  return defaultPrismaSchema();
}

/** configs/db/index.{js,ts} — centralized PrismaClient lifecycle. No service instantiates its own client. */
function generatePrismaDbConfig(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const imports = esm
    ? `import { PrismaClient } from "@prisma/client";`
    : `const { PrismaClient } = require("@prisma/client");`;

  return `${imports}

const prisma = new PrismaClient();

async function connect() {
  await prisma.$connect();
  console.log("[db] prisma connected");
}

async function disconnect() {
  await prisma.$disconnect();
}

${esm ? "export { prisma, connect, disconnect };" : "module.exports = { prisma, connect, disconnect };"}
`;
}

module.exports = { generateSchemaPrisma, generatePrismaDbConfig };
