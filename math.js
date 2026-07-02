/**
 * Gemini Wallpaper - Math Reformatter (detect + Fix button)
 *
 * Gemini sometimes prints math as raw LaTeX instead of rendering it —
 * both block ($$...$$) and inline ($...$). We DETECT each one, mark it
 * visibly as a broken equation, and drop a small "Fix" button right next
 * to it. The user clicks Fix and that equation is rendered with KaTeX in
 * place, in the normal text flow. Rendering is opt-in per equation.
 *
 * Inline $...$ is guarded: only matched when it carries a LaTeX signal
 * (\ ^ _ { }), so currency like "$5 ... $10" and prose are left alone.
 * Block $$ is resolved before inline so its inner "$" can't confuse it.
 *
 * Cross-node matching: Gemini's markdown turns stray "*"/"_" inside the
 * LaTeX into <em>/<strong>, which SPLITS a "$$...$$" across several text
 * nodes. So we don't match per text node — we walk each block (p, li, ...),
 * concatenate its text (reconstructing the "*"/"**" that emphasis ate),
 * match "$$...$$" over the whole block, then map the match back to a DOM
 * Range spanning the nodes/elements and replace that range in one shot.
 *
 * Survival across Angular re-renders: a MutationObserver re-scans when new
 * raw "$$" text appears. Our own markup (.gwp-math-broken / .gwp-math /
 * .katex) plus code/pre are excluded from the walk, so nothing loops,
 * double-processes, or touches code blocks that merely discuss "$$".
 *
 * KaTeX is BUNDLED (katex/katex.min.js, loaded by the manifest before this
 * script) so window.katex lives in our own isolated world.
 */
