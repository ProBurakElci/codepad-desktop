/*
 * The sandbox.
 *
 * Code typed into the editor runs here, in a worker, and never on the page.
 * A worker has no document, no window and no access to the page's DOM, so the
 * worst a snippet can do to the site around it is nothing. If it loops forever,
 * the page terminates this whole worker - which is the only way to stop a busy
 * loop in JavaScript, and the reason running it in the page would be a bad idea.
 */
"use strict";

/** Turns any value into something readable, without exploding on cycles. */
function display(value, depth) {
  const level = depth || 0;

  if (value === null) return "null";
  if (value === undefined) return "undefined";

  const type = typeof value;

  if (type === "string") return level === 0 ? value : JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "function") return value.name ? "[Function: " + value.name + "]" : "[Function]";
  if (type === "symbol") return value.toString();

  if (value instanceof Error) return value.name + ": " + value.message;

  if (level > 4) return "...";

  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    const parts = value.slice(0, 100).map((item) => display(item, level + 1));
    if (value.length > 100) parts.push("... " + (value.length - 100) + " more");
    return "[ " + parts.join(", ") + " ]";
  }

  if (value instanceof Map) {
    const parts = [];
    for (const [k, v] of value) {
      parts.push(display(k, level + 1) + " => " + display(v, level + 1));
      if (parts.length >= 50) break;
    }
    return "Map(" + value.size + ") { " + parts.join(", ") + " }";
  }

  if (value instanceof Set) {
    const parts = [];
    for (const item of value) {
      parts.push(display(item, level + 1));
      if (parts.length >= 50) break;
    }
    return "Set(" + value.size + ") { " + parts.join(", ") + " }";
  }

  try {
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    const parts = keys.slice(0, 50).map((key) => key + ": " + display(value[key], level + 1));
    if (keys.length > 50) parts.push("... " + (keys.length - 50) + " more");
    return "{ " + parts.join(", ") + " }";
  } catch (err) {
    return String(value);
  }
}

function send(kind, parts) {
  self.postMessage({
    kind: kind,
    text: parts.map((part) => display(part, 0)).join(" "),
  });
}

// Everything the snippet prints is forwarded to the page and shown in order.
console.log = function () { send("log", Array.prototype.slice.call(arguments)); };
console.info = console.log;
console.debug = console.log;
console.warn = function () { send("warn", Array.prototype.slice.call(arguments)); };
console.error = function () { send("error", Array.prototype.slice.call(arguments)); };
console.table = console.log;

self.addEventListener("unhandledrejection", function (event) {
  send("error", ["Unhandled promise rejection:", event.reason]);
});

self.onmessage = function (event) {
  const code = event.data && event.data.code;
  if (typeof code !== "string") return;

  const started = Date.now();

  try {
    // indirect eval, so the snippet gets the worker's global scope and not
    // this function's local variables
    const result = (0, eval)(code);

    // A top-level promise is waited for, otherwise "done" would arrive before
    // the interesting part of an async snippet had run.
    if (result && typeof result.then === "function") {
      result.then(
        function (value) {
          if (value !== undefined) send("result", [value]);
          self.postMessage({ kind: "done", ms: Date.now() - started });
        },
        function (error) {
          send("error", [error]);
          self.postMessage({ kind: "done", ms: Date.now() - started });
        }
      );
      return;
    }

    if (result !== undefined) send("result", [result]);
    self.postMessage({ kind: "done", ms: Date.now() - started });
  } catch (error) {
    send("error", [error]);
    self.postMessage({ kind: "done", ms: Date.now() - started, failed: true });
  }
};
