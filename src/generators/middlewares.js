"use strict";

const { isEsm, specifier } = require("./syntax");

function generateNotFoundMiddleware(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const errorsPath = specifier(config, "../helpers/errors");
  const errorsImport = esm
    ? `import { NotFoundException } from "${errorsPath}";`
    : `const { NotFoundException } = require("../helpers/errors");`;
  const sig = isTs ? "(req: Request, res: Response, next: NextFunction)" : "(req, res, next)";
  const reqType = isTs ? `import { Request, Response, NextFunction } from "express";\n\n` : "";

  return `${reqType}${errorsImport}

function notFound${sig} {
  next(new NotFoundException(\`Route \${req.method} \${req.originalUrl} not found\`));
}

${esm ? "export { notFound };" : "module.exports = { notFound };"}
`;
}

function generateErrorHandlerMiddleware(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const errorsPath = specifier(config, "../helpers/errors");
  const errorsImport = esm
    ? `import { HTTPException } from "${errorsPath}";`
    : `const { HTTPException } = require("../helpers/errors");`;
  const envPath = specifier(config, "../helpers/env");
  const envImport = esm ? `import { env } from "${envPath}";` : `const { env } = require("../helpers/env");`;
  const reqType = isTs ? `import { Request, Response, NextFunction } from "express";\n\n` : "";
  const sig = isTs ? "(err: unknown, req: Request, res: Response, next: NextFunction)" : "(err, req, res, next)";

  return `${reqType}${errorsImport}
${envImport}

function errorHandler${sig} {
  if (err instanceof HTTPException) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details,
    });
  }

  console.error("[error]", err);

  // Never leak internals (stack traces, driver error text) to clients in production — only in
  // development, and only for genuinely unexpected (non-HTTPException) errors.
  const isDev = env.NODE_ENV === "development";
  const devDetails = isDev && err instanceof Error ? err.stack : undefined;

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    ...(devDetails ? { details: devDetails } : {}),
  });
}

${esm ? "export { errorHandler };" : "module.exports = { errorHandler };"}
`;
}

function generateValidateMiddleware(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";
  const zodImport = esm ? `import { ZodType } from "zod";` : "";
  const errorsPath = specifier(config, "../helpers/errors");
  const errorsImport = esm
    ? `import { BadRequestException } from "${errorsPath}";`
    : `const { BadRequestException } = require("../helpers/errors");`;
  const reqType = isTs ? `import { Request, Response, NextFunction } from "express";\n${zodImport}\n\n` : "";

  const sig = isTs
    ? "validate(schema: ZodType, source: \"body\" | \"query\" | \"params\" = \"body\")"
    : "validate(schema, source = \"body\")";
  const handlerSig = isTs ? "(req: Request, res: Response, next: NextFunction)" : "(req, res, next)";

  return `${reqType}${errorsImport}

function ${sig} {
  return function ${handlerSig} {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return next(new BadRequestException("Validation failed", details));
    }

    req[source] = result.data;
    return next();
  };
}

${esm ? "export { validate };" : "module.exports = { validate };"}
`;
}

function generateRateLimitMiddleware(config) {
  const esm = isEsm(config);
  const isTs = config.language === "ts";

  if (config.rateLimitStrategy === "redis") {
    const redisPath = specifier(config, "../configs/redis/index");
    const imports = esm
      ? [
          `import rateLimit from "express-rate-limit";`,
          `import { RedisStore } from "rate-limit-redis";`,
          `import { redisClient } from "${redisPath}";`,
        ]
      : [
          `const rateLimit = require("express-rate-limit");`,
          `const { RedisStore } = require("rate-limit-redis");`,
          `const { redisClient } = require("../configs/redis");`,
        ];

    return `${imports.join("\n")}

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // Using the array-form call(command, args) overload (rather than spreading) sidesteps a
    // tuple-typing mismatch between ioredis's overloads and rate-limit-redis's SendCommandFn type.
    sendCommand: (...args${isTs ? ": string[]" : ""}) => redisClient.call(args[0], args.slice(1))${isTs ? " as any" : ""},
  }),
});

${esm ? "export { rateLimiter };" : "module.exports = { rateLimiter };"}
`;
  }

  const imports = esm ? `import rateLimit from "express-rate-limit";` : `const rateLimit = require("express-rate-limit");`;

  return `${imports}

const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

${esm ? "export { rateLimiter };" : "module.exports = { rateLimiter };"}
`;
}

module.exports = {
  generateNotFoundMiddleware,
  generateErrorHandlerMiddleware,
  generateValidateMiddleware,
  generateRateLimitMiddleware,
};
