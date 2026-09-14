"use strict";

const { buildEnvSpec } = require("./env");
const { getSensitiveFields } = require("./entity/sensitiveFields");

function buildReadme(config, entityModel) {
  const lines = [];
  lines.push(`# ${config.projectName}`, "");
  lines.push("Generated with [GAZAN](https://github.com/) — an interactive backend project initializer.", "");

  lines.push("## Stack", "");
  lines.push(`- Module system: **${config.moduleSystem.toUpperCase()}**`);
  lines.push(`- Language: **${config.language === "ts" ? "TypeScript" : "JavaScript"}**`);
  lines.push(`- Architecture: **${config.architecture.toUpperCase()}**`);
  lines.push(`- Source layout: ${config.useSrc ? "`src/`" : "project root"}`);
  if (config.database.type !== "none") {
    lines.push(`- Database: **${config.database.type}** (${config.database.orm})`);
  } else {
    lines.push(`- Database: none`);
  }
  if (config.redis) lines.push(`- Redis: enabled`);
  if (config.bullMQ) lines.push(`- BullMQ workers: enabled`);
  if (config.socketIO) lines.push(`- Socket.IO: enabled`);
  if (config.authentication.enabled) {
    lines.push(`- Authentication: ${config.authentication.methods.join(", ")}`);
  }
  lines.push("");

  if (config.authentication.enabled && config.authentication.methods.includes("oauth")) {
    lines.push("> **OAuth is a stub.** Only env vars and `helpers/oauth.stub.*` (a documented");
    lines.push("> `throw`, not a working integration) are generated — no provider, client");
    lines.push("> library, or routes. See that file for what to build.");
    lines.push("");
  }

  lines.push("## Project structure", "");
  lines.push("```");
  lines.push(...buildStructureTree(config));
  lines.push("```", "");

  lines.push("## Environment variables", "");
  lines.push("| Variable | Description |", "|---|---|");
  for (const v of buildEnvSpec(config)) {
    lines.push(`| \`${v.name}\` | example: \`${v.example}\` |`);
  }
  lines.push("");

  lines.push("## Development", "");
  lines.push("```bash");
  lines.push("npm install");
  lines.push("cp .env.example .env");
  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    lines.push("npm run db:generate");
    lines.push("npm run db:migrate");
  }
  lines.push("npm run dev");
  lines.push("```", "");

  lines.push("## Production", "");
  lines.push("```bash");
  if (config.language === "ts") {
    lines.push("npm run build");
  }
  lines.push("npm start");
  lines.push("```", "");

  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    lines.push("## Database commands", "");
    lines.push("```bash");
    lines.push("npm run db:generate   # regenerate the Prisma client");
    lines.push("npm run db:migrate    # run dev migrations");
    lines.push("npm run db:push       # push schema without a migration");
    lines.push("npm run db:studio     # open Prisma Studio");
    lines.push("```", "");
  }

  if (entityModel && entityModel.models.length > 0) {
    lines.push("## Generated entities", "");
    for (const model of entityModel.models) {
      lines.push(`- **${model.pascalName}** — \`/api/${model.routePath}\``);
    }
    lines.push("");

    const sensitiveModels = entityModel.models.filter((m) => getSensitiveFields(m).length > 0);
    if (sensitiveModels.length > 0) {
      lines.push(
        `> Fields matching \`password\`/\`secret\`/\`hash\` (${sensitiveModels
          .map((m) => `${m.pascalName}.${getSensitiveFields(m).join(", ")}`)
          .join("; ")}) are stripped from every generated response automatically.`
      );
      lines.push("");
    }

    const hasManyToMany = entityModel.models.some((m) => m.relations.some((r) => r.type === "belongsToMany"));
    if (hasManyToMany) {
      lines.push(
        "> One or more entities use a many-to-many (`belongsToMany`) relation. It's represented in the"
      );
      lines.push(
        "> generated schema/model, but the generated CRUD create/update endpoints don't read or write it —"
      );
      lines.push("> manage those joins via your own service code.");
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildStructureTree(config) {
  const base = config.useSrc ? "src/" : "";
  const lines = [`${config.projectName}/`];
  if (config.useSrc) lines.push("├── src/");
  const indent = config.useSrc ? "│   " : "";

  if (config.architecture === "mvc") {
    lines.push(`${indent}├── controllers/`);
    lines.push(`${indent}├── routes/`);
    lines.push(`${indent}├── services/`);
    lines.push(`${indent}├── validators/`);
  } else {
    lines.push(`${indent}├── modules/`);
    lines.push(`${indent}│   └── <entity>/`);
    lines.push(`${indent}│       ├── controllers/`);
    lines.push(`${indent}│       ├── routes/`);
    lines.push(`${indent}│       ├── services/`);
    lines.push(`${indent}│       └── validators/`);
  }
  lines.push(`${indent}├── middlewares/`);
  lines.push(`${indent}├── helpers/`);
  lines.push(`${indent}├── utils/`);
  lines.push(`${indent}├── configs/`);
  if (config.database.type !== "none") lines.push(`${indent}│   └── db/`);
  if (config.redis) lines.push(`${indent}│   └── redis/`);
  if (config.bullMQ) lines.push(`${indent}├── workers/`);
  if (config.socketIO) lines.push(`${indent}├── socket/`);
  lines.push(`${indent}├── app.${config.language}`);
  lines.push(`${indent}└── server.${config.language}`);
  if (config.database.type === "postgresql" && config.database.orm === "prisma") {
    lines.push("├── prisma/");
    lines.push("│   └── schema.prisma");
  }
  lines.push("├── .env.example");
  lines.push("├── package.json");
  lines.push("└── README.md");

  return lines;
}

module.exports = { buildReadme };
