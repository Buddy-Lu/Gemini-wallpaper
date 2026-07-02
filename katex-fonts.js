/**
 * Gemini Wallpaper - KaTeX font loader (CSP-safe)
 *
 * Gemini's page Content Security Policy has a `font-src` list that does NOT
 * include chrome-extension: origins. So the normal KaTeX @font-face url()
 * rules (which point at chrome-extension://<id>/katex/fonts/*.woff2) get
 * blocked, spamming the console with "Loading the font '<URL>' violates the
 * following Content Security Policy directive: 'font-src ...'" every time
 * math renders.
 *
 * Binary font data handed to the FontFace API is NOT subject to font-src, so
 * we fetch each bundled woff2 (an extension resource we own) as an ArrayBuffer
 * and register it via FontFace instead. The @font-face url() rules have been
 * stripped from katex.min.css, so nothing else ever attempts the blocked URLs.
 */
(function () {
  "use strict";
  if (window.__gwpKatexFonts) return;
  window.__gwpKatexFonts = true;

  // Bundled font files. Family / weight / style are derived from the name:
  // "KaTeX_Main-BoldItalic" -> family "KaTeX_Main", 700, italic.
  var FILES = [
    "KaTeX_AMS-Regular", "KaTeX_Caligraphic-Bold", "KaTeX_Caligraphic-Regular",
    "KaTeX_Fraktur-Bold", "KaTeX_Fraktur-Regular", "KaTeX_Main-Bold",
    "KaTeX_Main-BoldItalic", "KaTeX_Main-Italic", "KaTeX_Main-Regular",
    "KaTeX_Math-BoldItalic", "KaTeX_Math-Italic", "KaTeX_SansSerif-Bold",
    "KaTeX_SansSerif-Italic", "KaTeX_SansSerif-Regular", "KaTeX_Script-Regular",
    "KaTeX_Size1-Regular", "KaTeX_Size2-Regular", "KaTeX_Size3-Regular",
    "KaTeX_Size4-Regular", "KaTeX_Typewriter-Regular"
  ];

  function register(name) {
    var dash = name.indexOf("-");
    var family = name.slice(0, dash);       // e.g. "KaTeX_Main"
    var variant = name.slice(dash + 1);     // e.g. "BoldItalic"
    var descriptors = {
      weight: /Bold/.test(variant) ? "700" : "400",
      style: /Italic/.test(variant) ? "italic" : "normal"
    };
    var url = chrome.runtime.getURL("katex/fonts/" + name + ".woff2");
    return fetch(url)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (buf) { return new FontFace(family, buf, descriptors).load(); })
      .then(function (face) { document.fonts.add(face); })
      .catch(function () { /* missing font / context gone — KaTeX just falls back */ });
  }

  try {
    if (window.FontFace && chrome.runtime && chrome.runtime.id) {
      FILES.forEach(register);
    }
  } catch (_) { /* no-op */ }
})();
