/**
 * Gemini Wallpaper - Math Reformatter
 *
 * Adds a "∑" button on each model response. Clicking it scans for
 * unrendered LaTeX patterns (\(...\), \[...\], $$...$$, $...$) in
 * plain text nodes and re-renders them with KaTeX (which Gemini
 * loads globally). Also adds click-to-copy on already-rendered
 * .katex elements (copies the raw LaTeX source).
 */
(function () {
  "use strict";

  // Matches \[...\], \(...\), $$...$$, $...$  in that priority order.
  // Capture groups: 1=display\[, 2=inline\(, 3=display$$, 4=inline$
  const MATH_RE = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\s][^$\n]*?)\$/g;

  const RESPONSE_SEL = "model-response, message-content, response-container, .model-response-text";
  const BTN_CLASS    = "gwp-math-btn";

  // ── Reformat math in a container ─────────────────────────
  function fixMath(container) {
    const katex = window.katex;
    if (!katex) return -1; // signal: KaTeX not ready

    const filter = {
      acceptNode(node) {
        // Skip text inside already-rendered math, code blocks, etc.
        if (node.parentElement?.closest(".katex, code, pre, script, style, [data-gwp-math]"))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    };

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, filter);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);

    let count = 0;
    for (const textNode of nodes) {
      const text = textNode.textContent;
      MATH_RE.lastIndex = 0;
      if (!MATH_RE.test(text)) continue;
      MATH_RE.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0;
      let m;

      while ((m = MATH_RE.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));

        const latex       = m[1] ?? m[2] ?? m[3] ?? m[4];
        const displayMode = m[0].startsWith("\\[") || m[0].startsWith("$$");

        try {
          const wrap = document.createElement("span");
          wrap.setAttribute("data-gwp-math", "1");
          katex.render(latex, wrap, { throwOnError: false, displayMode });
          frag.appendChild(wrap);
          count++;
        } catch {
          frag.appendChild(document.createTextNode(m[0]));
        }

        last = m.index + m[0].length;
      }

      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));

      if (count > 0 || last > 0) textNode.parentNode?.replaceChild(frag, textNode);
    }

    return count;
  }

  // ── Add ∑ button to a response element ───────────────────
  function addButton(responseEl) {
    if (responseEl.querySelector("." + BTN_CLASS)) return;

    if (getComputedStyle(responseEl).position === "static")
      responseEl.style.position = "relative";

    const btn = document.createElement("button");
    btn.className = BTN_CLASS;
    btn.title     = "Reformat math";
    btn.textContent = "∑";
    btn.style.cssText = [
      "position:absolute", "top:6px", "right:6px",
      "width:26px", "height:26px",
      "background:rgba(18,18,40,0.88)", "color:#94a3fb",
      "border:1px solid rgba(148,163,251,0.35)", "border-radius:6px",
      "font-size:15px", "cursor:pointer",
      "opacity:0", "transition:opacity .2s,color .2s",
      "z-index:9000", "padding:0", "line-height:26px", "text-align:center",
    ].join(";");

    responseEl.addEventListener("mouseenter", () => { btn.style.opacity = "1"; });
    responseEl.addEventListener("mouseleave", () => { btn.style.opacity = "0"; });

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const result = fixMath(responseEl);

      if (result === -1) {
        btn.textContent = "✕";
        btn.style.color = "#f87171";
        btn.title = "KaTeX not ready — try again after math renders";
      } else if (result === 0) {
        btn.textContent = "✓";
        btn.style.color = "#94a3fb";
        btn.title = "No unrendered math found";
      } else {
        btn.textContent = "✓" + result;
        btn.style.color = "#4ade80";
        btn.title = `Fixed ${result} formula${result > 1 ? "s" : ""}`;
      }

      setTimeout(() => {
        btn.textContent = "∑";
        btn.style.color = "#94a3fb";
        btn.title = "Reformat math";
      }, 2200);
    });

    responseEl.appendChild(btn);
  }

  // ── Click-to-copy raw LaTeX on rendered .katex ────────────
  function addKatexCopy(container) {
    container.querySelectorAll(".katex:not([data-gwp-copy])").forEach(el => {
      el.setAttribute("data-gwp-copy", "1");
      el.style.cursor = "copy";
      el.title = "Click to copy LaTeX";
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const ann = el.querySelector('annotation[encoding="application/x-tex"]');
        if (!ann) return;
        navigator.clipboard.writeText(ann.textContent.trim()).then(() => {
          const prev = el.style.outline;
          el.style.outline = "2px solid #4ade80";
          setTimeout(() => { el.style.outline = prev; }, 1200);
        });
      });
    });
  }

  // ── Periodic scan for new responses ──────────────────────
  let scanTimer = null;

  function scan() {
    document.querySelectorAll(RESPONSE_SEL).forEach(el => {
      addButton(el);
      addKatexCopy(el);
    });
  }

  new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 450);
  }).observe(document.body, { childList: true, subtree: true });

  scan();
  console.log("[Gemini Wallpaper] Math module loaded.");
})();
