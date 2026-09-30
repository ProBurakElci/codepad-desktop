/*
 * Wiring.
 *
 * Reads the snippet out of the link if there is one, otherwise the draft this
 * browser saved, otherwise the example for the language. Then it keeps the
 * editor, the language menu, the output panel and the address bar agreeing
 * with each other.
 */
(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const select = $("#language");
  const badge = $("#run-badge");
  const output = $("#output");
  const preview = $("#preview");
  const status = $("#status");
  const runButton = $("#run");

  let running = null;
  const changeListeners = [];

  /* ---------------- the language menu ---------------- */

  for (const language of Highlight.list()) {
    const option = document.createElement("option");
    option.value = language.id;
    option.textContent = language.name + (language.run ? "  ▸" : "");
    select.appendChild(option);
  }

  /* ---------------- the editor ---------------- */

  const editor = Editor.create({
    textarea: $("#input"),
    layer: $("#layer"),
    gutter: $("#gutter"),
    language: "javascript",
    onChange: function () {
      Share.save(safeStorage(), editor.value, editor.language);
      describe();
      for (const listener of changeListeners) listener();
    },
  });

  function safeStorage() {
    try {
      return window.localStorage;
    } catch (err) {
      return null; // a private window, or storage blocked entirely
    }
  }

  function describe() {
    const lines = editor.value ? editor.value.split("\n").length : 0;
    const chars = editor.value.length;
    status.textContent = lines + " lines · " + chars + " characters";
  }

  /* ---------------- output ---------------- */

  function clearOutput() {
    output.textContent = "";
  }

  function line(kind, text) {
    const div = document.createElement("div");
    div.className = "out-line out-" + kind;
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  function meta(text) {
    const div = document.createElement("div");
    div.className = "out-line out-meta";
    div.textContent = text;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
  }

  function setBusy(busy) {
    runButton.classList.toggle("busy", busy);
    runButton.innerHTML = busy
      ? '<span class="play">■</span> Stop'
      : '<span class="play">▶</span> Run';
  }

  /* ---------------- running ---------------- */

  function run() {
    if (running) {
      running.stop();
      running = null;
      setBusy(false);
      line("note", "stopped");
      return;
    }

    const language = editor.language;
    const ability = Runner.capability(language);
    const code = editor.value;

    if (!ability.runs) {
      preview.hidden = true;
      output.hidden = false;
      clearOutput();
      line("note", Highlight.LANGUAGES[language].name +
        " is highlighted here, not run - there is no compiler for it here.");
      line("note", runnableLanguages() + " run. The ▸ in the menu marks them.");
      return;
    }

    if (ability.how === "html") {
      output.hidden = true;
      preview.hidden = false;
      $("#output-title").textContent = "Preview";
      Runner.runHtml(code, preview);
      return;
    }

    preview.hidden = true;
    output.hidden = false;
    $("#output-title").textContent = "Output";
    clearOutput();
    setBusy(true);

    const handlers = {
      line: line,
      done: function (info) {
        running = null;
        setBusy(false);
        if (!output.childElementCount) line("out-empty", "(no output)");
        meta((info.failed ? "failed" : "finished") + " in " + info.ms + " ms");
      },
    };

    running = ability.how === "python"
      ? Runner.runPython(code, handlers)
      : Runner.runJavaScript(code, handlers);
  }

  /** "JavaScript, Python and HTML" - whichever of them this build can run. */
  function runnableLanguages() {
    const names = Highlight.list().filter((l) => l.run).map((l) => l.name);
    if (names.length === 0) return "Nothing here";
    if (names.length === 1) return names[0];
    return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
  }

  /* ---------------- switching language ---------------- */

  function applyLanguage(id, options) {
    const opts = options || {};
    editor.language = id;
    select.value = id;

    const ability = Runner.capability(id);
    badge.textContent = ability.runs
      ? (ability.how === "html" ? "renders" : "runs here")
      : "highlighting only";
    badge.classList.toggle("can-run", ability.runs);

    runButton.textContent = "";
    setBusy(false);

    if (opts.loadSample) {
      editor.value = Samples.get(id);
      clearOutput();
      preview.hidden = true;
      output.hidden = false;
      $("#output-title").textContent = "Output";
    }

    describe();
  }

  select.addEventListener("change", function () {
    applyLanguage(select.value, { loadSample: true });
    editor.focus();
  });

  /* ---------------- buttons ---------------- */

  runButton.addEventListener("click", run);
  $("#clear").addEventListener("click", function () {
    clearOutput();
    preview.hidden = true;
    output.hidden = false;
    $("#output-title").textContent = "Output";
  });

  $("#sample").addEventListener("click", function () {
    editor.value = Samples.get(editor.language);
    describe();
    editor.focus();
  });

  $("#share").addEventListener("click", function () {
    const url = Share.buildUrl(location.href, editor.value, editor.language);

    if (Share.isTooLongToShare(url)) {
      status.textContent = "too long to put in a link - use Save instead";
      return;
    }

    history.replaceState(null, "", url);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        function () { status.textContent = "link copied - the code travels inside it"; },
        function () { status.textContent = "link is in the address bar"; }
      );
    } else {
      status.textContent = "link is in the address bar";
    }

    setTimeout(describe, 2600);
  });

  $("#download").addEventListener("click", function () {
    const ext = Highlight.LANGUAGES[editor.language].ext || "txt";
    const blob = new Blob([editor.value], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "snippet." + ext;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      $("#download").click();
    }
  });

  /* ---------------- appearance ---------------- */

  /*
   * Three states, the way macOS offers them: follow the system, or pin it one
   * way. "Auto" is the absence of a saved preference rather than a value, so
   * somebody who never touches this keeps following their system even after
   * the browser has been open for a year.
   */
  const THEMES = ["auto", "light", "dark"];
  const THEME_KEY = "codepad.theme";
  const THEME_FACE = {
    auto: { icon: "◐", label: "Appearance follows your system" },
    light: { icon: "☀", label: "Appearance: always light" },
    dark: { icon: "☾", label: "Appearance: always dark" },
  };

  const themeButton = $("#theme");

  function applyTheme(name) {
    if (name === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = name;

    if (!themeButton) return;
    themeButton.textContent = THEME_FACE[name].icon;
    themeButton.title = THEME_FACE[name].label + " - click to change";
    themeButton.setAttribute("aria-label", THEME_FACE[name].label);
  }

  function readTheme() {
    const store = safeStorage();
    if (!store) return "auto";
    try {
      const saved = store.getItem(THEME_KEY);
      return THEMES.indexOf(saved) === -1 ? "auto" : saved;
    } catch (err) {
      return "auto";
    }
  }

  let theme = readTheme();
  applyTheme(theme);

  if (themeButton) {
    themeButton.addEventListener("click", function () {
      theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
      applyTheme(theme);

      const store = safeStorage();
      if (!store) return;
      try {
        if (theme === "auto") store.removeItem(THEME_KEY);
        else store.setItem(THEME_KEY, theme);
      } catch (err) {
        /* a blocked or full store is not worth failing over */
      }
    });
  }

  /* ---------------- start ---------------- */

  const shared = Share.readUrl(location.search);
  const draft = shared ? null : Share.load(safeStorage());
  const startLanguage =
    (shared && shared.language) || (draft && draft.language) || "javascript";

  applyLanguage(Highlight.LANGUAGES[startLanguage] ? startLanguage : "javascript");

  if (shared) {
    editor.value = shared.code;
    line("note", "loaded from the link");
  } else if (draft) {
    editor.value = draft.code;
    line("note", "your last draft, from this browser");
  } else {
    editor.value = Samples.get(editor.language);
    line("note", "press Run, or Ctrl+Enter");
  }

  describe();
  editor.focus();

  /*
   * A small surface for the builds that wrap this page - the desktop app and
   * the Android one. In a plain browser nothing ever calls it, and the page
   * behaves exactly as before.
   */
  window.codepad = {
    run: run,
    clear: function () { document.querySelector("#clear").click(); },
    loadSample: function () {
      editor.value = Samples.get(editor.language);
      describe();
    },
    getCode: function () { return editor.value; },
    setCode: function (text) {
      editor.value = text == null ? "" : String(text);
      describe();
    },
    getLanguage: function () { return editor.language; },
    setLanguage: function (id) {
      if (Highlight.LANGUAGES[id]) applyLanguage(id);
    },
    getExtension: function () {
      return (Highlight.LANGUAGES[editor.language] || {}).ext || "txt";
    },
    note: function (text) { line("note", text); },
    onChange: function (fn) {
      if (typeof fn === "function") changeListeners.push(fn);
    },
  };
})();
