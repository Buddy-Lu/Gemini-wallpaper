/**
 * Gemini Wallpaper - Text Annotations
 *
 * Lets users highlight or underline text in model responses.
 * Annotations are persisted to chrome.storage.local and restored
 * on page load / SPA navigation.
 *
 * Multi-line selections are handled by wrapping each text node
 * individually (multiple spans share one annId). This avoids the
 * surroundContents HierarchyRequestError and the DOM corruption
 * caused by extractContents on cross-element ranges.
 */
(function () {
  "use strict";

  const TOOLBAR_ID = "gwp-ann-toolbar";
  const ANN_CLASS  = "gwp-ann";
  const COLORS = [
    { hex: "#fef08a", label: "Yellow" },
    { hex: "#86efac", label: "Green"  },
    { hex: "#fca5a5", label: "Red"    },
    { hex: "#93c5fd", label: "Blue"   },
    { hex: "#e9d5ff", label: "Purple" },
    { hex: "#fdba74", label: "Orange" },
  ];

  // ── Storage ──────────────────────────────────────────────
  let annotations = [];
  function save() { chrome.storage.local.set({ gwpAnnotations: annotations }); }

  // ── Style ────────────────────────────────────────────────
  function applyStyle(el, type, color) {
    el.style.cursor = "pointer";
    if (type === "highlight") {
      el.style.backgroundColor        = color;
      el.style.color                  = "#111";
      el.style.borderRadius           = "3px";
      el.style.padding                = "1px 2px";
      el.style.textDecoration         = "none";
    } else {
      el.style.backgroundColor        = "transparent";
      el.style.color                  = "inherit";
      el.style.borderRadius           = "0";
      el.style.padding                = "0";
      el.style.textDecoration         = "underline";
      el.style.textDecorationColor    = "#4a7cff";
      el.style.textDecorationThickness = "2px";
    }
  }

  // ── DOM helpers ──────────────────────────────────────────
  function modelAncestor(node) {
    let n = node instanceof Element ? node : node.parentElement;
    while (n && n !== document.body) {
      const t = n.tagName?.toLowerCase();
      if (t === "model-response" || t === "message-content" ||
          t === "response-container" ||
          n.classList?.contains("model-response-text")) return n;
      n = n.parentElement;
    }
    return null;
  }

  // Char offset of (node, offset) within root's textContent.
  function charOffset(root, targetNode, nodeOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0, n;
    while ((n = walker.nextNode())) {
      if (n === targetNode) return pos + nodeOffset;
      pos += n.textContent.length;
    }
    return -1;
  }

  // Rebuild a Range from char offsets within root's textContent.
  function rangeFromOffset(root, start, len) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0, range = null, node;
    while ((node = walker.nextNode())) {
      const nl = node.textContent.length;
      if (!range && pos + nl > start) {
        range = document.createRange();
        range.setStart(node, start - pos);
      }
      if (range && pos + nl >= start + len) {
        range.setEnd(node, start + len - pos);
        return range;
      }
      pos += nl;
    }
    return null;
  }

  /**
   * Wrap a Range by splitting it into one span per text node.
   * This always works — no surroundContents across element boundaries,
   * no extractContents DOM corruption.
   * Returns the array of created spans.
   */
  function wrapRangeInSpans(range, makeSpan) {
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

    // Collect segments BEFORE touching the DOM, so splits don't
    // invalidate later node references.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const segments = [];
    let node, inRange = false;

    while ((node = walker.nextNode())) {
      if (!inRange) {
        if (node === range.startContainer) inRange = true;
        else continue;
      }
      const start = (node === range.startContainer) ? range.startOffset : 0;
      const end   = (node === range.endContainer)   ? range.endOffset   : node.textContent.length;
      if (start < end) segments.push({ node, start, end });
      if (node === range.endContainer) break;
    }

    const spans = [];
    for (const { node, start, end } of segments) {
      const nr = document.createRange();
      nr.setStart(node, start);
      nr.setEnd(node, end);
      const span = makeSpan();
      nr.surroundContents(span); // always safe: single text node
      spans.push(span);
    }
    return spans;
  }

  function generateId() {
    return (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // ── Toolbar ──────────────────────────────────────────────
  let currentRange = null;
  let currentAnnEl = null;

  function buildToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;
    const bar = document.createElement("div");
    bar.id = TOOLBAR_ID;
    bar.style.cssText = [
      "position:fixed", "z-index:99999", "display:none", "flex-direction:row",
      "align-items:center", "gap:5px", "padding:7px 11px",
      "background:rgba(18,18,36,0.97)", "border:1px solid rgba(255,255,255,0.13)",
      "border-radius:24px", "box-shadow:0 6px 28px rgba(0,0,0,0.55)",
      "backdrop-filter:blur(12px)", "-webkit-backdrop-filter:blur(12px)",
    ].join(";");

    bar.addEventListener("mousedown", e => e.preventDefault());

    COLORS.forEach(({ hex, label }) => {
      const btn = document.createElement("button");
      btn.title = `Highlight: ${label}`;
      btn.style.cssText = [
        `background:${hex}`, "width:16px", "height:16px", "border-radius:50%",
        "border:2px solid transparent", "cursor:pointer", "padding:0", "flex-shrink:0",
        "transition:transform .15s,box-shadow .15s",
      ].join(";");
      btn.addEventListener("mouseenter", () => {
        btn.style.transform = "scale(1.3)";
        btn.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.25)";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.transform = "";
        btn.style.boxShadow = "";
      });
      btn.addEventListener("click", () => applyAnnotation("highlight", hex));
      bar.appendChild(btn);
    });

    bar.appendChild(divider());

    const ub = document.createElement("button");
    ub.title = "Underline";
    ub.textContent = "U";
    ub.style.cssText = [
      "font-size:13px", "font-weight:700", "color:#94a3fb",
      "background:transparent", "border:none", "cursor:pointer",
      "padding:0 4px", "text-decoration:underline",
      "text-decoration-color:#94a3fb", "text-decoration-thickness:2px",
    ].join(";");
    ub.addEventListener("click", () => applyAnnotation("underline", null));
    bar.appendChild(ub);

    bar.appendChild(divider());

    const rb = document.createElement("button");
    rb.title = "Remove annotation";
    rb.textContent = "✕";
    rb.style.cssText = [
      "font-size:11px", "color:#f87171",
      "background:transparent", "border:none", "cursor:pointer", "padding:0 2px",
    ].join(";");
    rb.addEventListener("click", removeAnnotation);
    bar.appendChild(rb);

    document.body.appendChild(bar);
  }

  function divider() {
    const d = document.createElement("div");
    d.style.cssText = "width:1px;height:14px;background:rgba(255,255,255,0.14);flex-shrink:0;";
    return d;
  }

  function showToolbar(x, y) {
    const bar = document.getElementById(TOOLBAR_ID);
    if (!bar) return;
    const W = 260;
    let left = x - W / 2;
    if (left < 8) left = 8;
    if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
    const top = y - 52 < 8 ? y + 18 : y - 52;
    bar.style.left    = left + "px";
    bar.style.top     = top  + "px";
    bar.style.display = "flex";
  }

  function hideToolbar() {
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar) bar.style.display = "none";
    currentRange = null;
    currentAnnEl = null;
  }

  // ── Apply / Remove ───────────────────────────────────────
  function applyAnnotation(type, color) {
    if (!currentRange || currentRange.collapsed) { hideToolbar(); return; }

    const container = modelAncestor(currentRange.commonAncestorContainer);
    if (!container) { hideToolbar(); return; }

    // Compute fingerprint from container.textContent BEFORE DOM modification.
    // Using textContent (not range.toString()) avoids the \n mismatch that
    // range.toString() introduces at block-element boundaries.
    const full     = container.textContent;
    const startOff = charOffset(container, currentRange.startContainer, currentRange.startOffset);
    const endOff   = charOffset(container, currentRange.endContainer,   currentRange.endOffset);
    if (startOff < 0 || endOff <= startOff) { hideToolbar(); return; }

    const selectedText = full.slice(startOff, endOff);
    const id = generateId();

    const makeSpan = () => {
      const span = document.createElement("span");
      span.className       = ANN_CLASS;
      span.dataset.annId   = id;
      span.dataset.annType = type;
      if (color) span.dataset.annColor = color;
      applyStyle(span, type, color);
      return span;
    };

    const spans = wrapRangeInSpans(currentRange, makeSpan);
    if (!spans.length) { hideToolbar(); return; }

    window.getSelection()?.removeAllRanges();

    annotations.push({
      id,
      url:           location.href,
      selectedText,
      contextBefore: full.slice(Math.max(0, startOff - 30), startOff),
      contextAfter:  full.slice(endOff, endOff + 30),
      type,
      color: color || null,
    });
    save();
    hideToolbar();
  }

  function removeAnnotation() {
    const span = currentAnnEl;
    if (!span) { hideToolbar(); return; }
    const id = span.dataset.annId;
    if (id) {
      // Multi-line annotations create multiple spans with the same annId —
      // remove them all.
      document.querySelectorAll(`[data-ann-id="${CSS.escape(id)}"]`).forEach(s => {
        const p = s.parentNode;
        while (s.firstChild) p.insertBefore(s.firstChild, s);
        p.removeChild(s);
      });
      annotations = annotations.filter(a => a.id !== id);
      save();
    }
    hideToolbar();
  }

  // ── Restore ──────────────────────────────────────────────
  function restoreOne(ann) {
    if (ann.url !== location.href) return;
    if (document.querySelector(`[data-ann-id="${CSS.escape(ann.id)}"]`)) return;

    const sel = "model-response, message-content, response-container, .model-response-text";
    for (const container of document.querySelectorAll(sel)) {
      const full    = container.textContent;
      const pattern = ann.contextBefore + ann.selectedText + ann.contextAfter;
      const idx     = full.indexOf(pattern);
      if (idx < 0) continue;

      const start = idx + ann.contextBefore.length;
      const range = rangeFromOffset(container, start, ann.selectedText.length);
      if (!range) continue;

      const makeSpan = () => {
        const span = document.createElement("span");
        span.className       = ANN_CLASS;
        span.dataset.annId   = ann.id;
        span.dataset.annType = ann.type;
        if (ann.color) span.dataset.annColor = ann.color;
        applyStyle(span, ann.type, ann.color);
        return span;
      };

      wrapRangeInSpans(range, makeSpan);
      break;
    }
  }

  function restoreAll() {
    annotations.filter(a => a.url === location.href).forEach(restoreOne);
  }

  // ── Events ───────────────────────────────────────────────
  document.addEventListener("mouseup", e => {
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar?.contains(e.target)) return;

    const sel  = window.getSelection();
    const text = sel?.toString().trim();

    if (text && text.length >= 2) {
      const range = sel.getRangeAt(0);
      if (!modelAncestor(range.commonAncestorContainer)) { hideToolbar(); return; }
      currentRange = range.cloneRange();
      currentAnnEl = null;
      // Position toolbar at the mouse cursor (works for both single- and multi-line)
      showToolbar(e.clientX, e.clientY);
      return;
    }

    const annEl = e.target.closest?.("." + ANN_CLASS);
    if (annEl) {
      currentAnnEl = annEl;
      currentRange = null;
      const rect = annEl.getBoundingClientRect();
      showToolbar(rect.left + rect.width / 2, rect.top);
      return;
    }

    hideToolbar();
  });

  document.addEventListener("mousedown", e => {
    const bar = document.getElementById(TOOLBAR_ID);
    if (bar && !bar.contains(e.target)) hideToolbar();
  });

  // Re-apply after Gemini re-renders
  let restoreTimer = null;
  new MutationObserver(() => {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(restoreAll, 350);
  }).observe(document.body, { childList: true, subtree: true });

  // SPA navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(restoreAll, 700);
    }
  }, 500);

  // ── Init ────────────────────────────────────────────────
  buildToolbar();
  chrome.storage.local.get({ gwpAnnotations: [] }, s => {
    annotations = s.gwpAnnotations;
    restoreAll();
  });

})();
