"use strict";

function splitWords(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-\s]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function toPascalCase(input) {
  return splitWords(input)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join("");
}

function toCamelCase(input) {
  const pascal = toPascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toKebabCase(input) {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("-");
}

function toSnakeCase(input) {
  return splitWords(input)
    .map((w) => w.toLowerCase())
    .join("_");
}

function toUpperSnakeCase(input) {
  return toSnakeCase(input).toUpperCase();
}

const IRREGULAR_PLURALS = {
  person: "people",
  child: "children",
  man: "men",
  woman: "women",
  tooth: "teeth",
  foot: "feet",
  mouse: "mice",
  goose: "geese",
};

function pluralize(word) {
  const lower = word.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) {
    return matchCase(word, IRREGULAR_PLURALS[lower]);
  }
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/fe?$/i.test(word) && !/(roof|belief|chef|chief)$/i.test(word)) {
    return `${word.replace(/fe?$/i, "")}ves`;
  }
  return `${word}s`;
}

function matchCase(source, target) {
  if (source[0] === source[0].toUpperCase()) {
    return target.charAt(0).toUpperCase() + target.slice(1);
  }
  return target;
}

/** Levenshtein edit distance, used to power "did you mean X?" suggestions in error messages. */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Finds the closest match to `target` among `candidates`, or null if nothing is close enough to be useful. */
function didYouMean(target, candidates) {
  if (!target || candidates.length === 0) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = levenshtein(target.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  const threshold = Math.max(2, Math.ceil(target.length / 2));
  return bestDistance <= threshold ? best : null;
}

// npm forbids uppercase, most punctuation, and a leading '.' or '_' in package names — this
// mirrors those rules so a directory-derived name (e.g. from `.` or `./My Api`) always produces
// a valid package.json "name" instead of failing `npm install` with an opaque error.
const NPM_NAME_MAX_LENGTH = 214;

function toPackageName(name) {
  let out = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._~-]+/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/-+/g, "-")
    .replace(/-+$/, "");
  if (!out) out = "app";
  return out.slice(0, NPM_NAME_MAX_LENGTH);
}

module.exports = {
  toPascalCase,
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toUpperSnakeCase,
  pluralize,
  levenshtein,
  didYouMean,
  toPackageName,
};
