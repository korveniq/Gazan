"use strict";

/**
 * Centralizes CJS/MJS/JS/TS syntax decisions so every template stays
 * consistent instead of re-deriving require()/import rules ad-hoc.
 */
function isEsm(config) {
  return config.moduleSystem === "mjs" || config.language === "ts";
}

/** Default import: `import X from "y"` / `const X = require("y")` */
function importDefault(config, name, from) {
  return isEsm(config) ? `import ${name} from "${from}";` : `const ${name} = require("${from}");`;
}

/** Named import: `import { a, b } from "y"` / `const { a, b } = require("y")` */
function importNamed(config, names, from) {
  const list = Array.isArray(names) ? names.join(", ") : names;
  return isEsm(config) ? `import { ${list} } from "${from}";` : `const { ${list} } = require("${from}");`;
}

/** Namespace/star import for CommonJS-only interop packages (e.g. express) */
function importCjsInterop(config, name, from) {
  if (isEsm(config)) return `import ${name} from "${from}";`;
  return `const ${name} = require("${from}");`;
}

function exportDefault(config, name) {
  return isEsm(config) ? `export default ${name};` : `module.exports = ${name};`;
}

function exportNamed(config, name) {
  return isEsm(config) ? `export { ${name} };` : `module.exports.${name} = ${name};`;
}

function exportAssign(config, expr) {
  return isEsm(config) ? `export default ${expr};` : `module.exports = ${expr};`;
}

function fileExt(config) {
  return config.language === "ts" ? "ts" : "js";
}

/**
 * Relative import specifier. Native ESM resolution (moduleSystem: "mjs")
 * requires an explicit extension on relative imports — this holds even for
 * TypeScript compiled under NodeNext, where source files import the future
 * ".js" output extension rather than ".ts". CJS resolution (for both JS and
 * TS via ts-node/tsc with commonjs module resolution) needs no extension.
 */
function specifier(config, relativePathNoExt) {
  return config.moduleSystem === "mjs" ? `${relativePathNoExt}.js` : relativePathNoExt;
}

module.exports = {
  isEsm,
  importDefault,
  importNamed,
  importCjsInterop,
  exportDefault,
  exportNamed,
  exportAssign,
  fileExt,
  specifier,
};
