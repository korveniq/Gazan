"use strict";

const fs = require("fs-extra");
const path = require("path");

/**
 * Thin, composable filesystem primitives used by every generator.
 * Generators never call `fs` directly — everything funnels through here
 * so behaviour (idempotency, logging, dry-run, etc.) stays centralized.
 */
class GeneratorEngine {
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.createdFiles = [];
  }

  resolve(...segments) {
    return path.join(this.rootDir, ...segments);
  }

  createDirectory(relativePath) {
    const full = this.resolve(relativePath);
    fs.ensureDirSync(full);
    return full;
  }

  createFile(relativePath, content) {
    const full = this.resolve(relativePath);
    fs.ensureDirSync(path.dirname(full));
    fs.writeFileSync(full, content, "utf8");
    this.createdFiles.push(relativePath);
    return full;
  }

  fileExists(relativePath) {
    return fs.existsSync(this.resolve(relativePath));
  }

  readJson(relativePath) {
    return fs.readJsonSync(this.resolve(relativePath));
  }

  writeJson(relativePath, data) {
    const full = this.resolve(relativePath);
    fs.ensureDirSync(path.dirname(full));
    fs.writeJsonSync(full, data, { spaces: 2 });
    this.createdFiles.push(relativePath);
    return full;
  }

  mergeJson(relativePath, patch) {
    const existing = this.fileExists(relativePath) ? this.readJson(relativePath) : {};
    const merged = deepMerge(existing, patch);
    this.writeJson(relativePath, merged);
    return merged;
  }

  /**
   * Merge dependency/script/etc. fragments into package.json, preserving
   * key ordering for the well-known top-level fields.
   */
  updatePackageJson(patch) {
    const current = this.fileExists("package.json") ? this.readJson("package.json") : {};
    const merged = deepMerge(current, patch);
    this.writeJson("package.json", merged);
    return merged;
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (isPlainObject(sourceVal) && isPlainObject(targetVal)) {
      result[key] = deepMerge(targetVal, sourceVal);
    } else {
      result[key] = sourceVal;
    }
  }
  return result;
}

module.exports = { GeneratorEngine, deepMerge };
