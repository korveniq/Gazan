#!/usr/bin/env node
"use strict";

const REQUIRED_MAJOR = 18;
const currentMajor = Number(process.versions.node.split(".")[0]);

if (Number.isNaN(currentMajor) || currentMajor < REQUIRED_MAJOR) {
  console.error(
    `GAZAN requires Node.js >= ${REQUIRED_MAJOR}. You're running Node ${process.versions.node}.\n` +
      `Install a newer Node (e.g. via nvm) and try again.`
  );
  process.exit(1);
}

const { createProgram } = require("../src/cli");

createProgram().parseAsync(process.argv);
