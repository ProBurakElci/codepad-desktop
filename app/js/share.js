/*
 * Putting the code in the link.
 *
 * There is no server, so a shared snippet has to travel inside the URL itself.
 * The text is UTF-8 encoded, base64'd, and then made URL-safe, which survives
 * chat apps that would otherwise eat a + or a /.
 *
 * Nothing is uploaded and nothing is stored anywhere except the address bar
 * and, if you ask for it, this browser's own localStorage.
 */
(function (global) {
  "use strict";

  // Browsers past a certain length quietly refuse to navigate; warn before then.
  const SAFE_URL_LENGTH = 8000;

  function toBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function fromBase64(text) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(text, "base64"));
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  /** Text to a URL-safe payload. */
  function encode(text) {
    const bytes = new TextEncoder().encode(String(text == null ? "" : text));
    return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /**
   * Payload back to text. Returns null rather than throwing on rubbish.
   *
   * Both guards below are load-bearing. Base64 decoders are famously tolerant:
   * Node's quietly skips characters it does not recognise, so "!!!not base64!!!"
   * comes back as a handful of mangled bytes instead of an error. The charset
   * check rejects it first, and a strict UTF-8 decoder rejects anything that
   * survives that but is not text.
   *
   * An empty payload decodes to an empty string - that is a real, if boring,
   * snippet. A link with no code at all is handled in readUrl, not here.
   */
  function decode(payload) {
    if (typeof payload !== "string") return null;
    if (!/^[A-Za-z0-9_-]*$/.test(payload)) return null;

    try {
      let base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += "=";
      return new TextDecoder("utf-8", { fatal: true }).decode(fromBase64(base64));
    } catch (err) {
      return null;
    }
  }

  /** Builds the shareable address for a snippet. */
  function buildUrl(base, code, languageId) {
    const url = new URL(base);
    url.hash = "";
    url.searchParams.set("lang", languageId);
    url.searchParams.set("code", encode(code));
    return url.toString();
  }

  /** Reads a snippet out of a location-like object. Never throws. */
  function readUrl(search) {
    let params;
    try {
      params = new URLSearchParams(search || "");
    } catch (err) {
      return null;
    }

    const payload = params.get("code");
    if (!payload) return null;

    const code = decode(payload);
    if (code === null) return null;

    return { code: code, language: params.get("lang") || null };
  }

  function isTooLongToShare(url) {
    return String(url).length > SAFE_URL_LENGTH;
  }

  /* ---------------- this browser's own storage ---------------- */

  const KEY = "codepad-draft";

  function save(storage, code, languageId) {
    if (!storage) return false;
    try {
      storage.setItem(KEY, JSON.stringify({ code: code, language: languageId, at: Date.now() }));
      return true;
    } catch (err) {
      return false; // private windows and full quotas both land here
    }
  }

  function load(storage) {
    if (!storage) return null;
    try {
      const raw = storage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.code !== "string") return null;
      return { code: parsed.code, language: parsed.language || null, at: parsed.at || 0 };
    } catch (err) {
      return null;
    }
  }

  function clear(storage) {
    if (!storage) return;
    try {
      storage.removeItem(KEY);
    } catch (err) {
      /* nothing to do */
    }
  }

  const Share = {
    encode: encode,
    decode: decode,
    buildUrl: buildUrl,
    readUrl: readUrl,
    isTooLongToShare: isTooLongToShare,
    save: save,
    load: load,
    clear: clear,
    SAFE_URL_LENGTH: SAFE_URL_LENGTH,
    KEY: KEY,
  };

  global.Share = Share;
  if (typeof module !== "undefined" && module.exports) module.exports = Share;
})(typeof window !== "undefined" ? window : globalThis);
