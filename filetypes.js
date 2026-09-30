/*
 * Which language a file on the disk is.
 *
 * This lives apart from main.js on purpose: main.js cannot be loaded without
 * Electron running, and the mapping between extensions and languages is the
 * part most likely to quietly go wrong - a missing extension means opening a
 * .rs file drops you into JavaScript highlighting with no warning at all.
 * Here it can be checked by plain Node, in CI, with nothing installed.
 */
"use strict";

const path = require("path");

/*
 * Every language the editor knows, with the extensions people actually have
 * on disk. The language ids must match the ones in app/js/highlight.js - the
 * tests check that, so a language renamed there fails here instead of
 * silently falling back.
 */
const TYPES = [
  { name: "JavaScript", extensions: ["js", "mjs", "cjs"], language: "javascript" },
  { name: "TypeScript", extensions: ["ts", "tsx"], language: "typescript" },
  { name: "Python", extensions: ["py", "pyw"], language: "python" },
  { name: "HTML", extensions: ["html", "htm"], language: "html" },
  { name: "CSS", extensions: ["css"], language: "css" },
  { name: "JSON", extensions: ["json"], language: "json" },
  { name: "SQL", extensions: ["sql"], language: "sql" },
  { name: "Java", extensions: ["java"], language: "java" },
  { name: "C and C++", extensions: ["c", "h", "cpp", "hpp", "cc", "cxx"], language: "c" },
  { name: "C#", extensions: ["cs"], language: "csharp" },
  { name: "Go", extensions: ["go"], language: "go" },
  { name: "Rust", extensions: ["rs"], language: "rust" },
  { name: "PHP", extensions: ["php"], language: "php" },
  { name: "Ruby", extensions: ["rb"], language: "ruby" },
  { name: "Shell", extensions: ["sh", "bash", "zsh"], language: "shell" },
  { name: "YAML", extensions: ["yml", "yaml"], language: "yaml" },
  { name: "Markdown", extensions: ["md", "markdown"], language: "markdown" },
];

/**
 * The language a path looks like, or null when nothing here recognises it.
 * Returning null rather than guessing lets the caller keep whatever language
 * is already selected instead of yanking it to JavaScript.
 */
function languageFor(filePath) {
  if (typeof filePath !== "string" || !filePath) return null;

  const ext = path.extname(filePath).replace(/^\./, "").toLowerCase();
  if (!ext) return null;

  const match = TYPES.find((type) => type.extensions.indexOf(ext) !== -1);
  return match ? match.language : null;
}

/** Filters for the open and save dialogs, widest first. */
function dialogFilters() {
  const every = [];
  for (const type of TYPES) {
    for (const ext of type.extensions) {
      if (every.indexOf(ext) === -1) every.push(ext);
    }
  }

  return [{ name: "Code", extensions: every }]
    .concat(TYPES.map((type) => ({ name: type.name, extensions: type.extensions.slice() })))
    .concat([{ name: "All files", extensions: ["*"] }]);
}

module.exports = { TYPES, languageFor, dialogFilters };
