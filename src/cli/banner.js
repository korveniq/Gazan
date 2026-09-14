"use strict";

const chalk = require("chalk");
const pkg = require("../../package.json");
const skullAnsi = require("./skullAnsi");

// Figlet "ANSI Shadow" — dense block letters.
const LETTERS = [
  [
    " ██████╗ ",
    "██╔════╝ ",
    "██║  ███╗",
    "██║   ██║",
    "╚██████╔╝",
    " ╚═════╝ ",
  ],
  [
    " █████╗ ",
    "██╔══██╗",
    "███████║",
    "██╔══██║",
    "██║  ██║",
    "╚═╝  ╚═╝",
  ],
  [
    "███████╗",
    "╚══███╔╝",
    "  ███╔╝ ",
    " ███╔╝  ",
    "███████╗",
    "╚══════╝",
  ],
  [
    " █████╗ ",
    "██╔══██╗",
    "███████║",
    "██╔══██║",
    "██║  ██║",
    "╚═╝  ╚═╝",
  ],
  [
    "███╗   ██╗",
    "████╗  ██║",
    "██╔██╗ ██║",
    "██║╚██╗██║",
    "██║ ╚████║",
    "╚═╝  ╚═══╝",
  ],
];

// Soft ice / bone palette — a few close tones only.
const C = {
  light: chalk.hex("#E8F4F8"),
  mid: chalk.hex("#B7D4DE"),
  deep: chalk.hex("#7FAEBC"),
};

const LETTER_COLORS = [C.light, C.mid, C.deep, C.mid, C.deep];

function paint(line, colorFn) {
  return [...line]
    .map((ch) => (ch === " " ? ch : colorFn(ch)))
    .join("");
}

function printBanner() {
  const rows = LETTERS[0].length;

  console.log("");
  for (let row = 0; row < rows; row += 1) {
    const line = LETTERS.map((letter, i) => paint(letter[row], LETTER_COLORS[i])).join("  ");
    console.log(`  ${line}`);
  }

  console.log("");
  for (const line of skullAnsi) {
    console.log(`  ${line}`);
  }

  console.log("");
  console.log(
    chalk.dim("  ") +
      C.mid("Interactive backend project generator") +
      chalk.dim(`  ·  v${pkg.version}`)
  );
  console.log("");
}

module.exports = { printBanner };
