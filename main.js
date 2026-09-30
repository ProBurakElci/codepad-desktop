/*
 * The desktop app.
 *
 * What a desktop build is actually for is the thing a web page cannot do:
 * open a file from the disk, save back to the same path, and remember where
 * you were. That is most of what lives in this file.
 *
 * The window that shows the editor is deliberately powerless - no Node, no
 * remote module, context isolated - because it is the window that will be
 * running whatever code the user typed. Everything privileged happens here,
 * behind a handful of named messages.
 */
"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const { languageFor, dialogFilters } = require("./filetypes.js");

const FILTERS = dialogFilters();

let win = null;
let currentPath = null;
let dirty = false;

function updateTitle() {
  if (!win) return;
  const name = currentPath ? path.basename(currentPath) : "Untitled";
  win.setTitle((dirty ? "• " : "") + name + " — codepad");
  // the proxy icon and the "edited" dot in the macOS title bar
  win.setDocumentEdited(dirty);
  if (currentPath) win.setRepresentedFilename(currentPath);
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* ---------------- opening and saving ---------------- */

async function openPath(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    currentPath = filePath;
    dirty = false;
    updateTitle();
    app.addRecentDocument(filePath);
    send("file:opened", { path: filePath, text: text, language: languageFor(filePath) });
    return true;
  } catch (err) {
    dialog.showErrorBox("Could not open the file", err.message);
    return false;
  }
}

async function openDialog() {
  const result = await dialog.showOpenDialog(win, {
    title: "Open",
    properties: ["openFile"],
    filters: FILTERS,
  });
  if (result.canceled || !result.filePaths.length) return;
  await openPath(result.filePaths[0]);
}

/** Asks the window for its text, so saving never writes a stale copy. */
function requestText() {
  return new Promise((resolve) => {
    ipcMain.once("editor:text", (event, payload) => resolve(payload));
    send("editor:requestText");
  });
}

async function saveAs() {
  const payload = await requestText();
  const suggested = currentPath
    ? path.basename(currentPath)
    : "snippet." + (payload.extension || "txt");

  const result = await dialog.showSaveDialog(win, {
    title: "Save as",
    defaultPath: suggested,
    filters: FILTERS,
  });
  if (result.canceled || !result.filePath) return false;

  return writeFile(result.filePath, payload.text);
}

async function save() {
  if (!currentPath) return saveAs();
  const payload = await requestText();
  return writeFile(currentPath, payload.text);
}

async function writeFile(filePath, text) {
  try {
    await fs.writeFile(filePath, text, "utf8");
    currentPath = filePath;
    dirty = false;
    updateTitle();
    app.addRecentDocument(filePath);
    send("file:saved", { path: filePath });
    return true;
  } catch (err) {
    dialog.showErrorBox("Could not save the file", err.message);
    return false;
  }
}

/**
 * Asks before throwing away unsaved work. Returns false if the user changed
 * their mind, and the caller must then do nothing.
 */
async function confirmDiscard() {
  if (!dirty) return true;

  const { response } = await dialog.showMessageBox(win, {
    type: "question",
    buttons: ["Save", "Discard", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save your changes?",
    detail: currentPath ? path.basename(currentPath) : "This snippet has not been saved.",
  });

  if (response === 2) return false;
  if (response === 1) return true;
  return save();
}

async function newFile() {
  if (!(await confirmDiscard())) return;
  currentPath = null;
  dirty = false;
  updateTitle();
  send("file:new");
}

/* ---------------- the menu ---------------- */

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: newFile },
        { label: "Open...", accelerator: "CmdOrCtrl+O", click: openDialog },
        {
          label: "Open Recent",
          role: "recentdocuments",
          submenu: [{ label: "Clear", role: "clearrecentdocuments" }],
        },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: save },
        { label: "Save As...", accelerator: "CmdOrCtrl+Shift+S", click: saveAs },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "Run",
      submenu: [
        {
          label: "Run",
          accelerator: "CmdOrCtrl+Return",
          click: () => send("action:run"),
        },
        {
          label: "Clear output",
          accelerator: "CmdOrCtrl+K",
          click: () => send("action:clear"),
        },
        { type: "separator" },
        {
          label: "Load example for this language",
          click: () => send("action:sample"),
        },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "What actually runs",
          click: () =>
            dialog.showMessageBox(win, {
              type: "info",
              message: "Three languages run for real",
              detail:
                "JavaScript runs in a Web Worker, so a snippet cannot touch the app, " +
                "and an endless loop is stopped after five seconds.\n\n" +
                "HTML renders in a sandboxed frame.\n\n" +
                "Python runs through Pyodide, which is downloaded once the first " +
                "time you press Run and needs a connection for that download.\n\n" +
                "The other fourteen languages are highlighted, not run.",
            }),
        },
        {
          label: "Source code",
          click: () => shell.openExternal("https://github.com/ProBurakElci/codepad-desktop"),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------------- the window ---------------- */

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 640,
    minHeight: 420,
    /*
     * Shown for the instant before the page paints, so it has to be the
     * colour the page is about to be - otherwise the window flashes the
     * wrong appearance on every launch. These two match the editor
     * background tokens at the top of app/styles.css.
     */
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1f1f24" : "#ffffff",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // The page runs code the user typed. It gets no Node, no remote module,
      // and its own isolated context.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // the preload needs ipcRenderer
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, "app", "index.html"));
  win.once("ready-to-show", () => {
    win.show();
    updateTitle();
  });

  // Nothing in this app should ever navigate away or open a second window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());

  win.on("close", (event) => {
    if (!dirty) return;
    event.preventDefault();
    confirmDiscard().then((proceed) => {
      if (proceed) {
        dirty = false;
        win.close();
      }
    });
  });

  win.on("closed", () => { win = null; });

  // Switching the system appearance while the app is open.
  nativeTheme.on("updated", () => {
    if (win && !win.isDestroyed()) {
      win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#1f1f24" : "#ffffff");
    }
  });
}

/* ---------------- messages from the window ---------------- */

ipcMain.on("editor:dirty", (event, value) => {
  if (dirty === !!value) return;
  dirty = !!value;
  updateTitle();
});

ipcMain.handle("file:open", openDialog);
ipcMain.handle("file:save", save);
ipcMain.handle("file:saveAs", saveAs);
ipcMain.handle("file:new", newFile);

/* ---------------- lifecycle ---------------- */

const pending = process.argv.slice(1).find((arg) => !arg.startsWith("-") && arg !== ".");

app.whenReady().then(() => {
  buildMenu();
  createWindow();

  if (pending) {
    win.webContents.once("did-finish-load", () => openPath(path.resolve(pending)));
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Double-clicking a file in Finder, and dropping one on the dock icon
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (win) openPath(filePath);
  else app.whenReady().then(() => openPath(filePath));
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
