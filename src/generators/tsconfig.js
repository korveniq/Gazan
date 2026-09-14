"use strict";

const { baseDir } = require("./paths");

function buildTsconfig(config) {
  const rootDir = baseDir(config);
  const isMjs = config.moduleSystem === "mjs";

  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022"],
      module: isMjs ? "NodeNext" : "CommonJS",
      moduleResolution: isMjs ? "NodeNext" : "Node",
      rootDir,
      outDir: "dist",
      strict: true,
      noImplicitAny: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: false,
      sourceMap: true,
    },
    include: [rootDir === "." ? "**/*.ts" : `${rootDir}/**/*.ts`],
    exclude: ["node_modules", "dist"],
  };
}

module.exports = { buildTsconfig };
