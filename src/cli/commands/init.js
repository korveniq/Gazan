"use strict";

const path = require("path");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs-extra");
const p = require("@clack/prompts");
const chalk = require("chalk");
const { runPrompts } = require("../../prompts");
const { normalizeConfig } = require("../../config/normalize");
const { isDirEmpty } = require("../../utils/fsSafety");
const { readEntityFile } = require("../../parser/entity/parse");
const { EntityValidationError } = require("../../parser/entity/errors");
const { generate } = require("../../generators");

/**
 * Generates into a scratch directory first, only copying into `targetDir` once generation
 * succeeds fully — so a bug or filesystem error partway through never leaves the user's real
 * project directory half-written.
 */
function generateAtomically(targetDir, config, entityModel) {
  const tmpDir = path.join(os.tmpdir(), `gazan-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  try {
    const { results, warnings } = generate(tmpDir, config, entityModel);
    fs.ensureDirSync(targetDir);
    fs.copySync(tmpDir, targetDir, { overwrite: true });
    return { results, warnings };
  } finally {
    fs.removeSync(tmpDir);
  }
}

async function resolveTargetDir(projectName) {
  let targetDir = path.resolve(process.cwd(), projectName);

  for (;;) {
    if (isDirEmpty(targetDir)) return targetDir;

    const choice = await p.select({
      message: `Directory "${path.relative(process.cwd(), targetDir) || targetDir}" is not empty.`,
      options: [
        { value: "cancel", label: "Cancel" },
        { value: "continue", label: "Continue (files may be overwritten)" },
        { value: "other", label: "Use another directory" },
      ],
    });

    if (p.isCancel(choice) || choice === "cancel") {
      p.cancel("Operation cancelled.");
      process.exit(1);
    }
    if (choice === "continue") return targetDir;

    const otherName = await p.text({
      message: "Target directory path",
      placeholder: "./my-app",
    });
    if (p.isCancel(otherName)) {
      p.cancel("Operation cancelled.");
      process.exit(1);
    }
    targetDir = path.resolve(process.cwd(), otherName);
  }
}

async function runInit() {
  const answers = await runPrompts();

  const targetDir = await resolveTargetDir(answers.projectName);
  answers.targetDir = targetDir;

  const config = normalizeConfig(answers);

  let entityModel = null;
  if (config.entityFile) {
    try {
      entityModel = readEntityFile(config.entityFile, { databaseType: config.database.type });
    } catch (error) {
      if (error instanceof EntityValidationError) {
        p.log.error(error.format());
      } else {
        p.log.error(error.message);
      }
      process.exit(1);
    }
  }

  const spinner = p.spinner();
  spinner.start("Generating project...");

  try {
    const { results, warnings } = generateAtomically(targetDir, config, entityModel);
    spinner.stop("Project generated.");
    for (const step of results) {
      p.log.success(step);
    }
    for (const warning of warnings) {
      p.log.warn(warning);
    }
  } catch (error) {
    spinner.stop("Generation failed — target directory left untouched.");
    p.log.error(error.stack || error.message);
    process.exit(1);
  }

  const relTarget = path.relative(process.cwd(), targetDir) || ".";

  p.outro(
    [
      chalk.bold.green("Project initialized successfully."),
      "",
      "Next steps:",
      "",
      `  cd ${relTarget}`,
      `  npm install`,
      `  npm run dev`,
    ].join("\n")
  );
}

module.exports = { runInit };
