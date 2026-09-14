"use strict";

const { pluralize } = require("../utils/strings");

class AliasCollisionError extends Error {
  constructor(message) {
    super(message);
    this.name = "AliasCollisionError";
  }
}

// Every alias GAZAN itself can generate — used to guard entity-derived HMVC module aliases from
// colliding with a shared/infra alias (section 11's reserved list, extended with the ones GAZAN
// actually produces beyond the spec's minimum example, e.g. @models).
const RESERVED_ALIAS_NAMES = new Set([
  "@",
  "@controllers",
  "@services",
  "@routes",
  "@middlewares",
  "@utils",
  "@helpers",
  "@validators",
  "@configs",
  "@db",
  "@redis",
  "@socket",
  "@workers",
  "@models",
]);

function join(...segments) {
  const filtered = segments.filter((s) => s && s !== ".");
  return filtered.length > 0 ? filtered.join("/") : ".";
}

/**
 * The single source of truth for the project's alias set. Consumed by the import resolver,
 * the tsconfig/jsconfig generators, the CJS/MJS runtime generators, and the README generator —
 * none of them re-derive this mapping independently.
 *
 * Returns { enabled: false } untouched when aliases are off, so every downstream consumer can
 * just check `.enabled` once and otherwise behave exactly as it did before this feature existed.
 */
function buildAliasConfig(config, entityModel) {
  if (!config.aliases || !config.aliases.enabled) {
    return { enabled: false, root: "@", aliases: {}, modules: {} };
  }

  const root = config.useSrc ? "src" : ".";
  const aliases = { "@": root };

  if (config.architecture === "mvc") {
    aliases["@controllers"] = join(root, "controllers");
    aliases["@routes"] = join(root, "routes");
    aliases["@services"] = join(root, "services");
    aliases["@validators"] = join(root, "validators");
  }

  // Shared regardless of architecture — generateProject always creates these.
  aliases["@middlewares"] = join(root, "middlewares");
  aliases["@utils"] = join(root, "utils");
  aliases["@helpers"] = join(root, "helpers");
  aliases["@configs"] = join(root, "configs");

  if (config.database.type !== "none") {
    aliases["@db"] = join(root, "configs", "db");
  }
  if (config.redis) {
    aliases["@redis"] = join(root, "configs", "redis");
  }
  if (config.socketIO) {
    aliases["@socket"] = join(root, "socket");
  }
  if (config.bullMQ) {
    aliases["@workers"] = join(root, "workers");
  }
  if (config.database.type === "mongodb" && config.database.orm === "mongoose") {
    aliases["@models"] = join(root, "models");
  }

  const modules = {};
  if (config.architecture === "hmvc" && entityModel) {
    const seenTargets = new Map();
    for (const model of entityModel.models) {
      if (model.crud === false) continue;

      // model.camelName is already validated by the entity parser (letters/digits only,
      // starting with a letter), so pluralize() cannot introduce path-traversal or unsafe
      // characters — no separate sanitization is needed here.
      const key = `@${pluralize(model.camelName)}`;

      if (RESERVED_ALIAS_NAMES.has(key)) {
        throw new AliasCollisionError(
          `Module alias '${key}' (derived from model '${model.name}') collides with a reserved GAZAN alias. Rename the model, or disable module aliases.`
        );
      }
      if (seenTargets.has(key)) {
        throw new AliasCollisionError(
          `Module alias '${key}' is derived from both '${seenTargets.get(key)}' and '${model.name}' — their pluralized names collide. Rename one of the models, or disable module aliases.`
        );
      }
      seenTargets.set(key, model.name);

      modules[key] = join(root, "modules", model.camelName);
    }
  }

  return { enabled: true, root: "@", aliases, modules };
}

/** All alias entries (shared + HMVC module) as a single flat map — key -> target directory. */
function allAliasEntries(aliasConfig) {
  return { ...aliasConfig.aliases, ...aliasConfig.modules };
}

/**
 * Derives tsconfig/jsconfig `paths` (and their `baseUrl`) from the directory map — the only place
 * that shape is computed, so tsconfig.json and jsconfig.json can never drift from each other or
 * from the runtime resolvers.
 */
function toTsPaths(aliasConfig) {
  const paths = {};
  for (const [key, dir] of Object.entries(allAliasEntries(aliasConfig))) {
    paths[`${key}/*`] = [`${dir === "." ? "" : dir + "/"}*`];
  }
  return { baseUrl: ".", paths };
}

module.exports = { buildAliasConfig, allAliasEntries, toTsPaths, AliasCollisionError, RESERVED_ALIAS_NAMES };
