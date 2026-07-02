/**
 * Gemini Wallpaper - Linked Chat Notes
 *
 * Per-conversation notes. Click "＋ Note", then select text in a model response;
 * that text is highlighted and a small floating, draggable note card is created
 * with an arrow drawn from the card to the highlighted span.
 *
 * Notes are scoped to the conversation URL (each chat has its own set) and
 * persisted in chrome.storage.local under `gwpLinkedNotes`. The highlighted
 * anchor is relocated across Gemini's SPA re-renders using the same
 * text + surrounding-context fingerprint approach as annotations.js.
 *
 * A rAF loop keeps each note positioned relative to its anchor (so it tracks
 * the text while scrolling) and redraws the connector arrow. Dragging a note
 * stores its offset from the anchor.
 */
(function () {
  "use strict";

  const KEY = "gwpLinkedNotes";
  const ANCHOR_CLASS = "gwp-lnote-anchor";
  const SVGNS = "http://www.w3.org/2000/svg";
  const COLORS = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#ddd6fe"];
  const ARROW_COLORS = ["#f0a830", "#22d3ee", "#ef4444", "#22c55e", "#3b82f6", "#e879f9", "#ffffff", "#000000"];

  let enabled = false;
  let notes = [];               // all notes across conversations
  let layer = null, svg = null, addBtn = null, hint = null;
  const cards = new Map();      // id -> card element
  const paths = new Map();      // id -> svg <path>
  let rafId = null;
  let picking = false;
  let draggingId = null;
  let saveTimer = null;
  let lastUrl = location.href;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ [KEY]: notes }), 300);
  }
  function uid() {
    return (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function curNotes() { return notes.filter((n) => n.url === location.href); }

  // ── DOM helpers (shared approach with annotations.js) ─────
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
  function charOffset(root, targetNode, nodeOffset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0, n;
    while ((n = walker.nextNode())) {
      if (n === targetNode) return pos + nodeOffset;
      pos += n.textContent.length;
    }
    return -1;
  }
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
  function wrapRangeInSpans(range, makeSpan) {
    const root = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
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
      nr.surroundContents(span);
      spans.push(span);
    }
    return spans;
  }

  function anchorEls(id) {
    return document.querySelectorAll(`.${ANCHOR_CLASS}[data-lnote-id="${CSS.escape(id)}"]`);
  }
  function styleAnchor(el, color) {
    el.style.backgroundColor = color;
    el.style.color = "#111";
  }
  function unionRect(els) {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    els.forEach((e) => {
      const q = e.getBoundingClientRect();
      l = Math.min(l, q.left); t = Math.min(t, q.top);
      r = Math.max(r, q.right); b = Math.max(b, q.bottom);
    });
    return { left: l, top: t, right: r, bottom: b, width: r - l, height: b - t };
  }
  // Point where the line from a rect's center toward (tx,ty) crosses its border.
  function borderPoint(rect, tx, ty) {
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    const dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const scale = 1 / Math.max(Math.abs(dx) / (rect.width / 2 || 1), Math.abs(dy) / (rect.height / 2 || 1));
    return { x: cx + dx * scale, y: cy + dy * scale };
  }

  // ── Styles ────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-lnotes-style")) return;
    const s = document.createElement("style");
    s.id = "gwp-lnotes-style";
    s.textContent = `
      #gwp-lnotes-layer { position: fixed; inset: 0; z-index: 9996; pointer-events: none; }
      #gwp-lnotes-svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
      .gwp-lnote {
        position: absolute; pointer-events: auto; display: flex; flex-direction: column;
        border-radius: 7px; box-shadow: 0 6px 20px rgba(0,0,0,.4); overflow: hidden;
        resize: both; min-width: 130px; min-height: 78px; width: 190px; height: 120px;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .gwp-lnote-bar { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: rgba(0,0,0,.13); cursor: grab; flex: none; }
      .gwp-lnote-bar .sp { flex: 1; }
      .gwp-lnote-btn {
        border: none; background: rgba(0,0,0,.18); color: #1a1a1a; width: 18px; height: 18px;
        border-radius: 4px; cursor: pointer; font-size: 11px; line-height: 1; display: flex; align-items: center; justify-content: center;
      }
      .gwp-lnote-btn:hover { background: rgba(0,0,0,.32); }
      .gwp-lnote textarea {
        flex: 1; border: none; outline: none; resize: none; background: transparent;
        padding: 7px; font-size: 13px; color: #171717; font-family: inherit; line-height: 1.4;
      }
      .${ANCHOR_CLASS} { border-radius: 3px; padding: 0 1px; cursor: pointer; box-shadow: inset 0 -2px 0 rgba(0,0,0,.25); }
      #gwp-lnotes-add {
        position: fixed; left: 16px; bottom: 16px; pointer-events: auto;
        transition: left .18s ease;
        background: linear-gradient(180deg,#2c3037,#23262b); color: #f0a830;
        border: 1px solid #101215; border-top-color: #40464f; border-radius: 6px;
        padding: 8px 12px; font: 600 12px/1 'Consolas', monospace; text-transform: uppercase;
        letter-spacing: 1px; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.5);
      }
      #gwp-lnotes-add:hover { filter: brightness(1.15); }
      #gwp-lnotes-add.picking { outline: 2px solid #f0a830; color: #fff; }
      #gwp-lnotes-hint {
        position: fixed; left: 50%; bottom: 58px; transform: translateX(-50%); pointer-events: none;
        background: rgba(18,18,36,.95); color: #f0a830; border: 1px solid rgba(255,255,255,.15);
        border-radius: 20px; padding: 7px 16px; font: 600 12px/1 'Segoe UI', sans-serif;
        box-shadow: 0 6px 24px rgba(0,0,0,.5); display: none; z-index: 99999;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Layer ─────────────────────────────────────────────────
  function ensureLayer() {
    if (layer && document.body.contains(layer)) return;
    injectStyle();

    layer = document.createElement("div");
    layer.id = "gwp-lnotes-layer";

    svg = document.createElementNS(SVGNS, "svg");
    svg.id = "gwp-lnotes-svg";
    svg.innerHTML =
      `<defs><marker id="gwp-lnote-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto">` +
      `<path d="M0,0 L7,3 L0,6 Z" fill="context-stroke"/></marker></defs>`;
    layer.appendChild(svg);

    addBtn = document.createElement("button");
    addBtn.id = "gwp-lnotes-add";
    addBtn.textContent = "＋ Note";
    addBtn.title = "Add a note linked to text";
    addBtn.addEventListener("click", (e) => { e.stopPropagation(); startPicking(); });
    layer.appendChild(addBtn);
    watchSidebar();

    hint = document.createElement("div");
    hint.id = "gwp-lnotes-hint";
    hint.textContent = "Select text to attach the note · Esc to cancel";
    layer.appendChild(hint);

    document.body.appendChild(layer);
    cards.clear();
    paths.clear();
    renderCurrent();
  }

  // ── Render notes for the current conversation ─────────────
  function renderCurrent() {
    if (!layer) return;
    const ids = new Set(curNotes().map((n) => n.id));
    for (const [id, el] of cards) if (!ids.has(id)) { el.remove(); cards.delete(id); }
    for (const [id, p] of paths) if (!ids.has(id)) { p.remove(); paths.delete(id); }
    curNotes().forEach((n) => { if (!cards.has(n.id)) renderCard(n); });
    restoreAnchors();
    startLoop();
  }

  function renderCard(note) {
    const w = document.createElement("div");
    w.className = "gwp-lnote";
    w.style.background = note.color;
    w.style.width = (note.w || 190) + "px";
    w.style.height = (note.h || 120) + "px";

    const bar = document.createElement("div");
    bar.className = "gwp-lnote-bar";

    const colorBtn = document.createElement("button");
    colorBtn.className = "gwp-lnote-btn";
    colorBtn.textContent = "●";
    colorBtn.title = "Change color";
    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      note.color = COLORS[(COLORS.indexOf(note.color) + 1) % COLORS.length];
      w.style.background = note.color;
      anchorEls(note.id).forEach((a) => styleAnchor(a, note.color));
      save();
    });

    const arrowBtn = document.createElement("button");
    arrowBtn.className = "gwp-lnote-btn";
    arrowBtn.textContent = "↗";
    arrowBtn.title = "Arrow color";
    arrowBtn.style.color = note.arrowColor || ARROW_COLORS[0];
    arrowBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cur = note.arrowColor || ARROW_COLORS[0];
      note.arrowColor = ARROW_COLORS[(ARROW_COLORS.indexOf(cur) + 1) % ARROW_COLORS.length];
      arrowBtn.style.color = note.arrowColor;
      paths.get(note.id)?.setAttribute("stroke", note.arrowColor);
      save();
    });

    const sp = document.createElement("div");
    sp.className = "sp";

    const del = document.createElement("button");
    del.className = "gwp-lnote-btn";
    del.textContent = "✕";
    del.title = "Delete note";
    del.addEventListener("click", (e) => { e.stopPropagation(); deleteNote(note.id); });

    bar.appendChild(colorBtn);
    bar.appendChild(arrowBtn);
    bar.appendChild(sp);
    bar.appendChild(del);

    const ta = document.createElement("textarea");
    ta.value = note.text || "";
    ta.placeholder = "Note…";
    ta.addEventListener("input", () => { note.text = ta.value; save(); });
    ta.addEventListener("mousedown", (e) => e.stopPropagation());

    w.appendChild(bar);
    w.appendChild(ta);
    layer.appendChild(w);
    cards.set(note.id, w);

    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", note.arrowColor || ARROW_COLORS[0]);
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-dasharray", "1 0");
    p.setAttribute("marker-end", "url(#gwp-lnote-arrow)");
    svg.appendChild(p);
    paths.set(note.id, p);

    bar.addEventListener("mousedown", (e) => startDragNote(e, note, w, bar));

    const ro = new ResizeObserver(() => {
      note.w = w.offsetWidth; note.h = w.offsetHeight; save();
    });
    ro.observe(w);
  }

  function startDragNote(e, note, w, bar) {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingId = note.id;
    bar.style.cursor = "grabbing";
    const cr = w.getBoundingClientRect();
    const offX = e.clientX - cr.left, offY = e.clientY - cr.top;
    function move(ev) {
      const left = clamp(ev.clientX - offX, 4, window.innerWidth - w.offsetWidth - 4);
      const top  = clamp(ev.clientY - offY, 4, window.innerHeight - w.offsetHeight - 4);
      w.style.left = left + "px";
      w.style.top  = top + "px";
    }
    function up() {
      draggingId = null;
      bar.style.cursor = "grab";
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("mouseup", up, true);
      const anchors = anchorEls(note.id);
      if (anchors.length) {
        const ar = unionRect(anchors);
        const cr2 = w.getBoundingClientRect();
        note.dx = cr2.left - ar.left;
        note.dy = cr2.top - ar.top;
        save();
      }
    }
    document.addEventListener("mousemove", move, true);
    document.addEventListener("mouseup", up, true);
  }

  function deleteNote(id) {
    anchorEls(id).forEach((s) => {
      const p = s.parentNode;
      while (s.firstChild) p.insertBefore(s.firstChild, s);
      p.removeChild(s);
    });
    notes = notes.filter((n) => n.id !== id);
    cards.get(id)?.remove(); cards.delete(id);
    paths.get(id)?.remove(); paths.delete(id);
    save();
  }

  // ── Re-locate anchors after re-render / navigation ────────
  function restoreAnchors() {
    curNotes().forEach((n) => {
      if (anchorEls(n.id).length || !n.anchor) return;
      const a = n.anchor;
      const sel = "model-response, message-content, response-container, .model-response-text";
      for (const c of document.querySelectorAll(sel)) {
        const full = c.textContent;
        const idx = full.indexOf(a.contextBefore + a.selectedText + a.contextAfter);
        if (idx < 0) continue;
        const start = idx + a.contextBefore.length;
        const range = rangeFromOffset(c, start, a.selectedText.length);
        if (!range) continue;
        wrapRangeInSpans(range, () => {
          const s = document.createElement("span");
          s.className = ANCHOR_CLASS;
          s.dataset.lnoteId = n.id;
          styleAnchor(s, n.color);
          return s;
        });
        break;
      }
    });
  }

  // ── Position loop (tracks anchors + draws arrows) ─────────
  function startLoop() { if (rafId == null && enabled) rafId = requestAnimationFrame(frame); }
  function stopLoop() { if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; } }

  function frame() {
    rafId = null;
    if (!enabled) return;
    const list = curNotes();
    if (!list.length) return;

    list.forEach((n) => {
      const card = cards.get(n.id), path = paths.get(n.id);
      if (!card) return;
      const anchors = anchorEls(n.id);
      if (!anchors.length) {
        card.style.display = "none";
        if (path) path.style.display = "none";
        return;
      }
      const ar = unionRect(anchors);
      // Hide the note + arrow once its anchored text scrolls out of view
      // (don't clamp it to the edge). Keep it while actively dragging.
      const onScreen = ar.bottom > 8 && ar.top < window.innerHeight - 8 &&
                       ar.right > 0 && ar.left < window.innerWidth;
      if (!onScreen && draggingId !== n.id) {
        card.style.display = "none";
        if (path) path.style.display = "none";
        return;
      }
      card.style.display = "";
      if (draggingId !== n.id) {
        const left = clamp(ar.left + n.dx, 4, window.innerWidth - card.offsetWidth - 4);
        const top  = clamp(ar.top + n.dy, 4, window.innerHeight - card.offsetHeight - 4);
        card.style.left = left + "px";
        card.style.top  = top + "px";
      }
      if (path) {
        path.style.display = "";
        const cr = card.getBoundingClientRect();
        const acx = ar.left + ar.width / 2, acy = ar.top + ar.height / 2;
        const s = borderPoint(cr, acx, acy);
        const e = borderPoint(ar, cr.left + cr.width / 2, cr.top + cr.height / 2);
        path.setAttribute("d", `M${s.x.toFixed(1)},${s.y.toFixed(1)} L${e.x.toFixed(1)},${e.y.toFixed(1)}`);
      }
    });

    rafId = requestAnimationFrame(frame);
  }

  // ── Keep the ＋Note button clear of the sidebar ────────────
  // The sidebar (collapsed rail or expanded panel) sits on the left and
  // overlaps the button's home at left:16px — covering the profile row when
  // expanded. Slide the button just past the sidebar's right edge instead.
  let sidebarRO = null, watchedSidebar = null;
  function findSidebar() {
    return document.querySelector("bard-sidenav") ||
           document.querySelector("side-navigation-v2") ||
           document.querySelector("bard-sidenav-container");
  }
  function positionAddBtn() {
    if (!addBtn) return;
    let x = 16;
    const sb = findSidebar();
    if (sb) {
      const r = sb.getBoundingClientRect();
      // Only offset when the sidebar is actually on-screen on the left edge.
      if (r.width > 40 && r.right > 24 && r.left < 24) x = Math.round(r.right) + 12;
    }
    addBtn.style.left = x + "px";
  }
  function watchSidebar() {
    const sb = findSidebar();
    if (sb !== watchedSidebar) {
      if (sidebarRO) sidebarRO.disconnect();
      watchedSidebar = sb;
      if (sb && window.ResizeObserver) {
        sidebarRO = new ResizeObserver(() => positionAddBtn());
        sidebarRO.observe(sb);
      }
    }
    positionAddBtn();
  }
  window.addEventListener("resize", positionAddBtn);

  // ── Create flow: ＋ then pick text ────────────────────────
  function startPicking() {
    picking = true;
    addBtn?.classList.add("picking");
    if (hint) hint.style.display = "block";
  }
  function cancelPick() {
    picking = false;
    addBtn?.classList.remove("picking");
    if (hint) hint.style.display = "none";
  }

  function createLinkedNote(range, container) {
    const full = container.textContent;
    const startOff = charOffset(container, range.startContainer, range.startOffset);
    const endOff   = charOffset(container, range.endContainer, range.endOffset);
    if (startOff < 0 || endOff <= startOff) return;

    const selectedText = full.slice(startOff, endOff);
    const id = uid();
    const color = COLORS[curNotes().length % COLORS.length];

    wrapRangeInSpans(range, () => {
      const s = document.createElement("span");
      s.className = ANCHOR_CLASS;
      s.dataset.lnoteId = id;
      styleAnchor(s, color);
      return s;
    });
    window.getSelection()?.removeAllRanges();

    notes.push({
      id, url: location.href, text: "", color, arrowColor: ARROW_COLORS[0],
      w: 190, h: 120, dx: 60, dy: -10,
      anchor: {
        selectedText,
        contextBefore: full.slice(Math.max(0, startOff - 30), startOff),
        contextAfter: full.slice(endOff, endOff + 30),
      },
    });
    save();
    renderCard(notes[notes.length - 1]);
    startLoop();
    cards.get(id)?.querySelector("textarea")?.focus();
  }

  // ── Events ────────────────────────────────────────────────
  document.addEventListener("mouseup", (e) => {
    if (!enabled || !picking) return;
    if (addBtn?.contains(e.target)) return;
    const selg = window.getSelection();
    const text = selg?.toString().trim();
    if (!text || text.length < 2) return;   // keep waiting for a real selection
    const range = selg.getRangeAt(0);
    const container = modelAncestor(range.commonAncestorContainer);
    if (!container) return;                  // must select inside a model response
    createLinkedNote(range.cloneRange(), container);
    cancelPick();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picking) cancelPick();
  });

  // Click an anchor to focus its note.
  document.addEventListener("click", (e) => {
    if (!enabled) return;
    const a = e.target.closest?.("." + ANCHOR_CLASS);
    if (!a) return;
    const card = cards.get(a.dataset.lnoteId);
    if (card) {
      card.querySelector("textarea")?.focus();
      card.animate?.([{ transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 220 });
    }
  });

  // ── Enable / disable ──────────────────────────────────────
  function applyEnabled(v) {
    enabled = !!v;
    if (enabled) {
      ensureLayer();
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      mo.disconnect();
      stopLoop();
      cancelPick();
      if (sidebarRO) { sidebarRO.disconnect(); sidebarRO = null; }
      watchedSidebar = null;
      layer?.remove();
      layer = null; svg = null; addBtn = null; hint = null;
      cards.clear();
      paths.clear();
    }
  }

  // Re-render on Gemini re-renders; also handle SPA navigation between chats.
  let moTimer = null;
  const mo = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      if (!enabled) return;
      ensureLayer();
      if (location.href !== lastUrl) lastUrl = location.href;
      renderCurrent();
    }, 350);
  });

  setInterval(() => {
    if (!enabled) return;
    watchSidebar();
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(renderCurrent, 700);
    }
  }, 500);

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get({ [KEY]: [], notesEnabled: false }, (s) => {
    notes = Array.isArray(s[KEY]) ? s[KEY] : [];
    applyEnabled(s.notesEnabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("notesEnabled" in changes) applyEnabled(changes.notesEnabled.newValue);
  });

})();