(function () {
  "use strict";

  // Block math: $$...$$.
  const BLOCK_RE = /\$\$([\s\S]+?)\$\$/g;
  // Inline math: a single $...$ that is NOT part of $$, content on one line.
  const INLINE_RE = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  // Only treat inline $...$ as math if it carries a LaTeX signal. This keeps
  // currency ("$5 and $10") and prose out while catching real notation like
  // "$x_i^ > 0$". Block $$ needs no such guard (the delimiter is explicit).
  const INLINE_MATH_HINT = /[\\^_{}]/;

  // Elements whose subtree we never descend into while reading a block.
  const EXCLUDE_SEL = ".katex, .gwp-math, .gwp-math-broken, code, pre, script, style, textarea, input";
  // Nested block-level tags: skipped while reading one block so we never
  // bridge a match across two separate blocks. They get processed on their
  // own as candidates.
  const BLOCK_TAGS = new Set([
    "P", "LI", "TD", "TH", "H1", "H2", "H3", "H4", "H5", "H6",
    "DD", "DT", "BLOCKQUOTE", "UL", "OL", "TABLE", "TR", "DIV",
  ]);
  // Candidate blocks to scan for raw math.
  const CANDIDATE_SEL = "p, li, td, th, h1, h2, h3, h4, h5, h6, dd, dt, blockquote";

  const STYLE_ID = "gwp-math-style";
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
      .gwp-math-broken {
        background: rgba(255,193,7,0.12);
        border-bottom: 1px dashed rgba(255,193,7,0.75);
        border-radius: 3px;
        padding: 0 3px;
      }
      .gwp-raw { font-family: monospace; opacity: .85; }
      .gwp-fix-btn {
        margin-left: 6px;
        font: 600 12px/1 system-ui, sans-serif;
        padding: 3px 9px;
        border-radius: 999px;
        border: 1px solid rgba(140,175,255,0.65);
        background: rgba(45,65,125,0.6);
        color: #dbe4ff;
        cursor: pointer;
        vertical-align: middle;
        white-space: nowrap;
        transition: background .12s, border-color .12s;
      }
      .gwp-fix-btn:hover { background: rgba(75,105,205,0.85); border-color: #9db4ff; }
      .gwp-fix-btn:active { transform: translateY(1px); }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function katexReady() {
    return typeof window.katex !== "undefined" && !!window.katex;
  }

  // Turn a "broken equation" wrapper into the rendered formula, in place.
  // Block math renders in displayMode; inline math renders inline-sized.
  function renderInto(wrap, latex, isBlock) {
    const d = isBlock ? "$$" : "$";
    wrap.className = "gwp-math";
    wrap.textContent = "";
    try {
      window.katex.render(latex, wrap, { throwOnError: false, displayMode: !!isBlock });
    } catch (e) {
      wrap.textContent = d + latex + d;
    }
  }

  // The detected-but-not-yet-fixed state: shows the raw LaTeX, marked,
  // with a Fix button that renders it on click.
  function makeBroken(latex, isBlock) {
    const d = isBlock ? "$$" : "$";
    const wrap = document.createElement("span");
    wrap.className = "gwp-math-broken";
    wrap.setAttribute("data-gwp-latex", latex);

    const raw = document.createElement("span");
    raw.className = "gwp-raw";
    raw.textContent = d + latex + d;

    const btn = document.createElement("button");
    btn.className = "gwp-fix-btn";
    btn.type = "button";
    btn.textContent = "✨ Fix";
    btn.title = "Render this equation with KaTeX";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderInto(wrap, latex, isBlock);
    });

    wrap.appendChild(raw);
    wrap.appendChild(btn);
    return wrap;
  }

  // Read a block into a token stream: each text node becomes a 'text'
  // token; each <em>/<strong> contributes synthetic 'mark' tokens ("*" /
  // "**") around its content, recovering delimiters markdown consumed.
  // Nested blocks and excluded subtrees are skipped.
  function tokenize(container) {
    const tokens = [];
    let pos = 0;
    function push(text, extra) {
      const start = pos;
      pos += text.length;
      tokens.push(Object.assign({ start, end: pos, text }, extra));
    }
    function walk(node) {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          push(child.nodeValue, { type: "text", node: child });
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.matches(EXCLUDE_SEL)) continue;
          if (child !== container && BLOCK_TAGS.has(child.tagName)) continue;
          const tag = child.tagName;
          const mark =
            tag === "EM" || tag === "I" ? "*" :
            tag === "STRONG" || tag === "B" ? "**" : "";
          if (mark) push(mark, { type: "mark", el: child, edge: "open" });
          walk(child);
          if (mark) push(mark, { type: "mark", el: child, edge: "close" });
        }
      }
    }
    walk(container);
    return tokens;
  }

  // Map a string index in the concatenated block back to a DOM boundary.
  // Delimiters ($$) are real text, so boundaries land on text tokens; the
  // mark-token branch is a safety net that snaps to the element edge.
  function boundaryAt(tokens, idx) {
    for (const t of tokens) {
      if (idx >= t.start && idx <= t.end) {
        if (t.type === "text") return { node: t.node, offset: idx - t.start };
        return t.edge === "open" ? { before: t.el } : { after: t.el };
      }
    }
    const last = tokens[tokens.length - 1];
    if (last && last.type === "text") return { node: last.node, offset: last.node.nodeValue.length };
    return last ? { after: last.el } : null;
  }

  function setEdge(range, b, which) {
    if (!b) return false;
    if (b.node) range[which === "start" ? "setStart" : "setEnd"](b.node, b.offset);
    else if (b.before) range[which === "start" ? "setStartBefore" : "setEndBefore"](b.before);
    else range[which === "start" ? "setStartAfter" : "setEndAfter"](b.after);
    return true;
  }

  // One replacement pass over a block for a given delimiter. Re-tokenizes
  // per match so node references stay valid after each in-place replacement;
  // the inserted wrapper is excluded from the walk, guaranteeing progress.
  // `hint`, when set, skips matches that don't look like math.
  function runPass(container, re, isBlock, hint) {
    for (let guard = 0; guard < 60; guard++) {
      const tokens = tokenize(container);
      if (!tokens.length) return;
      const s = tokens.map((t) => t.text).join("");
      if (s.indexOf("$") < 0) return;
      re.lastIndex = 0;
      let m = null, cur;
      while ((cur = re.exec(s)) !== null) {
        const latex = (cur[1] ?? "").trim();
        if (!latex) continue;
        if (hint && !hint.test(latex)) continue;
        m = cur;
        break;
      }
      if (!m) return;
      const latex = (m[1] ?? "").trim();
      const a = boundaryAt(tokens, m.index);
      const b = boundaryAt(tokens, m.index + m[0].length);
      const range = document.createRange();
      if (!setEdge(range, a, "start") || !setEdge(range, b, "end")) return;
      range.deleteContents();
      range.insertNode(makeBroken(latex, isBlock));
    }
  }

  // Resolve block math first (so its inner "$" can't confuse the inline
  // pass), then guarded inline math.
  function processContainer(container) {
    runPass(container, BLOCK_RE, true, null);
    runPass(container, INLINE_RE, false, INLINE_MATH_HINT);
  }

  function scan() {
    if (!katexReady()) return;
    const cands = [];
    document.body.querySelectorAll(CANDIDATE_SEL).forEach((el) => {
      if (el.closest("code, pre")) return;
      if (el.textContent.indexOf("$") >= 0) cands.push(el);
    });
    if (!cands.length) return;
    observer.disconnect();
    for (const c of cands) {
      try { processContainer(c); } catch (e) { /* node detached mid-pass */ }
    }
    observer.observe(document.body, OBS_OPTS);
  }

  const OBS_OPTS = { childList: true, subtree: true, characterData: true };
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 250);
  });

  observer.observe(document.body, OBS_OPTS);
  scan();
})();
