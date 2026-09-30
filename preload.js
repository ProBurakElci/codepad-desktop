/*
 * The only bridge between the window and the machine.
 *
 * The window runs code the user typed, so it gets exactly these six functions
 * and nothing else - no fs, no child_process, no ipcRenderer itself. Anything
 * a snippet might reach for simply is not there.
 */
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,

  // asking the app to do something
  openFile: () => ipcRenderer.invoke("file:open"),
  saveFile: () => ipcRenderer.invoke("file:save"),
  saveFileAs: () => ipcRenderer.invoke("file:saveAs"),
  newFile: () => ipcRenderer.invoke("file:new"),
  setDirty: (value) => ipcRenderer.send("editor:dirty", !!value),

  // the app asking the window for something, or telling it what happened
  on: (channel, handler) => {
    const allowed = [
      "file:opened", "file:saved", "file:new",
      "editor:requestText",
      "action:run", "action:clear", "action:sample",
    ];
    if (allowed.indexOf(channel) === -1) return;
    ipcRenderer.on(channel, (event, payload) => handler(payload));
  },

  replyText: (payload) => ipcRenderer.send("editor:text", payload),
});
