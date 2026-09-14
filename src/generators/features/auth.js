"use strict";

const { isEsm, specifier } = require("../syntax");

/** helpers/bcrypt.{js,ts} — the only place password hashing logic lives. */
function generateBcryptHelper(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const imports = esm ? `import bcrypt from "bcrypt";` : `const bcrypt = require("bcrypt");`;
  const SALT_ROUNDS = 10;

  const hashSig = isTs ? "hashPassword(password: string)" : "hashPassword(password)";
  const compareSig = isTs
    ? "comparePassword(password: string, hash: string)"
    : "comparePassword(password, hash)";

  return `${imports}

const SALT_ROUNDS = ${SALT_ROUNDS};

async function ${hashSig} {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function ${compareSig} {
  return bcrypt.compare(password, hash);
}

${esm ? "export { hashPassword, comparePassword };" : "module.exports = { hashPassword, comparePassword };"}
`;
}

/** helpers/jwt.{js,ts} — access/refresh token signing and verification, centralized. */
function generateJwtHelper(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const hasRefresh = config.authentication.methods.includes("refresh-token");

  const imports = isTs
    ? `import jwt, { SignOptions } from "jsonwebtoken";`
    : esm
    ? `import jwt from "jsonwebtoken";`
    : `const jwt = require("jsonwebtoken");`;
  const envImport = esm
    ? `import { env } from "${specifier(config, "./env")}";`
    : `const { env } = require("./env");`;

  const expiresInCast = isTs ? " as SignOptions[\"expiresIn\"]" : "";
  const signAccessSig = isTs ? `signAccessToken(payload: object)` : "signAccessToken(payload)";
  const verifyAccessSig = isTs ? "verifyAccessToken(token: string)" : "verifyAccessToken(token)";

  let refreshFns = "";
  if (hasRefresh) {
    const signRefreshSig = isTs ? "signRefreshToken(payload: object)" : "signRefreshToken(payload)";
    const verifyRefreshSig = isTs ? "verifyRefreshToken(token: string)" : "verifyRefreshToken(token)";
    refreshFns = `
function ${signRefreshSig} {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES_IN${expiresInCast} });
}

function ${verifyRefreshSig} {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
}
`;
  }

  const exportsList = ["signAccessToken", "verifyAccessToken"];
  if (hasRefresh) exportsList.push("signRefreshToken", "verifyRefreshToken");

  return `${imports}
${envImport}

function ${signAccessSig} {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN${expiresInCast} });
}

function ${verifyAccessSig} {
  return jwt.verify(token, env.JWT_SECRET);
}
${refreshFns}
${esm ? `export { ${exportsList.join(", ")} };` : `module.exports = { ${exportsList.join(", ")} };`}
`;
}

/** middlewares/auth.{js,ts} — verifies the Bearer access token and attaches req.user. */
function generateAuthMiddleware(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const jwtImport = esm
    ? `import { verifyAccessToken } from "${specifier(config, "../helpers/jwt")}";`
    : `const { verifyAccessToken } = require("../helpers/jwt");`;
  const errorsImport = esm
    ? `import { UnauthorizedException } from "${specifier(config, "../helpers/errors")}";`
    : `const { UnauthorizedException } = require("../helpers/errors");`;
  const reqType = isTs ? `import { Request, Response, NextFunction } from "express";\n\n` : "";
  const sig = isTs ? "(req: Request, res: Response, next: NextFunction)" : "(req, res, next)";

  return `${reqType}${jwtImport}
${errorsImport}

function authenticate${sig} {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new UnauthorizedException("Missing or malformed Authorization header"));
  }

  const token = header.slice("Bearer ".length);

  try {
    req.user = verifyAccessToken(token);
    return next();
  } catch (error) {
    return next(new UnauthorizedException("Invalid or expired token"));
  }
}

${esm ? "export { authenticate };" : "module.exports = { authenticate };"}
`;
}

/**
 * helpers/oauth.stub.{js,ts} — GAZAN does NOT generate a working OAuth integration. "OAuth" isn't
 * one thing — Google, GitHub, generic OIDC, etc. all need different scopes, callback handling, and
 * token exchange, so wiring a specific provider is left to the project. This file exists so the
 * gap is obvious and documented rather than a silently missing piece; see README's Authentication
 * section for the same note.
 */
function generateOAuthStub(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const sig = isTs ? "notConfigured(): never" : "notConfigured()";

  return `/**
 * OAuth is scaffolded as env vars only (OAUTH_CLIENT_ID / OAUTH_CLIENT_SECRET /
 * OAUTH_CALLBACK_URL) — GAZAN does not generate a provider integration. To finish this:
 *
 *   1. Pick a provider (Google, GitHub, a generic OIDC server, ...).
 *   2. Add its client library (e.g. \`openid-client\`, or a provider-specific SDK) yourself —
 *      none is installed by default.
 *   3. Implement the redirect + callback routes (e.g. GET /auth/oauth, GET /auth/oauth/callback)
 *      using env.OAUTH_CLIENT_ID / env.OAUTH_CLIENT_SECRET / env.OAUTH_CALLBACK_URL below.
 *   4. On success, mint your own access token the same way helpers/jwt.${isTs ? "ts" : "js"} does,
 *      so the rest of the app (middlewares/auth) keeps working unchanged.
 */
function ${sig} {
  throw new Error(
    "OAuth is not implemented — this is a stub. See helpers/oauth.stub.${isTs ? "ts" : "js"} for what to build."
  );
}

${esm ? "export { notConfigured };" : "module.exports = { notConfigured };"}
`;
}

module.exports = { generateBcryptHelper, generateJwtHelper, generateAuthMiddleware, generateOAuthStub };
