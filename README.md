# codepad — desktop

A small code editor that opens and saves real files on your machine, and runs
JavaScript, Python and HTML without asking anyone's permission.

Seventeen languages are highlighted. Three of them actually run. Nothing you
write leaves the machine.

```
File  Edit  Run  View  Help
────────────────────────────────────────
  1  function weeks(birthday) {
  2    const ms = Date.now() - +new Date(birthday);
  3    return Math.floor(ms / 6048e5);
  4  }
  5
  6  console.log(weeks("1998-04-12"), "weeks so far");
────────────────────────────────────────
Output
  1434 weeks so far
  finished in 3 ms
```

There is a browser version of the same editor at
**[proburakelci.github.io/codepad](https://proburakelci.github.io/codepad/)** —
no install, and it shares snippets through the address bar. This one is for
when you want a window on your taskbar and files on your disk.

## Install

Download the file for your machine from the
[releases page](https://github.com/ProBurakElci/codepad-desktop/releases):

| You have | Download |
| --- | --- |
| Windows | `codepad-Setup-x.y.z.exe`, or the `portable` build if you would rather not install anything |
| macOS | `codepad-x.y.z.dmg` |
| Linux | `codepad-x.y.z.AppImage` (`chmod +x` it and double-click), or the `.deb` |

Or run it from the source, which needs nothing but Node:

```bash
git clone https://github.com/ProBurakElci/codepad-desktop
cd codepad-desktop
npm install
npm start
```

## What it does

**Files.** `Ctrl+O` opens, `Ctrl+S` saves back to the same path, `Ctrl+Shift+S`
saves somewhere new. The language follows the extension — open a `.rs` file and
you get Rust highlighting. The title bar shows a dot while there is unsaved
work, and closing the window with unsaved work asks before throwing it away.
Recently opened files are in the File menu.

**Running.** `Ctrl+Enter` runs what is in the editor.

- **JavaScript** runs in a Web Worker. `console.log` appears in the output
  panel, and so does the value of the last expression. An endless loop is
  stopped after five seconds instead of taking the window with it.
- **HTML** renders in a sandboxed frame next to the editor, and the CSS and
  JavaScript inside it work.
- **Python** runs as real CPython, compiled to WebAssembly. The first Run
  downloads it (about 10 MB) and needs a connection for that one download;
  after that it is cached.

**Highlighted, not run:** TypeScript, Java, C, C#, Go, Rust, PHP, Ruby, SQL,
Shell, CSS, JSON, YAML and Markdown. The app says so plainly when you press Run
on one of them rather than pretending to compile it.

## What it does not do

It does not phone home. There is no analytics, no crash reporting, no update
check, no account. The window that shows the editor has no access to Node, no
access to the filesystem, and its own isolated context — because it is the
window that runs whatever code you paste into it. Everything that can touch
your disk lives in `main.js` behind seven named messages, listed in
`preload.js`.

The one thing that reaches the internet is the Python runtime, once, the first
time you press Run on Python, and only then.

## Keyboard

| | |
| --- | --- |
| `Ctrl+Enter` | Run |
| `Ctrl+K` | Clear the output |
| `Ctrl+O` | Open a file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save as |
| `Ctrl+N` | New file |
| `Tab` / `Shift+Tab` | Indent / outdent the selection |

On macOS, `Cmd` instead of `Ctrl`.

## Building an installer yourself

```bash
npm run dist
```

That fetches `electron-builder` on demand — it is not a dependency of this
repo, so a clone stays small and `npm test` needs nothing installed. The
results land in `release/`. Building for a different operating system than the
one you are on mostly does not work; the release workflow in
`.github/workflows/release.yml` builds all three on GitHub's machines instead.

## Tests

```bash
npm test     # runs anywhere, including CI with no screen
npm run smoke   # opens the real app and drives it - needs a desktop
```

`npm test` covers the things a desktop app has no user interface to catch:
every extension maps to a language the editor actually has, no extension is
claimed by two languages, the preload exposes exactly seven channels and no
more, and the bundled copy of the editor has not drifted from the web one.

`npm run smoke` starts Electron for real, loads a file, presses Run, reads the
output back, and checks that the window cannot reach Node and stays responsive
through an endless loop.

## The editor itself

`app/` is the browser version of codepad, unchanged, plus one extra file:
`app/js/desktop.js`. That file returns immediately if it cannot find the app
around it, which is how the same editor runs both in a window and on a web
page. The web repo is
[ProBurakElci/codepad](https://github.com/ProBurakElci/codepad).

## Licence

MIT. Do what you like with it.
