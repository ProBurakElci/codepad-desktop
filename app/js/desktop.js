/*
 * The desktop half of the editor.
 *
 * Loaded after app.js, and does nothing at all in a browser: if window.desktop
 * is missing, this file returns immediately and the page stays the web app.
 * That is what keeps one copy of the editor working in both places.
 */
(function () {
  "use strict";

  const bridge = window.desktop;
  if (!bridge || !bridge.isDesktop) return;

  const api = window.codepad;
  if (!api) return;

  document.body.classList.add("is-desktop");

  // The web build shares snippets through the address bar; a desktop app has
  // real files instead, so that button becomes Open.
  const shareButton = document.querySelector("#share");
  if (shareButton) {
    shareButton.textContent = "Open";
    shareButton.title = "Open a file (Ctrl+O)";
    shareButton.onclick = function () { bridge.openFile(); };
  }

  const saveButton = document.querySelector("#download");
  if (saveButton) {
    saveButton.textContent = "Save";
    saveButton.title = "Save (Ctrl+S)";
    saveButton.onclick = function () { bridge.saveFile(); };
  }

  api.onChange(function () {
    bridge.setDirty(true);
  });

  bridge.on("editor:requestText", function () {
    bridge.replyText({ text: api.getCode(), extension: api.getExtension() });
  });

  bridge.on("file:opened", function (payload) {
    // An extension nobody recognises leaves the language alone rather than
    // dropping the file into JavaScript highlighting without saying so.
    if (payload.language) api.setLanguage(payload.language);
    api.setCode(payload.text);
    api.note("opened " + payload.path +
      (payload.language ? "" : "  (unfamiliar extension - still showing " + api.getLanguage() + ")"));
    bridge.setDirty(false);
  });

  bridge.on("file:saved", function (payload) {
    api.note("saved to " + payload.path);
    bridge.setDirty(false);
  });

  bridge.on("file:new", function () {
    api.setCode("");
    api.note("new file");
    bridge.setDirty(false);
  });

  bridge.on("action:run", function () { api.run(); });
  bridge.on("action:clear", function () { api.clear(); });
  bridge.on("action:sample", function () { api.loadSample(); });

  api.note("desktop build - File menu opens and saves real files");
})();
