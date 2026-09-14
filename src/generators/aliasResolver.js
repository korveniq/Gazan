"use strict";

const { relativeImport } = require("./paths");
const { specifier } = require("./syntax");
const { allAliasEntries } = require("../config/aliases");

function normalizeSlashes(p) {
  return p.split("\\").join("/");
}

/**
 * Finds the alias whose target directory is the deepest (most specific) match for
 * `targetPathNoExt` — e.g. for "src/configs/db/index" this prefers "@db" (src/configs/db) over
 * the root "@" (src), even though both technically match.
 */
function findLongestAliasMatch(aliasConfig, targetPathNoExt) {
  const target = normalizeSlashes(targetPathNoExt);
  let best = null;

  for (const [key, dir] of Object.entries(allAliasEntries(aliasConfig))) {
    const normalizedDir = normalizeSlashes(dir).replace(/^\.\/?$/, "");
    const isRoot = normalizedDir === "";
    const prefix = isRoot ? "" : `${normalizedDir}/`;

    const matches = isRoot ? true : target === normalizedDir || target.startsWith(prefix);
    if (!matches) continue;

    const dirLen = isRoot ? 0 : normalizedDir.length;
    if (!best || dirLen > best.dirLen) {
      const remainder = isRoot ? target : target.slice(normalizedDir.length).replace(/^\//, "");
      best = { key, dirLen, remainder };
    }
  }

  return best;
}

/**
 * The one place that decides how a generated file imports another generated file. Falls back to
 * the pre-existing relative-path behavior whenever aliases are disabled, the two files are in the
 * same directory (aliasing a sibling import adds noise, not clarity), or — defensively — no alias
 * covers the target at all.
 *
 * @param config normalized project config
 * @param aliasConfig result of buildAliasConfig() (or {enabled:false} / undefined)
 * @param fromDir directory (relative to project root) of the file doing the importing
 * @param targetPathNoExt path (relative to project root, no extension) of the file being imported
 */
function resolveImportPath(config, aliasConfig, fromDir, targetPathNoExt) {
  const plainRelative = relativeImport(fromDir, targetPathNoExt);
  const isSameDirectory = plainRelative.startsWith("./") && !plainRelative.slice(2).includes("/");

  if (isSameDirectory || !aliasConfig || !aliasConfig.enabled) {
    return specifier(config, plainRelative);
  }

  const hit = findLongestAliasMatch(aliasConfig, targetPathNoExt);
  if (!hit) return specifier(config, plainRelative); // defensive: every real dir GAZAN writes to has an alias

  const aliasSpecifier = hit.remainder ? `${hit.key}/${hit.remainder}` : hit.key;
  // Under native ESM (moduleSystem "mjs"), both Node's own resolution and TypeScript's NodeNext
  // resolver require an explicit extension even on path-mapped/alias specifiers — the same rule
  // specifier() already applies to plain relative imports, so reuse it here rather than assuming
  // "aliases never need extensions" (that's only true for CJS resolution and module-alias).
  return specifier(config, aliasSpecifier);
}

module.exports = { resolveImportPath, findLongestAliasMatch };
