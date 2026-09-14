"use strict";

const { isEsm } = require("./syntax");

const NAMES = [
  "HTTPException",
  "BadRequestException",
  "UnauthorizedException",
  "ForbiddenException",
  "NotFoundException",
  "ConflictException",
  "UnprocessableEntityException",
  "InternalServerErrorException",
];

function generateErrorsFile(config) {
  const isTs = config.language === "ts";
  const esm = isEsm(config);
  const kw = esm ? "export class" : "class";

  const typedCtorArgs = isTs
    ? {
        base: "statusCode: number, message: string, details: unknown = null",
        sub: "message = \"__DEFAULT__\", details: unknown = null",
      }
    : {
        base: "statusCode, message, details = null",
        sub: "message = \"__DEFAULT__\", details = null",
      };

  const fields = isTs ? "  public statusCode: number;\n  public details: unknown;\n\n" : "";

  const base = `${kw} HTTPException extends Error {
${fields}  constructor(${typedCtorArgs.base}) {
    super(message);
    this.name = "HTTPException";
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}`;

  const subclasses = [
    ["BadRequestException", 400, "Bad Request"],
    ["UnauthorizedException", 401, "Unauthorized"],
    ["ForbiddenException", 403, "Forbidden"],
    ["NotFoundException", 404, "Not Found"],
    ["ConflictException", 409, "Conflict"],
    ["UnprocessableEntityException", 422, "Unprocessable Entity"],
    ["InternalServerErrorException", 500, "Internal Server Error"],
  ].map(([name, status, message]) => {
    const ctorArgs = typedCtorArgs.sub.replace("__DEFAULT__", message);
    return `${kw} ${name} extends HTTPException {
  constructor(${ctorArgs}) {
    super(${status}, message, details);
    this.name = "${name}";
  }
}`;
  });

  const body = [base, ...subclasses].join("\n\n");
  const footer = esm ? "" : `\n\nmodule.exports = {\n  ${NAMES.join(",\n  ")},\n};\n`;

  return `${body}${footer}\n`;
}

module.exports = { generateErrorsFile };
