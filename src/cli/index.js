"use strict";

const { Command } = require("commander");
const { runInit } = require("./commands/init");
const pkg = require("../../package.json");

function createProgram() {
  const program = new Command();

  program.name("gazan").description("Interactive backend project initializer.").version(pkg.version);

  program
    .command("init")
    .description("Interactively generate a new backend project.")
    .action(async () => {
      await runInit();
    });

  return program;
}

module.exports = { createProgram };
