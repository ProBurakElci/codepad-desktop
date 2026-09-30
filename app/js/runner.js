/*
 * Running things.
 *
 * Three languages actually run here, and the page says plainly which:
 *   JavaScript - in a worker, terminated if it exceeds the time limit
 *   HTML       - rendered in a sandboxed frame
 *   Python     - by Pyodide, downloaded from a CDN the first time it is asked for
 *
 * Everything else is highlighted and not run. Pretending otherwise would be
 * worse than saying so.
 */
(function (global) {
  "use strict";

  const TIMEOUT = 5000;
  const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js";

  /* ---------------- JavaScript ---------------- */

  function runJavaScript(code, handlers, options) {
    const opts = options || {};
    const limit = opts.timeout || TIMEOUT;

    let worker;
    try {
      worker = new Worker(opts.workerUrl || "worker.js");
    } catch (err) {
      handlers.line("error", "Could not start the sandbox: " + err.message);
      handlers.done({ ms: 0, failed: true });
      return { stop: function () {} };
    }

    let finished = false;
    const started = Date.now();

    const stop = function (reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      worker.terminate();
      if (reason) {
        handlers.line("error", reason);
        handlers.done({ ms: Date.now() - started, failed: true });
      }
    };

    // The only way to stop a busy loop is to kill the worker it is running in.
    const timer = setTimeout(function () {
      stop("Stopped after " + (limit / 1000) + " seconds - it was still running.");
    }, limit);

    worker.onmessage = function (event) {
      const message = event.data || {};
      if (message.kind === "done") {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        worker.terminate();
        handlers.done({ ms: message.ms, failed: !!message.failed });
        return;
      }
      handlers.line(message.kind, message.text);
    };

    worker.onerror = function (event) {
      stop(event.message || "The sandbox failed.");
    };

    worker.postMessage({ code: code });

    return { stop: function () { stop(null); } };
  }

  /* ---------------- HTML ---------------- */

  /**
   * Renders into a sandboxed frame. `allow-scripts` without `allow-same-origin`
   * means the preview can run its own scripts but cannot read this page, its
   * storage, or anything else of yours.
   */
  function runHtml(code, frame) {
    if (!frame) return;
    frame.setAttribute("sandbox", "allow-scripts allow-modals allow-forms allow-popups");
    frame.setAttribute("srcdoc", code);
  }

  /* ---------------- Python ---------------- */

  let pyodidePromise = null;

  function loadPyodide(onProgress) {
    if (pyodidePromise) return pyodidePromise;

    pyodidePromise = new Promise(function (resolve, reject) {
      if (onProgress) onProgress("Downloading Python (about 10 MB, once)...");

      const script = document.createElement("script");
      script.src = PYODIDE;
      script.onload = function () {
        if (onProgress) onProgress("Starting Python...");
        global.loadPyodide({ indexURL: PYODIDE.replace(/pyodide\.js$/, "") })
          .then(resolve, reject);
      };
      script.onerror = function () {
        pyodidePromise = null;
        reject(new Error("Could not download Python. Check the connection and try again."));
      };
      document.head.appendChild(script);
    });

    return pyodidePromise;
  }

  function runPython(code, handlers) {
    let stopped = false;

    loadPyodide(function (message) { handlers.line("note", message); }).then(
      function (pyodide) {
        if (stopped) return;
        const started = Date.now();

        try {
          // print() and anything on stderr are routed into the same panel as
          // console.log is for JavaScript, so both languages read the same.
          pyodide.setStdout({ batched: function (text) { handlers.line("log", text); } });
          pyodide.setStderr({ batched: function (text) { handlers.line("error", text); } });

          const result = pyodide.runPython(code);
          if (result !== undefined && result !== null) {
            handlers.line("result", String(result));
          }
          handlers.done({ ms: Date.now() - started });
        } catch (error) {
          handlers.line("error", String(error.message || error));
          handlers.done({ ms: Date.now() - started, failed: true });
        }
      },
      function (error) {
        if (stopped) return;
        handlers.line("error", error.message || String(error));
        handlers.done({ ms: 0, failed: true });
      }
    );

    return { stop: function () { stopped = true; } };
  }

  /* ---------------- what a language can do ---------------- */

  function capability(languageId) {
    const language = global.Highlight.LANGUAGES[languageId];
    if (!language) return { runs: false, how: null };
    return { runs: !!language.run, how: language.run };
  }

  const Runner = {
    TIMEOUT: TIMEOUT,
    runJavaScript: runJavaScript,
    runHtml: runHtml,
    runPython: runPython,
    capability: capability,
  };

  global.Runner = Runner;
  if (typeof module !== "undefined" && module.exports) module.exports = Runner;
})(typeof window !== "undefined" ? window : globalThis);
