"use strict";

const chalk = require("chalk");
const pkg = require("../../package.json");
const skullAnsi = require("./skullAnsi");

// Figlet "ANSI Shadow" scaled a bit wider for a bigger wordmark.
const LETTERS = [
  [
    "  ██████╗  ",
    " ██╔════╝  ",
    " ██║  ███╗ ",
    " ██║   ██║ ",
    " ╚██████╔╝ ",
    "  ╚═════╝  ",
  ],
  [
    "  █████╗  ",
    " ██╔══██╗ ",
    " ███████║ ",
    " ██╔══██║ ",
    " ██║  ██║ ",
    " ╚═╝  ╚═╝ ",
  ],
  [
    " ███████╗ ",
    " ╚══███╔╝ ",
    "   ███╔╝  ",
    "  ███╔╝   ",
    " ███████╗ ",
    " ╚══════╝ ",
  ],
  [
    "  █████╗  ",
    " ██╔══██╗ ",
    " ███████║ ",
    " ██╔══██║ ",
    " ██║  ██║ ",
    " ╚═╝  ╚═╝ ",
  ],
  [
    " ███╗   ██╗",
    " ████╗  ██║",
    " ██╔██╗ ██║",
    " ██║╚██╗██║",
    " ██║ ╚████║",
    " ╚═╝  ╚═══╝",
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

function visibleLength(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "").length;
}

function padVisible(text, width) {
  return text + " ".repeat(Math.max(0, width - visibleLength(text)));
}

function buildTextLines() {
  const rows = LETTERS[0].length;
  const lines = [];
  for (let row = 0; row < rows; row += 1) {
    lines.push(LETTERS.map((letter, i) => paint(letter[row], LETTER_COLORS[i])).join("  "));
  }
  return lines;
}

function printBanner() {
  const textLines = buildTextLines();
  const skullLines = skullAnsi;
  const textWidth = Math.max(...textLines.map(visibleLength));
  const totalRows = Math.max(textLines.length, skullLines.length);
  const textOffset = Math.floor((totalRows - textLines.length) / 2);
  const skullOffset = Math.floor((totalRows - skullLines.length) / 2);
  const gap = "   ";

  console.log("");
  for (let row = 0; row < totalRows; row += 1) {
    const textIdx = row - textOffset;
    const skullIdx = row - skullOffset;
    const left =
      textIdx >= 0 && textIdx < textLines.length
        ? padVisible(textLines[textIdx], textWidth)
        : " ".repeat(textWidth);
    const right =
      skullIdx >= 0 && skullIdx < skullLines.length ? skullLines[skullIdx] : "";
    console.log(`  ${left}${gap}${right}`);
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
