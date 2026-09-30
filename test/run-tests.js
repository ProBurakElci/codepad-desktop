/*
 * Tests:  node test/run-tests.js
 *
 * These run anywhere, including CI with no display, because none of them need
 * Electron. What they guard is the part of a desktop app that has no user
 * interface to catch mistakes in:
 *
 *   1. Extension to language. Open a .rs file and get JavaScript highlighting
 *      with no complaint and you would never notice something was wrong.
 *   2. The preload allowlist. Every extra channel is a way for a snippet the
 *      user pasted to reach the machine, so the list is pinned down here.
 *   3. The editor itself, which is a copy of the web app's - so the same
 *      tokeniser and sharing tests run against this copy too, which is how a
 *      stale copy gets caught.
 *
 * The one thing these cannot check is whether the app opens at all. That is
 * test/smoke.js, which needs a real screen.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const FileTypes = require("../filetypes.js");
const Highlight = require("../app/js/highlight.js");
const Share = require("../app/js/share.js");
const Samples = require("../app/js/samples.js");

let passed = 0;
let failed = 0;

function ok(label, condition) {
  if (condition) passed++;
  else {
    failed++;
    console.error("  FAILED: " + label);
  }
}

function eq(label, actual, expected) {
  ok(label + " (got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected) + ")",
    actual === expected);
}

function section(name) {
  console.log("\n" + name);
}

/* ---------------- opening a file picks the right language ---------------- */

section("A file on the disk becomes the right language");

eq("a .js file is JavaScript", FileTypes.languageFor("/home/a/thing.js"), "javascript");
eq("a .py file is Python", FileTypes.languageFor("C:\\code\\script.py"), "python");
eq("a .rs file is Rust", FileTypes.languageFor("main.rs"), "rust");
eq("a .cpp file uses the C mode", FileTypes.languageFor("app.cpp"), "c");
eq("a .h header too", FileTypes.languageFor("app.h"), "c");
eq("a .mjs file is still JavaScript", FileTypes.languageFor("mod.mjs"), "javascript");
eq("a .tsx file is TypeScript", FileTypes.languageFor("View.tsx"), "typescript");
eq("a .zsh file is shell", FileTypes.languageFor(".zshrc.zsh"), "shell");
eq("a .yaml file is YAML", FileTypes.languageFor("ci.yaml"), "yaml");
eq("a .markdown file is Markdown", FileTypes.languageFor("notes.markdown"), "markdown");

eq("the extension is matched case insensitively", FileTypes.languageFor("Thing.PY"), "python");
eq("a path with dots in the folders still works",
  FileTypes.languageFor("/a.b.c/d.e/file.go"), "go");
eq("a dotfile with no extension is unknown", FileTypes.languageFor(".gitignore"), null);
eq("no extension at all is unknown", FileTypes.languageFor("/usr/bin/make"), null);
eq("an extension nobody knows is unknown", FileTypes.languageFor("archive.tar.xz"), null);
eq("an empty path is unknown", FileTypes.languageFor(""), null);
eq("null does not throw", FileTypes.languageFor(null), null);
eq("a number does not throw", FileTypes.languageFor(42), null);

/*
 * This is the check that actually matters: every language this file claims to
 * open must be a language the editor knows. A rename in highlight.js would
 * otherwise mean opening those files silently falls back.
 */
const knownLanguages = Object.keys(Highlight.LANGUAGES);
const unknown = FileTypes.TYPES
  .map((type) => type.language)
  .filter((id) => knownLanguages.indexOf(id) === -1);
ok("every language the file dialog offers exists in the editor" +
  (unknown.length ? " (missing: " + unknown.join(", ") + ")" : ""), unknown.length === 0);

const notOffered = knownLanguages.filter((id) =>
  !FileTypes.TYPES.some((type) => type.language === id));
ok("every language in the editor can be opened from a file" +
  (notOffered.length ? " (no extension for: " + notOffered.join(", ") + ")" : ""),
  notOffered.length === 0);

/* an extension may only mean one language, or opening it is a coin toss */
const seen = new Map();
let duplicated = null;
for (const type of FileTypes.TYPES) {
  for (const ext of type.extensions) {
    if (seen.has(ext)) duplicated = ext;
    seen.set(ext, type.language);
  }
}
ok("no extension is claimed by two languages" + (duplicated ? " (" + duplicated + ")" : ""),
  duplicated === null);

