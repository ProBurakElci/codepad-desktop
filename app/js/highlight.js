/*
 * Syntax highlighting, written from scratch.
 *
 * One tokeniser walks the text once, driven by a small description of each
 * language: what a comment looks like, which quotes start a string, which
 * words are keywords. That is enough to make seventeen languages readable
 * without shipping a parser for any of them.
 *
 * It is deliberately not a parser. It will not catch every edge of every
 * grammar, and it does not try to - the job is "this reads like code", not
 * "this is a compiler front end".
 *
 * The one thing it must never get wrong is escaping: everything that comes out
 * of here goes into innerHTML, so text that looks like a tag has to arrive as
 * text.
 */
(function (global) {
  "use strict";

  const C_LIKE_KEYWORDS =
    "if else for while do switch case default break continue return goto";

  /*
   * run: how the Run button treats this language.
   *   "js"     - executed in a worker, for real
   *   "html"   - rendered in a sandboxed frame
   *   "python" - executed by Pyodide, downloaded the first time it is needed
   *   null     - highlighting only, and the page says so rather than pretending
   */
  const LANGUAGES = {
    javascript: {
      name: "JavaScript",
      run: "js",
      ext: "js",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'", "`"],
      keywords: "const let var function return if else for while do switch case break continue new class extends super this typeof instanceof in of delete void await async yield try catch finally throw default export import from as static get set",
      literals: "true false null undefined NaN Infinity",
      builtins: "console Math JSON Object Array String Number Boolean Promise Map Set Date RegExp Error parseInt parseFloat isNaN setTimeout setInterval fetch document window",
    },
    typescript: {
      name: "TypeScript",
      run: null,
      ext: "ts",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'", "`"],
      keywords: "const let var function return if else for while do switch case break continue new class extends implements interface type enum namespace declare super this typeof instanceof in of delete void await async yield try catch finally throw default export import from as public private protected readonly static get set",
      literals: "true false null undefined any unknown never void string number boolean",
      builtins: "console Math JSON Object Array String Number Boolean Promise Map Set Date RegExp Error",
    },
    python: {
      name: "Python",
      run: "python",
      ext: "py",
      line: "#", blockStart: null, blockEnd: null,
      quotes: ["\"", "'"],
      keywords: "def class return if elif else for while break continue import from as pass with lambda yield global nonlocal try except finally raise assert del in is not and or async await match case",
      literals: "True False None",
      builtins: "print len range str int float list dict set tuple sum min max abs sorted enumerate zip open input type isinstance map filter round",
    },
    html: {
      name: "HTML",
      run: "html",
      ext: "html",
      markup: true,
    },
    css: {
      name: "CSS",
      run: null,
      ext: "css",
      line: null, blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "import media supports keyframes font-face charset namespace",
      literals: "inherit initial unset none auto",
      builtins: "",
      css: true,
    },
    json: {
      name: "JSON",
      run: null,
      ext: "json",
      line: null, blockStart: null, blockEnd: null,
      quotes: ["\""],
      keywords: "",
      literals: "true false null",
      builtins: "",
    },
    sql: {
      name: "SQL",
      run: null,
      ext: "sql",
      line: "--", blockStart: "/*", blockEnd: "*/",
      quotes: ["'", "\""],
      keywords: "select from where insert into values update set delete create table drop alter add column primary key foreign references join inner left right outer on group by order having limit offset distinct as and or not null like between exists union all case when then else end",
      literals: "true false null",
      builtins: "count sum avg min max coalesce cast now",
      caseInsensitive: true,
    },
    java: {
      name: "Java",
      run: null,
      ext: "java",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "public private protected class interface extends implements static final abstract void new this super package import throws throw try catch finally synchronized " + C_LIKE_KEYWORDS,
      literals: "true false null",
      builtins: "String System Integer Double Boolean List Map ArrayList HashMap Object Math",
    },
    c: {
      name: "C / C++",
      run: null,
      ext: "c",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "include define ifdef ifndef endif struct union enum typedef static const extern sizeof class public private protected template namespace using new delete virtual override " + C_LIKE_KEYWORDS,
      literals: "true false NULL nullptr",
      builtins: "int char float double long short unsigned signed void bool printf scanf malloc free std cout cin string vector",
    },
    csharp: {
      name: "C#",
      run: null,
      ext: "cs",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "using namespace class struct interface public private protected internal static readonly const virtual override abstract sealed new this base var out ref params try catch finally throw " + C_LIKE_KEYWORDS,
      literals: "true false null",
      builtins: "string int double bool float decimal object Console List Dictionary Task",
    },
    go: {
      name: "Go",
      run: null,
      ext: "go",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'", "`"],
      keywords: "package import func var const type struct interface map chan go defer select range " + C_LIKE_KEYWORDS,
      literals: "true false nil iota",
      builtins: "string int int64 float64 bool byte rune error len cap make new append copy delete panic recover fmt",
    },
    rust: {
      name: "Rust",
      run: null,
      ext: "rs",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "fn let mut const static struct enum impl trait pub use mod crate self super where match loop while for in if else return break continue as dyn ref move unsafe async await",
      literals: "true false None Some Ok Err",
      builtins: "String str Vec Option Result Box HashMap i32 i64 u32 u64 f64 usize bool char println print",
    },
    php: {
      name: "PHP",
      run: null,
      ext: "php",
      line: "//", blockStart: "/*", blockEnd: "*/",
      quotes: ["\"", "'"],
      keywords: "function class extends implements public private protected static const new echo print require include namespace use try catch finally throw " + C_LIKE_KEYWORDS + " foreach as endforeach endif",
      literals: "true false null TRUE FALSE NULL",
      builtins: "array count strlen str_replace implode explode isset unset var_dump print_r json_encode json_decode",
    },
    ruby: {
      name: "Ruby",
      run: null,
      ext: "rb",
      line: "#", blockStart: null, blockEnd: null,
      quotes: ["\"", "'"],
      keywords: "def class module end if elsif else unless while until for in do begin rescue ensure raise return yield require require_relative attr_accessor attr_reader attr_writer self super then case when",
      literals: "true false nil",
      builtins: "puts print p gets String Integer Float Array Hash Symbol each map select reject length size",
    },
    shell: {
      name: "Shell",
      run: null,
      ext: "sh",
      line: "#", blockStart: null, blockEnd: null,
      quotes: ["\"", "'"],
      keywords: "if then elif else fi for while do done case esac function return export local source alias in",
      literals: "true false",
      builtins: "echo cd ls cat grep sed awk mkdir rm cp mv chmod curl git npm node sudo apt pwd touch find",
    },
    yaml: {
      name: "YAML",
      run: null,
      ext: "yml",
      line: "#", blockStart: null, blockEnd: null,
      quotes: ["\"", "'"],
      keywords: "",
      literals: "true false null yes no on off",
      builtins: "",
    },
    markdown: {
      name: "Markdown",
      run: null,
      ext: "md",
      line: null, blockStart: null, blockEnd: null,
      quotes: [],
      keywords: "",
      literals: "",
      builtins: "",
      markdown: true,
    },
  };

  const WORD_START = /[A-Za-z_$]/;
  const WORD_PART = /[A-Za-z0-9_$]/;
  const DIGIT = /[0-9]/;

  function wordSet(text) {
    const set = new Set();
    for (const word of String(text || "").split(/\s+/)) {
      if (word) set.add(word);
    }
    return set;
  }

  /** Prepares the lookup tables once per language rather than per token. */
  const prepared = Object.create(null);
  function spec(id) {
    if (prepared[id]) return prepared[id];
    const language = LANGUAGES[id] || LANGUAGES.javascript;
    prepared[id] = Object.assign({}, language, {
      keywordSet: wordSet(language.keywords),
      literalSet: wordSet(language.literals),
      builtinSet: wordSet(language.builtins),
    });
    return prepared[id];
  }

  /* ---------------- markup and markdown get their own walk ---------------- */

  function tokenizeMarkup(code) {
    const tokens = [];
    let i = 0;
    let text = "";

    const flush = () => {
      if (text) {
        tokens.push({ type: "text", value: text });
        text = "";
      }
    };

    while (i < code.length) {
      if (code.startsWith("<!--", i)) {
        flush();
        const end = code.indexOf("-->", i + 4);
        const stop = end === -1 ? code.length : end + 3;
        tokens.push({ type: "comment", value: code.slice(i, stop) });
        i = stop;
        continue;
      }

      if (code[i] === "<") {
        flush();
        let j = i + 1;
        while (j < code.length && code[j] !== ">") {
          // a quoted attribute may contain a > and must not end the tag
          if (code[j] === "\"" || code[j] === "'") {
            const quote = code[j++];
            while (j < code.length && code[j] !== quote) j++;
          }
          j++;
        }
        const raw = code.slice(i, Math.min(j + 1, code.length));
        tokens.push.apply(tokens, splitTag(raw));
        i = j + 1;
        continue;
      }

      text += code[i++];
    }

    flush();
    return tokens;
  }

  /** Inside a tag: the name is one colour, attributes another, values another. */
  function splitTag(raw) {
    const out = [];
    const match = /^<\/?\s*([A-Za-z0-9-]*)/.exec(raw);
    const nameEnd = match ? match[0].length : 1;

    out.push({ type: "tag", value: raw.slice(0, nameEnd) });

    let rest = raw.slice(nameEnd);
    const pattern = /([A-Za-z-:@]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)?/g;
    let last = 0;
    let m;

    while ((m = pattern.exec(rest)) !== null) {
      if (m.index > last) out.push({ type: "tag", value: rest.slice(last, m.index) });
      out.push({ type: "attr", value: m[1] });
      out.push({ type: "tag", value: m[2] });
      if (m[3]) out.push({ type: "string", value: m[3] });
      last = m.index + m[0].length;
    }

    if (last < rest.length) out.push({ type: "tag", value: rest.slice(last) });
    return out;
  }

  function tokenizeMarkdown(code) {
    const tokens = [];
    for (const line of code.split("\n")) {
      if (/^\s*#{1,6}\s/.test(line)) tokens.push({ type: "keyword", value: line });
      else if (/^\s*([-*+]|\d+\.)\s/.test(line)) tokens.push({ type: "builtin", value: line });
      else if (/^\s*>/.test(line)) tokens.push({ type: "comment", value: line });
      else if (/^\s*```/.test(line)) tokens.push({ type: "string", value: line });
      else tokens.push({ type: "text", value: line });
      tokens.push({ type: "text", value: "\n" });
    }
    if (tokens.length) tokens.pop();
    return tokens;
  }

  /* ---------------- the general walk ---------------- */

  function tokenize(code, languageId) {
    const language = spec(languageId);
    const source = String(code == null ? "" : code);

    if (language.markup) return tokenizeMarkup(source);
    if (language.markdown) return tokenizeMarkdown(source);

    const tokens = [];
    let i = 0;
    let plain = "";

    const flush = () => {
      if (plain) {
        tokens.push({ type: "text", value: plain });
        plain = "";
      }
    };

    while (i < source.length) {
      const rest = source.slice(i);

      // line comment
      if (language.line && rest.startsWith(language.line)) {
        flush();
        const end = source.indexOf("\n", i);
        const stop = end === -1 ? source.length : end;
        tokens.push({ type: "comment", value: source.slice(i, stop) });
        i = stop;
        continue;
      }

      // block comment
      if (language.blockStart && rest.startsWith(language.blockStart)) {
        flush();
        const end = source.indexOf(language.blockEnd, i + language.blockStart.length);
        const stop = end === -1 ? source.length : end + language.blockEnd.length;
        tokens.push({ type: "comment", value: source.slice(i, stop) });
        i = stop;
        continue;
      }

      // string
      if (language.quotes && language.quotes.indexOf(source[i]) !== -1) {
        flush();
        const quote = source[i];
        let j = i + 1;
        while (j < source.length) {
          if (source[j] === "\\") { j += 2; continue; }
          if (source[j] === quote) { j++; break; }
          // a single-quoted or double-quoted string does not cross a line
          if (source[j] === "\n" && quote !== "`") break;
          j++;
        }
        tokens.push({ type: "string", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // number
      if (DIGIT.test(source[i]) && !WORD_PART.test(source[i - 1] || "")) {
        flush();
        let j = i;
        while (j < source.length && /[0-9a-fA-FxX._]/.test(source[j])) j++;
        tokens.push({ type: "number", value: source.slice(i, j) });
        i = j;
        continue;
      }

      // word
      if (WORD_START.test(source[i])) {
        let j = i;
        while (j < source.length && WORD_PART.test(source[j])) j++;
        const word = source.slice(i, j);
        const lookup = language.caseInsensitive ? word.toLowerCase() : word;

        let type = null;
        if (language.keywordSet.has(lookup)) type = "keyword";
        else if (language.literalSet.has(lookup)) type = "literal";
        else if (language.builtinSet.has(lookup)) type = "builtin";
        else if (source[j] === "(") type = "call";
        else if (language.css && source[j] === ":") type = "attr";

        if (type) {
          flush();
          tokens.push({ type: type, value: word });
        } else {
          plain += word;
        }
        i = j;
        continue;
      }

      plain += source[i++];
    }

    flush();
    return tokens;
  }

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };

  /**
   * Everything here ends up in innerHTML, so this is the function that decides
   * whether typing <script> into the editor writes a script tag into the page.
   * It must not be skipped for any token type.
   */
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
  }

  function toHtml(code, languageId) {
    const tokens = tokenize(code, languageId);
    let html = "";
    for (const token of tokens) {
      const safe = escapeHtml(token.value);
      html += token.type === "text" ? safe : '<span class="t-' + token.type + '">' + safe + "</span>";
    }
    return html;
  }

  /** The text back out of the tokens, which must equal what went in. */
  function plainText(tokens) {
    let out = "";
    for (const token of tokens) out += token.value;
    return out;
  }

  function list() {
    return Object.keys(LANGUAGES).map((id) => ({
      id: id,
      name: LANGUAGES[id].name,
      run: LANGUAGES[id].run,
      ext: LANGUAGES[id].ext,
    }));
  }

  const Highlight = {
    LANGUAGES: LANGUAGES,
    tokenize: tokenize,
    toHtml: toHtml,
    escapeHtml: escapeHtml,
    plainText: plainText,
    list: list,
  };

  global.Highlight = Highlight;
  if (typeof module !== "undefined" && module.exports) module.exports = Highlight;
})(typeof window !== "undefined" ? window : globalThis);
