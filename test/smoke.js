/*
 * Launches the real app and drives it:  node test/smoke.js
 *
 * A desktop build can pass every unit test in the world and still fail to open
 * a window. So this one starts Electron for real, waits for the editor page to
 * load, puts a file's text into it, presses Run, and reads the output panel
 * back out. If the preload ever stops exposing the bridge, or the page starts
 * being able to reach Node, this is what notices.
 *
 * It needs the Electron binary, so it is not part of `npm test` - CI has no
 * display. Run it on a desktop before shipping a release.
 */
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "codepad-smoke-"));
const sourceFile = path.join(scratch, "hello.js");
const savedFile = path.join(scratch, "saved.js");

fs.writeFileSync(sourceFile, "console.log('from a real file');\n21 * 2;\n", "utf8");

/*
 * This runs inside Electron's main process. It is a string because it has to
 * be handed to a separate binary, not required from here.
 */
const script = `
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const ROOT = ${JSON.stringify(root)};
const SOURCE = ${JSON.stringify(sourceFile)};
const SAVED = ${JSON.stringify(savedFile)};

const report = [];
const note = (name, ok, detail) => report.push({ name, ok: !!ok, detail: detail || "" });

function finish(code) {
  console.log("SMOKE" + JSON.stringify(report));
  app.exit(code);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const failures = [];
  win.webContents.on("console-message", (event, level, message) => {
    if (level >= 3) failures.push(message);
  });

  await win.loadFile(path.join(ROOT, "app", "index.html"));
  await new Promise((r) => setTimeout(r, 1200));

  const run = (code) => win.webContents.executeJavaScript(code, true);

  try {
    note("the window loads the editor page", true);
    note("no errors while loading", failures.length === 0, failures[0]);

    note("the editor API is exposed", (await run("typeof window.codepad")) === "object");
    note("the desktop bridge is exposed", (await run("typeof window.desktop")) === "object");
    note("the page cannot reach Node", (await run("typeof require")) === "undefined");
    note("the page cannot reach the process object", (await run("typeof process")) === "undefined");
    note("seventeen languages are listed", (await run("Highlight.list().length")) === 17);

    // Open a real file the same way the File menu does.
    const text = fs.readFileSync(SOURCE, "utf8");
    await run("window.codepad.setLanguage('javascript'); window.codepad.setCode(" +
      JSON.stringify(text) + "); true");
    note("a file from the disk lands in the editor", (await run("window.codepad.getCode()")) === text);

    // Run it.
    await run("window.codepad.run(); true");
    await new Promise((r) => setTimeout(r, 2500));
    const output = await run(
      "Array.prototype.slice.call(document.querySelectorAll('#output .out-line'))" +
      ".map(function (d) { return d.textContent; }).join('\\\\n')");
    note("the snippet runs inside the app", output.indexOf("from a real file") !== -1,
      output.split("\\n")[0]);
    note("the value comes back", output.indexOf("42") !== -1);
    note("the app reports how long it took", /finished in \\d+ ms/.test(output));

    // Save it somewhere else, the way the main process does.
    fs.writeFileSync(SAVED, await run("window.codepad.getCode()"), "utf8");
    note("what is saved is what was in the editor", fs.readFileSync(SAVED, "utf8") === text);
    note("the extension follows the language", (await run("window.codepad.getExtension()")) === "js");

    // Switching language loads that language's example.
    await run("window.codepad.setLanguage('python'); window.codepad.loadSample(); true");
    note("switching to Python loads Python", (await run("window.codepad.getCode()")).indexOf("def ") !== -1);
    note("the extension follows along", (await run("window.codepad.getExtension()")) === "py");

    // A language with no runtime here must say so rather than pretend.
    await run("window.codepad.setLanguage('rust'); window.codepad.clear(); window.codepad.run(); true");
    await new Promise((r) => setTimeout(r, 400));
    const rust = await run(
      "Array.prototype.slice.call(document.querySelectorAll('#output .out-line'))" +
      ".map(function (d) { return d.textContent; }).join(' ')");
    note("Rust admits it is not run here", rust.indexOf("not run") !== -1, rust.slice(0, 80));

    // An endless loop must not take the app with it.
    await run("window.codepad.setLanguage('javascript'); window.codepad.setCode('while (true) {}'); " +
      "window.codepad.run(); true");
    await new Promise((r) => setTimeout(r, 1000));
    note("the window is still answering during an endless loop",
      (await run("1 + 1")) === 2);
    await run("window.codepad.run(); true"); // press Stop

    finish(0);
  } catch (err) {
    note("the run finished without throwing", false, String(err && err.message));
    finish(1);
  }
});
`;

const scriptFile = path.join(scratch, "smoke-main.js");
fs.writeFileSync(scriptFile, script, "utf8");

const electron = path.join(root, "node_modules", "electron", "dist",
  process.platform === "win32" ? "electron.exe" : "electron");

if (!fs.existsSync(electron)) {
  console.error("Electron is not installed here. Run: npm install");
  process.exit(2);
}

const child = spawn(electron, [scriptFile], {
  cwd: root,
  env: Object.assign({}, process.env, { ELECTRON_DISABLE_SECURITY_WARNINGS: "1" }),
});

let out = "";
child.stdout.on("data", (d) => { out += d.toString(); });
child.stderr.on("data", (d) => { out += d.toString(); });

const timer = setTimeout(() => {
  child.kill();
  console.error("The app never finished. Output so far:\n" + out.slice(-2000));
  process.exit(1);
}, 90000);

child.on("close", () => {
  clearTimeout(timer);
  try {
    fs.rmSync(scratch, { recursive: true, force: true });
  } catch (err) {
    /* a temp folder left behind is not worth failing over */
  }

  const match = /SMOKE(\[.*\])/.exec(out);
  if (!match) {
    console.error("The app produced no report:\n" + out.slice(-2000));
    process.exit(1);
  }

  const report = JSON.parse(match[1]);
  let failed = 0;

  console.log("");
  for (const item of report) {
    if (item.ok) {
      console.log("  ok    " + item.name);
    } else {
      failed++;
      console.log("  FAIL  " + item.name + (item.detail ? "   (" + item.detail + ")" : ""));
    }
  }

  console.log("\n" + (report.length - failed) + " passed, " + failed + " failed.");
  process.exit(failed ? 1 : 0);
});