/* ---------------- the dialogs ---------------- */

section("The open and save dialogs");

const filters = FileTypes.dialogFilters();
ok("there is a filter for every language, plus Code and All files",
  filters.length === FileTypes.TYPES.length + 2);
eq("the widest one comes first", filters[0].name, "Code");
eq("and All files comes last", filters[filters.length - 1].name, "All files");
ok("the Code filter covers every extension",
  FileTypes.TYPES.every((type) =>
    type.extensions.every((ext) => filters[0].extensions.indexOf(ext) !== -1)));
ok("nothing is listed twice in the Code filter",
  new Set(filters[0].extensions).size === filters[0].extensions.length);
ok("every filter has at least one extension",
  filters.every((f) => f.extensions.length > 0));
ok("no filter has a leading dot, which Electron would not match",
  filters.every((f) => f.extensions.every((e) => e.charAt(0) !== ".")));

const copy = FileTypes.dialogFilters();
copy[1].extensions.push("nonsense");
ok("the filters are a fresh copy, so a caller cannot corrupt the table",
  FileTypes.dialogFilters()[1].extensions.indexOf("nonsense") === -1);

/* ---------------- the window is not allowed near the machine ---------------- */

section("What the window can reach");

const preload = fs.readFileSync(path.join(__dirname, "..", "preload.js"), "utf8");

/*
 * The window runs code the user pasted. If any of these ever appear in the
 * bridge, a snippet can reach the disk or spawn a process.
 */
for (const forbidden of ["fs", "child_process", "os", "net", "http", "path", "vm", "module"]) {
  ok("the bridge does not hand over " + forbidden,
    !new RegExp('require\\(["\']' + forbidden + '["\']\\)').test(preload));
}
ok("the bridge does not expose ipcRenderer itself",
  !/exposeInMainWorld\([^)]*ipcRenderer\s*\)/.test(preload) &&
  !/\bipcRenderer\s*:/.test(preload));
