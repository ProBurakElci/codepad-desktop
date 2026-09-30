/*
 * The editor.
 *
 * A textarea sits on top of a highlighted copy of the same text, in the same
 * font, at the same size, scrolled together. The textarea handles every bit of
 * text editing the browser already does well - selection, undo, IME, mobile
 * keyboards, accessibility - and the layer underneath only has to be coloured
 * in. Nothing here re-implements a caret, which is where hand-written editors
 * usually go wrong.
 *
 * The three things it does add are the ones a plain textarea gets wrong for
 * code: Tab inserts spaces instead of leaving the field, Enter keeps the
 * current indentation, and brackets and quotes close themselves.
 */
(function (global) {
  "use strict";

  const INDENT = "  ";
  const PAIRS = { "(": ")", "[": "]", "{": "}", "\"": "\"", "'": "'", "`": "`" };
  const CLOSERS = new Set([")", "]", "}", "\"", "'", "`"]);

  function create(options) {
    const textarea = options.textarea;
    const layer = options.layer;
    const gutter = options.gutter;
    let language = options.language || "javascript";
    const onChange = options.onChange || function () {};

    /*
     * The band behind the line the caret is on, the way Xcode marks it. It is
     * created here rather than expected in the markup so that every build -
     * page, desktop window, phone - gets it without three copies of the same
     * <div>. If there is no parent to put it in, everything below simply
     * skips it.
     */
    let caretLine = null;
    const codeBox = textarea.parentNode;
    if (codeBox && codeBox.appendChild) {
      caretLine = document.createElement("div");
      caretLine.className = "caret-line";
      caretLine.hidden = true;
      codeBox.insertBefore(caretLine, codeBox.firstChild);
    }

    /** The line the caret is on, counting from zero. */
    function caretRow() {
      let row = 0;
      const upto = textarea.selectionStart;
      for (let i = 0; i < upto; i++) {
        if (textarea.value.charCodeAt(i) === 10) row++;
      }
      return row;
    }

    let shownRow = -1;
    let lineCount = 0;

    function paint() {
      const code = textarea.value;

      // A trailing newline would otherwise collapse and the last line would
      // sit half a row out of step with the textarea.
      layer.innerHTML = global.Highlight.toHtml(code + "\n", language);

      lineCount = code.split("\n").length;
      shownRow = -1; // the gutter is about to be rebuilt, so nothing is marked
      markCaret();
      sync();
    }

    /**
     * Moves the band and brightens the current line number.
     *
     * The gutter is only rebuilt when the caret actually changes line, so
     * arrowing along one line costs nothing.
     */
    function markCaret() {
      const row = caretRow();
      if (row === shownRow) {
        placeBand(row);
        return;
      }
      shownRow = row;

      let numbers = "";
      for (let i = 1; i <= lineCount; i++) {
        // numbers only, so there is nothing here that needs escaping
        numbers += i === row + 1 ? '<b class="on">' + i + "</b>\n" : i + "\n";
      }
      gutter.innerHTML = numbers;

      placeBand(row);
    }

    /*
     * Reading these back out of the browser costs a layout, and the band
     * moves on every scroll event, so they are read once and kept until
     * something that could change them happens.
     */
    let metrics = null;

    function readMetrics() {
      const style = window.getComputedStyle(textarea);
      const height = parseFloat(style.lineHeight);
      metrics = height
        ? { height: height, top: parseFloat(style.paddingTop) || 0 }
        : null; // line-height: normal, so there is no reliable number
    }

    function placeBand(row) {
      if (!caretLine) return;

      // While text is selected the band only gets in the way of seeing it.
      if (textarea.selectionStart !== textarea.selectionEnd) {
        caretLine.hidden = true;
        return;
      }

      if (!metrics) readMetrics();
      if (!metrics) return;

      caretLine.style.height = metrics.height + "px";
      caretLine.style.top =
        (metrics.top + row * metrics.height - textarea.scrollTop) + "px";
      caretLine.hidden = false;
    }

    function sync() {
      layer.scrollTop = textarea.scrollTop;
      layer.scrollLeft = textarea.scrollLeft;
      gutter.scrollTop = textarea.scrollTop;
      placeBand(shownRow < 0 ? 0 : shownRow);
    }

    function setSelection(start, end) {
      textarea.selectionStart = start;
      textarea.selectionEnd = end === undefined ? start : end;
    }

    /** Replaces the selection and keeps undo working by using the browser's own edit. */
    function insert(text, selectStart, selectEnd) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      if (document.execCommand) {
        // deprecated, and still the only way to insert text without throwing
        // away the undo history in every browser that matters
        document.execCommand("insertText", false, text);
      } else {
        textarea.setRangeText(text, start, end, "end");
      }

      if (selectStart !== undefined) {
        setSelection(start + selectStart, start + (selectEnd === undefined ? selectStart : selectEnd));
      }

      paint();
      onChange();
    }

    function currentIndent() {
      const upto = textarea.value.slice(0, textarea.selectionStart);
      const line = upto.slice(upto.lastIndexOf("\n") + 1);
      const match = /^[ \t]*/.exec(line);
      return match ? match[0] : "";
    }

    textarea.addEventListener("input", function () {
      paint();
      onChange();
    });
    textarea.addEventListener("scroll", sync);

    /*
     * Everything that can move the caret without changing the text. The band
     * and the highlighted line number follow it.
     */
    for (const event of ["keyup", "mouseup", "select", "focus", "click"]) {
      textarea.addEventListener(event, markCaret);
    }
    textarea.addEventListener("blur", function () {
      if (caretLine) caretLine.hidden = true;
    });

    // The font and its line height can change with the window - a different
    // size class, or the page being zoomed.
    window.addEventListener("resize", function () {
      metrics = null;
      placeBand(shownRow < 0 ? 0 : shownRow);
    });

    textarea.addEventListener("keydown", function (event) {
      // Tab indents instead of walking out of the field. Shift+Tab outdents.
      if (event.key === "Tab") {
        event.preventDefault();

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const value = textarea.value;

        if (start !== end || event.shiftKey) {
          const from = value.lastIndexOf("\n", start - 1) + 1;
          const to = end;
          const block = value.slice(from, to);

          const changed = event.shiftKey
            ? block.replace(/^[ ]{1,2}/gm, "")
            : block.replace(/^/gm, INDENT);

          textarea.setSelectionRange(from, to);
          insert(changed);
          textarea.setSelectionRange(from, from + changed.length);
          paint();
          return;
        }

        insert(INDENT);
        return;
      }

      // Enter keeps the indentation, and opens a block when it should.
      if (event.key === "Enter") {
        const before = textarea.value[textarea.selectionStart - 1];
        const after = textarea.value[textarea.selectionStart];
        const indent = currentIndent();

        if (before === "{" || before === "[" || before === "(") {
          event.preventDefault();
          const inner = indent + INDENT;
          if (after && CLOSERS.has(after)) {
            insert("\n" + inner + "\n" + indent, 1 + inner.length);
          } else {
            insert("\n" + inner);
          }
          return;
        }

        if (indent) {
          event.preventDefault();
          insert("\n" + indent);
          return;
        }
        return;
      }

      // Typing a closer that is already there just steps over it.
      if (CLOSERS.has(event.key) && textarea.value[textarea.selectionStart] === event.key) {
        event.preventDefault();
        setSelection(textarea.selectionStart + 1);
        return;
      }

      // Opening a pair closes it, but not in the middle of a word.
      if (PAIRS[event.key]) {
        const next = textarea.value[textarea.selectionStart] || "";
        const selected = textarea.selectionStart !== textarea.selectionEnd;
        if (!selected && (next === "" || /[\s)\]},;]/.test(next))) {
          event.preventDefault();
          insert(event.key + PAIRS[event.key], 1);
          return;
        }
      }

      // Backspace over an empty pair removes both halves.
      if (event.key === "Backspace" && textarea.selectionStart === textarea.selectionEnd) {
        const before = textarea.value[textarea.selectionStart - 1];
        const after = textarea.value[textarea.selectionStart];
        if (before && PAIRS[before] === after) {
          event.preventDefault();
          textarea.setSelectionRange(textarea.selectionStart - 1, textarea.selectionStart + 1);
          insert("");
          return;
        }
      }
    });

    return {
      paint: paint,
      get value() { return textarea.value; },
      set value(text) {
        textarea.value = text;
        paint();
      },
      get language() { return language; },
      set language(id) {
        language = id;
        paint();
      },
      focus: function () { textarea.focus(); },
      insert: insert,
    };
  }

  global.Editor = { create: create, INDENT: INDENT, PAIRS: PAIRS };
})(typeof window !== "undefined" ? window : globalThis);
