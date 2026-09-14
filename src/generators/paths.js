"use strict";

const path = require("path");

function baseDir(config) {
  return config.useSrc ? "src" : ".";
}

function sharedDir(config, name) {
  return path.join(baseDir(config), name);
}

/**
 * Architecture-aware locations for controller/route/service/validator files.
 * MVC: flat, shared folders. HMVC: grouped per entity module.
 */
function archDirs(config, moduleName) {
  const base = baseDir(config);
  if (config.architecture === "hmvc") {
    const moduleBase = path.join(base, "modules", moduleName);
    return {
      controllers: path.join(moduleBase, "controllers"),
      routes: path.join(moduleBase, "routes"),
      services: path.join(moduleBase, "services"),
      validators: path.join(moduleBase, "validators"),
      moduleBase,
    };
  }
  return {
    controllers: path.join(base, "controllers"),
    routes: path.join(base, "routes"),
    services: path.join(base, "services"),
    validators: path.join(base, "validators"),
    moduleBase: base,
  };
}

/** Relative import path (POSIX, no extension) from `fromDir` to `toFile` (also relative to project root, no extension). */
function relativeImport(fromDir, toFileNoExt) {
  let rel = path.relative(fromDir, toFileNoExt).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = `./${rel}`;
  return rel;
}

module.exports = { baseDir, sharedDir, archDirs, relativeImport };