ok("the bridge does not expose the process object", !/\bprocess\s*:/.test(preload));
ok("nothing is eval'd", !/\beval\s*\(/.test(preload));

/* the channels the window may listen on, spelled out so a new one is visible */
const allowlist = /const allowed = \[([\s\S]*?)\]/.exec(preload);
ok("the listen channels are an allowlist", allowlist !== null);
if (allowlist) {
  const channels = (allowlist[1].match(/"[^"]+"/g) || []).map((s) => s.slice(1, -1));
  const expected = [
    "action:clear", "action:run", "action:sample",
    "editor:requestText",
    "file:new", "file:opened", "file:saved",
  ];
  eq("exactly seven channels are allowed", channels.length, expected.length);
  eq("and they are the expected seven",
    channels.slice().sort().join(","), expected.join(","));
}

const main = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
ok("the window gets no Node", /nodeIntegration:\s*false/.test(main));
ok("the window is context isolated", /contextIsolation:\s*true/.test(main));
ok("every channel the app sends is one the bridge allows",
  (main.match(/send\("([^"]+)"/g) || [])
    .map((s) => s.slice(6, -1))
    .every((channel) => preload.indexOf('"' + channel + '"') !== -1));
ok("a second window cannot be opened behind the user's back",
  /setWindowOpenHandler/.test(main) && /action:\s*"deny"/.test(main));
ok("the page cannot navigate away from the editor",
  /will-navigate/.test(main) && /preventDefault/.test(main));
ok("closing with unsaved work asks first", /confirmDiscard/.test(main));
ok("saving asks the window for its text instead of keeping a copy",
  /requestText/.test(main));

/* ---------------- the desktop layer stays harmless in a browser ---------------- */

section("The same page still works without the app");

const desktopJs = fs.readFileSync(path.join(__dirname, "..", "app", "js", "desktop.js"), "utf8");
ok("it gives up immediately when there is no app around",
  /if \(!bridge/.test(desktopJs));
ok("it also gives up if the editor is not ready", /if \(!api\)/.test(desktopJs));

/* ---------------- this copy of the editor is not stale ---------------- */

section("The bundled editor is the real one");

const LANGUAGE_IDS = Object.keys(Highlight.LANGUAGES);
eq("seventeen languages", LANGUAGE_IDS.length, 17);
eq("three of them run", Highlight.list().filter((l) => l.run).length, 3);

const AWKWARD = [
  "", "\n", "a", "const x = 1;", "// just a comment",
  "/* unterminated block comment", "\"unterminated string", "'\"`",
  "const s = \"he said \\\"hi\\\"\";", "a\n\n\nb", "\t\tindented",
  "emoji üni 🙂 code", "x = 0x1F + 1e10 + 3.14;",
  "<div class=\"a\">text</div>", "# heading\n- item\n> quote",
  "SELECT * FROM t WHERE a = 'b';",
];

let roundTripped = true;
for (const id of LANGUAGE_IDS) {
  for (const input of AWKWARD) {
    if (Highlight.plainText(Highlight.tokenize(input, id)) !== input) {
      roundTripped = false;
      console.error("  lost text in " + id + ": " + JSON.stringify(input.slice(0, 40)));
    }
  }
}
ok("the tokeniser never loses a character, in any language", roundTripped);

let escapedEverywhere = true;
for (const id of LANGUAGE_IDS) {
  for (const input of ["<script>alert(1)</script>", "const s = \"<img src=x onerror=alert(1)>\";", "\"'&<>"]) {
    const withoutOurSpans = Highlight.toHtml(input, id).replace(/<\/?span[^>]*>/g, "");
    if (withoutOurSpans.includes("<") || withoutOurSpans.includes(">")) {
      escapedEverywhere = false;
      console.error("  unescaped in " + id + ": " + JSON.stringify(input));
    }
  }
}
ok("nothing reaches innerHTML unescaped", escapedEverywhere);

ok("every language starts with an example",
  LANGUAGE_IDS.every((id) => Samples.get(id).length > 20));
ok("and every example survives the tokeniser",
  LANGUAGE_IDS.every((id) =>
    Highlight.plainText(Highlight.tokenize(Samples.get(id), id)) === Samples.get(id)));

ok("a snippet still survives a round trip through a link",
  Share.decode(Share.encode("ünïcode ✅\n\tx = 1;")) === "ünïcode ✅\n\tx = 1;");
eq("and rubbish still decodes to null", Share.decode("!!!"), null);

/* ---------------- the copy matches the web app ---------------- */

section("The editor files match the web version");

const webRoot = path.join(__dirname, "..", "..", "codepad");
if (fs.existsSync(webRoot)) {
  const shared = ["js/highlight.js", "js/editor.js", "js/runner.js", "js/samples.js",
    "js/share.js", "js/app.js", "worker.js", "styles.css"];
  const different = shared.filter((file) => {
    const here = path.join(__dirname, "..", "app", file);
    const there = path.join(webRoot, file);
    if (!fs.existsSync(there)) return false;
    return fs.readFileSync(here, "utf8") !== fs.readFileSync(there, "utf8");
  });
  ok("no bundled editor file has drifted from the web app" +
    (different.length ? " (stale: " + different.join(", ") + ")" : ""),
    different.length === 0);
} else {
  console.log("  (the web app is not checked out next to this one - skipped)");
}

/* ---------------- packaging ---------------- */

section("The app is put together properly");

const pkg = require("../package.json");
eq("the entry point is main.js", pkg.main, "main.js");
ok("there is nothing to install at runtime",
  !pkg.dependencies || Object.keys(pkg.dependencies).length === 0);
ok("it is MIT licensed", pkg.license === "MIT");
ok("the editor page is bundled",
  fs.existsSync(path.join(__dirname, "..", "app", "index.html")));
ok("the worker is bundled too",
  fs.existsSync(path.join(__dirname, "..", "app", "worker.js")));

const html = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
ok("the desktop layer loads after the editor",
  html.indexOf("js/desktop.js") > html.indexOf("js/app.js"));
/*
 * An offline app that quietly pulls a script or a stylesheet off the internet
 * is not offline. Links the user can click are fine - those open a browser.
 */
ok("no script comes from another site", !/<script[^>]+src="https?:/.test(html));
ok("no stylesheet comes from another site",
  !/<link[^>]+rel="stylesheet"[^>]+href="https?:/.test(html));
ok("no image comes from another site", !/<img[^>]+src="https?:/.test(html));
ok("the editor's own files are loaded from beside the page",
  html.indexOf('src="js/app.js"') !== -1 && html.indexOf('href="styles.css"') !== -1);

console.log("\n" + passed + " passed, " + failed + " failed.");
process.exit(failed ? 1 : 0);
