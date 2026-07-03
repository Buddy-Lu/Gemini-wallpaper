/**
 * Gemini Wallpaper - Chatbox as a real window + standalone magic ball
 *
 * The input box behaves like an OS window, driven by genuine geometry
 * (position:fixed + left/top/width/height), with macOS-style traffic lights
 * left of a ⚙ settings button:
 *   🔴 red    — minimize to a small draggable "chat" chip
 *   🟡 yellow — restore down (normal windowed size; un-maximize)
 *   🟢 green  — maximize to the full page/viewport
 *   ⚙  gear   — art panel (border / tint / blur / radius), reused from code blocks
 *
 * Move: drag the title bar or the box body (non-input areas).
 * Resize: drag the box's borders / corners (real window-edge resize).
 *
 * The glowing glass ball is INDEPENDENT — a standalone, draggable orb whose
 * position is remembered. (Its real job is TBD.)
 */
(function () {
  "use strict";

  const SELECTORS = [
    "input-area-v2", "input-area-v3", "input-area-v4",
    ".text-input-field", ".input-area",
    "input-container",
  ];

  const MINW = 240, MINH = 96;

  // ── Feature state ─────────────────────────────────────────
  let dragEnabled = false;
  let scalePct    = 100;    // popup size slider → seeds default window size
  let chatbox     = null;
  let bar         = null;
  let chip        = null;
  let panel       = null;
  let observer    = null;
  let posTimer    = null;
  let chaseRAF    = 0;      // rAF id while "chasing" the box back onto its pin
  let chaseEnd    = 0;      // performance.now() cutoff for the chase burst
  const handles   = {};     // dir → element

  let winMode = "normal";   // "normal" | "min" | "max"

  // Natural (untransformed) geometry of the box, captured live.
  let restCX = 0, restCY = 0, restW = 0, restH = 0;
  // Current windowed geometry (normal mode).
  let winX = 0, winY = 0, winW = 0, winH = 0;
  let seeded = false;
  // Until the user actually grabs the box (drag / resize / traffic light), we
  // leave Gemini's own position AND sizing alone — the input stays put, grows
  // with new lines, and can't teleport on navigation. It only becomes a pinned
  // floating window once the user opts in.
  let userPlaced = false;

  // Move / resize drag scratch
  let moving = false, mvX = 0, mvY = 0, mvWinX = 0, mvWinY = 0;
  let rsDir = "", rsX = 0, rsY = 0, rsRect = null;

  // Art / card look (own storage key, mirrors the code-block styler).
  const CARD_DEFAULTS = { tintColor: "#0f1020", tintOpacity: 42, blur: 10, border: "solid", radius: 24 };
  let card = { ...CARD_DEFAULTS };

  // ── Utilities ─────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const BORDERS = {
    none:  { border: "none", shadow: "none" },
    solid: { border: "1px solid rgba(255,255,255,0.22)", shadow: "none" },
    shiny: {
      border: "1px solid rgba(255,255,255,0.35)",
      shadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 30px rgba(120,150,255,0.28), 0 0 0 1px rgba(180,200,255,0.15)",
    },
    synthwave: {
      border: "1px solid #ff2e97",
      shadow: "0 0 10px rgba(255,46,151,0.6), 0 0 22px rgba(0,229,255,0.35), inset 0 0 16px rgba(138,43,226,0.28)",
    },
  };

  let lastChildPtr = -1;
  function setChildHidden(hidden) {
    if (!chatbox) return;
    const p = hidden ? 1 : 0;
    if (p === lastChildPtr) return;
    lastChildPtr = p;
    for (const c of chatbox.children) c.style.pointerEvents = hidden ? "none" : "";
  }

  // ── DOM lookup / geometry ─────────────────────────────────
  function findChatbox() {
    for (const sel of SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.getBoundingClientRect().height > 0) return el;
      }
    }
    return null;
  }

  function captureRest() {
    if (!chatbox || moving || rsDir) return;
    // Measure with our window styles stripped so we get the natural box.
    const props = ["position", "left", "top", "width", "height", "max-width", "margin", "z-index"];
    const saved = {};
    props.forEach((p) => { saved[p] = chatbox.style.getPropertyValue(p); chatbox.style.removeProperty(p); });
    void chatbox.offsetHeight;
    const r = chatbox.getBoundingClientRect();
    restCX = r.left + r.width / 2;
    restCY = r.top + r.height / 2;
    restW = r.width; restH = r.height;
    props.forEach((p) => { if (saved[p]) chatbox.style.setProperty(p, saved[p], "important"); });
  }

  function seedGeometry() {
    if (seeded || !restW) return;
    winW = restW * scalePct / 100;
    winH = restH * scalePct / 100;
    winX = restCX - winW / 2;
    winY = restCY - winH / 2;
    seeded = true;
  }

  // First time the user grabs the box, snapshot its current on-screen rect as
  // the starting window geometry, then switch into "placed" (pinned) mode.
  function beginUserPlacement() {
    if (userPlaced) return;
    const lr = liveRect();
    if (lr) { winX = lr.x; winY = lr.y; winW = lr.w; winH = lr.h; }
    seeded = true;
    userPlaced = true;
  }

  function currentRect() {
    if (winMode === "max") return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    return { x: winX, y: winY, w: winW, h: winH };
  }

  // The box's actual on-screen rect (with our styles applied). Overlays are
  // glued to THIS so they never drift away from where the box really renders.
  function liveRect() {
    if (!chatbox) return null;
    const b = chatbox.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    return { x: b.left, y: b.top, w: b.width, h: b.height };
  }

  // Gemini's input sits inside <fieldset.input-area-container> which carries a
  // (usually identity) transform — and ANY transform makes an ancestor the
  // containing block for position:fixed. So our fixed left/top are measured
  // from that ancestor, not the viewport. Find it and return its padding-box
  // origin so we can convert viewport coords → containing-block coords.
  function cbOrigin() {
    let n = chatbox && chatbox.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      if (cs.transform !== "none" || cs.perspective !== "none" || cs.filter !== "none" ||
          /transform|perspective|filter/.test(cs.willChange || "") ||
          /paint|layout|strict|content|size/.test(cs.contain || "")) {
        const r = n.getBoundingClientRect();
        return { x: r.left + (parseFloat(cs.borderLeftWidth) || 0), y: r.top + (parseFloat(cs.borderTopWidth) || 0) };
      }
      n = n.parentElement;
    }
    return { x: 0, y: 0 };
  }

  function cardRadiusCss() {
    return dragEnabled && winMode !== "max" ? card.radius + "px" : (winMode === "max" ? "0px" : "");
  }

  // ── Apply window geometry + card art ──────────────────────
  function clearWindowStyles() {
    if (!chatbox) return;
    ["position", "left", "top", "width", "height", "min-height", "max-width", "margin", "z-index",
     "border-radius", "opacity", "box-sizing", "overflow",
     "background-color", "backdrop-filter", "-webkit-backdrop-filter", "border", "box-shadow", "transition"]
      .forEach((p) => chatbox.style.removeProperty(p));
    setChildHidden(false);
  }

  function applyGeometry() {
    if (!chatbox) return;
    if (!dragEnabled) { clearWindowStyles(); return; }

    // Art (tint / blur / border / shadow / radius) applies whenever the feature
    // is on, whether or not the box is a floating window yet.
    applyCardColors();
    chatbox.style.borderRadius = cardRadiusCss();

    // Not a window yet: leave Gemini's own layout (position + size) intact so
    // the input keeps growing with new lines and never jumps on navigation.
    if (!userPlaced && winMode === "normal") {
      ["position", "left", "top", "width", "height", "min-height",
       "max-width", "margin", "z-index", "opacity", "overflow", "transition"]
        .forEach((p) => chatbox.style.removeProperty(p));
      setChildHidden(false);
      return;
    }

    const r = currentRect();
    const o = cbOrigin();          // viewport → containing-block offset
    const set = (p, v) => chatbox.style.setProperty(p, v, "important");
    set("position", "fixed");
    set("left", Math.round(r.x - o.x) + "px");
    set("top", Math.round(r.y - o.y) + "px");
    set("width", Math.round(r.w) + "px");
    set("max-width", "none");
    set("margin", "0");
    set("box-sizing", "border-box");
    set("z-index", "9997");
    set("transition", "none");    // our left/top snaps are instant, never animated

    if (winMode === "max") {
      // Maximized: hard height + scroll, fills the page.
      set("height", Math.round(r.h) + "px");
      set("overflow", "auto");
      chatbox.style.removeProperty("min-height");
    } else {
      // Windowed: the resized height is a FLOOR — the box may still grow taller
      // for extra lines so the toolbar never overflows past the border.
      set("min-height", Math.round(r.h) + "px");
      chatbox.style.removeProperty("height");
      chatbox.style.removeProperty("overflow");
    }

    if (winMode === "min") {
      chatbox.style.setProperty("opacity", "0", "important");
      setChildHidden(true);
    } else {
      chatbox.style.removeProperty("opacity");
      setChildHidden(false);
    }
  }

  function applyCardColors() {
    if (!chatbox || !dragEnabled) return;
    const b = BORDERS[card.border] || BORDERS.solid;
    if (card.tintOpacity > 0) chatbox.style.setProperty("background-color", hexToRgba(card.tintColor, card.tintOpacity / 100), "important");
    else chatbox.style.removeProperty("background-color");
    chatbox.style.setProperty("backdrop-filter", `blur(${card.blur}px)`, "important");
    chatbox.style.setProperty("-webkit-backdrop-filter", `blur(${card.blur}px)`, "important");
    chatbox.style.setProperty("border", b.border, "important");
    chatbox.style.setProperty("box-shadow", b.shadow, "important");
  }

  // ── Move (title bar / body / chip) ────────────────────────
  function startMove(e) {
    if (winMode === "max") return;      // maximized windows don't move
    e.preventDefault(); e.stopPropagation();
    beginUserPlacement();
    moving = true;
    mvX = e.clientX; mvY = e.clientY;
    mvWinX = winX; mvWinY = winY;
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMoveMove, true);
    window.addEventListener("mouseup", onMoveUp, true);
  }
  function onMoveMove(e) {
    if (!moving) return;
    winX = clamp(mvWinX + (e.clientX - mvX), -winW + 60, window.innerWidth - 60);
    winY = clamp(mvWinY + (e.clientY - mvY), 0, window.innerHeight - 40);
    applyGeometry();
    positionOverlays();
  }
  function onMoveUp() {
    if (!moving) return;
    moving = false;
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMoveMove, true);
    window.removeEventListener("mouseup", onMoveUp, true);
    saveWin();
  }

  // ── Resize (drag borders / corners) ───────────────────────
  function startResize(dir, e) {
    e.preventDefault(); e.stopPropagation();
    if (winMode !== "normal") { winMode = "normal"; }
    beginUserPlacement();
    rsDir = dir;
    rsX = e.clientX; rsY = e.clientY;
    rsRect = { x: winX, y: winY, w: winW, h: winH };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onResizeMove, true);
    window.addEventListener("mouseup", onResizeUp, true);
  }
  function onResizeMove(e) {
    if (!rsDir) return;
    const dx = e.clientX - rsX, dy = e.clientY - rsY;
    let { x, y, w, h } = rsRect;
    if (rsDir.includes("e")) w = rsRect.w + dx;
    if (rsDir.includes("s")) h = rsRect.h + dy;
    if (rsDir.includes("w")) { w = rsRect.w - dx; x = rsRect.x + dx; }
    if (rsDir.includes("n")) { h = rsRect.h - dy; y = rsRect.y + dy; }
    if (w < MINW) { if (rsDir.includes("w")) x -= (MINW - w); w = MINW; }
    if (h < MINH) { if (rsDir.includes("n")) y -= (MINH - h); h = MINH; }
    winX = x; winY = y; winW = w; winH = h;
    applyGeometry();
    positionOverlays();
  }
  function onResizeUp() {
    if (!rsDir) return;
    rsDir = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onResizeMove, true);
    window.removeEventListener("mouseup", onResizeUp, true);
    saveWin();
  }

  function saveWin() {
    chrome.storage.local.set({ chatboxWin: { x: winX, y: winY, w: winW, h: winH } });
  }

  // ── Box body drag to move ─────────────────────────────────
  function isInteractiveTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    return !!target.closest(
      'input, textarea, button, [contenteditable="true"], [role="button"], ' +
      '[role="textbox"], a, mat-icon, .mat-icon, .ql-editor, rich-textarea'
    );
  }
  function onChatboxMouseDown(e) {
    if (!dragEnabled || !chatbox) return;
    if (winMode === "min") return;
    if (isInteractiveTarget(e.target)) return;
    startMove(e);
  }

  // ── Resize handles ────────────────────────────────────────
  const HANDLE_DIRS = {
    n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize",
  };
  function createHandles() {
    for (const dir of Object.keys(HANDLE_DIRS)) {
      if (handles[dir]) continue;
      const el = document.createElement("div");
      el.className = "gwp-rs-handle";
      el.style.cssText = `position:fixed;z-index:9998;cursor:${HANDLE_DIRS[dir]};display:none;`;
      el.addEventListener("mousedown", (e) => startResize(dir, e));
      handles[dir] = el;
      document.body.appendChild(el);
    }
  }
  function removeHandles() {
    for (const dir of Object.keys(handles)) { handles[dir]?.remove(); delete handles[dir]; }
  }
  function positionHandles(r) {
    const show = winMode === "normal";
    const T = 8, C = 14; // edge thickness, corner size
    const place = (dir, x, y, w, h) => {
      const el = handles[dir]; if (!el) return;
      el.style.display = show ? "block" : "none";
      if (!show) return;
      el.style.left = x + "px"; el.style.top = y + "px";
      el.style.width = w + "px"; el.style.height = h + "px";
    };
    place("n", r.x + C, r.y - T / 2, r.w - 2 * C, T);
    place("s", r.x + C, r.y + r.h - T / 2, r.w - 2 * C, T);
    place("w", r.x - T / 2, r.y + C, T, r.h - 2 * C);
    place("e", r.x + r.w - T / 2, r.y + C, T, r.h - 2 * C);
    place("nw", r.x - T / 2, r.y - T / 2, C, C);
    place("ne", r.x + r.w - C + T / 2, r.y - T / 2, C, C);
    place("sw", r.x - T / 2, r.y + r.h - C + T / 2, C, C);
    place("se", r.x + r.w - C + T / 2, r.y + r.h - C + T / 2, C, C);
  }

  // ── Control bar + chip ────────────────────────────────────
  function injectUiStyle() {
    if (document.getElementById("gwp-chatbox-ui-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-chatbox-ui-style";
    st.textContent = `
      #gwp-chatbox-bar {
        position: fixed; z-index: 10000; display: flex; align-items: center; gap: 8px;
        padding: 6px 9px; border-radius: 10px; background: rgba(20,22,34,.72);
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        box-shadow: 0 2px 10px rgba(0,0,0,.4); cursor: grab;
      }
      #gwp-chatbox-bar .gwp-tl {
        width: 13px; height: 13px; border-radius: 50%; border: none; padding: 0;
        cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,.15); transition: filter .12s, transform .12s;
      }
      #gwp-chatbox-bar .gwp-tl:hover { filter: brightness(1.15); transform: scale(1.12); }
      #gwp-chatbox-bar .gwp-tl.red    { background: #ff5f57; }
      #gwp-chatbox-bar .gwp-tl.yellow { background: #febc2e; }
      #gwp-chatbox-bar .gwp-tl.green  { background: #28c840; }
      #gwp-chatbox-bar .gwp-gear {
        margin-left: 2px; width: 20px; height: 20px; border: none; border-radius: 6px;
        background: rgba(255,255,255,.10); color: #cfd6ff; font-size: 13px; line-height: 1;
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: background .15s;
      }
      #gwp-chatbox-bar .gwp-gear:hover { background: rgba(74,124,255,.45); }
      #gwp-chatbox-chip {
        position: fixed; z-index: 9999; width: 88px; height: 58px; border-radius: 13px;
        background: rgba(20,22,34,.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,.12); box-shadow: 0 5px 18px rgba(0,0,0,.5);
        cursor: grab; display: none; color: #eef1ff; font: 700 14px/1 'Segoe UI', system-ui, sans-serif;
      }
      #gwp-chatbox-chip .gwp-chip-label {
        position: absolute; left: 0; right: 0; bottom: 0; height: 24px;
        display: flex; align-items: center; justify-content: center;
        text-align: center; letter-spacing: 2px; opacity: 1;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }
  function makeTL(cls, title) {
    const b = document.createElement("button");
    b.className = "gwp-tl " + cls; b.type = "button"; b.title = title;
    return b;
  }
  function createBar() {
    if (bar) return;
    injectUiStyle();
    bar = document.createElement("div");
    bar.id = "gwp-chatbox-bar";

    const red = makeTL("red", "Minimize");
    red.addEventListener("mousedown", (e) => e.stopPropagation());
    red.addEventListener("click", (e) => { e.stopPropagation(); beginUserPlacement(); winMode = "min"; applyGeometry(); positionOverlays(); saveWin(); });

    const yellow = makeTL("yellow", "Restore down");
    yellow.addEventListener("mousedown", (e) => e.stopPropagation());
    yellow.addEventListener("click", (e) => { e.stopPropagation(); beginUserPlacement(); winMode = "normal"; applyGeometry(); positionOverlays(); saveWin(); });

    const green = makeTL("green", "Maximize (full page)");
    green.addEventListener("mousedown", (e) => e.stopPropagation());
    green.addEventListener("click", (e) => { e.stopPropagation(); beginUserPlacement(); winMode = winMode === "max" ? "normal" : "max"; applyGeometry(); positionOverlays(); saveWin(); });

    const g = document.createElement("button");
    g.className = "gwp-gear"; g.type = "button"; g.textContent = "⚙"; g.title = "Input box style";
    g.addEventListener("mousedown", (e) => e.stopPropagation());
    g.addEventListener("click", (e) => { e.stopPropagation(); (panel && panel.style.display === "block") ? closePanel() : openPanel(); });

    bar.appendChild(red); bar.appendChild(yellow); bar.appendChild(green); bar.appendChild(g);
    bar.addEventListener("mousedown", (e) => { if (e.target.closest(".gwp-tl, .gwp-gear")) return; startMove(e); });
    document.body.appendChild(bar);

    chip = document.createElement("div");
    chip.id = "gwp-chatbox-chip";
    const lbl = document.createElement("div");
    lbl.className = "gwp-chip-label"; lbl.textContent = "chat";
    chip.appendChild(lbl);
    chip.addEventListener("mousedown", (e) => { winMode = "min"; startMove(e); });
    document.body.appendChild(chip);
  }
  function removeBar() { bar?.remove(); bar = null; chip?.remove(); chip = null; }

  // ── Overlay positioning ───────────────────────────────────
  function positionOverlays() {
    if (!bar) return;
    // Overlays always glue to where the box ACTUALLY renders (liveRect) when at
    // rest — never write that back into winX/winY, or a bad one-frame position
    // during navigation would get saved and stick (the old teleport bug).
    const r = (winMode === "max" || moving || rsDir) ? currentRect() : (liveRect() || currentRect());
    positionHandles(r);

    if (winMode === "min") {
      const cw = 88, ch = 58;
      const chipLeft = clamp(r.x, 4, window.innerWidth - cw - 4);
      const chipTop  = clamp(r.y, 4, window.innerHeight - ch - 4);
      chip.style.display = "block";
      chip.style.left = chipLeft + "px"; chip.style.top = chipTop + "px";
      bar.style.left = (chipLeft + 8) + "px"; bar.style.top = (chipTop + 8) + "px";
    } else {
      chip.style.display = "none";
      const bl = clamp(r.x + 6, 4, window.innerWidth - 150);
      const bt = clamp(r.y - 34, 4, window.innerHeight - 40);
      bar.style.left = bl + "px"; bar.style.top = bt + "px";
    }
  }

  // ── Keep a pinned window glued to its spot during Gemini's own animations ──
  // Our box is position:fixed INSIDE Gemini's transformed input container, so
  // when Gemini animates that container on navigation the box briefly rides
  // along. Rather than let it drift and correct once (a visible snap), we chase
  // it back every animation frame for a short burst — the ride is cancelled
  // within ~16ms, so it never appears to move. Only our own left/top is touched.
  function boxDrifted() {
    if (!dragEnabled || !userPlaced || winMode !== "normal" || moving || rsDir) return false;
    const lr = liveRect();
    if (!lr) return false;
    return Math.abs(lr.x - winX) > 1 || Math.abs(lr.y - winY) > 1;
  }
  function chaseStep() {
    chaseRAF = 0;
    if (!dragEnabled || !userPlaced || winMode !== "normal" || moving || rsDir) return;
    applyGeometry();          // re-pin: left = winX − current containing-block origin
    positionOverlays();
    if (performance.now() < chaseEnd || boxDrifted()) chaseRAF = requestAnimationFrame(chaseStep);
  }
  function startChase(ms) {
    if (!dragEnabled || !userPlaced || winMode !== "normal") return;
    chaseEnd = performance.now() + (ms || 700);
    if (!chaseRAF) chaseRAF = requestAnimationFrame(chaseStep);
  }

  // ── Bind / mount ──────────────────────────────────────────
  function bindChatbox(el)   { el.addEventListener("mousedown", onChatboxMouseDown); }
  function unbindChatbox(el) { el.removeEventListener("mousedown", onChatboxMouseDown); }

  function rebind() {
    if (moving || rsDir) return;
    const fresh = findChatbox();
    if (fresh && fresh !== chatbox) {
      if (chatbox) { clearWindowStyles(); unbindChatbox(chatbox); }
      lastChildPtr = -1;
      chatbox = fresh;
      bindChatbox(chatbox);
      captureRest();
      applyGeometry();
    }
    positionOverlays();
    // Gemini mutates the DOM heavily during navigation — the very churn that
    // makes the box ride its animated container. Chase it back through it.
    if (dragEnabled && userPlaced && winMode === "normal") startChase();
  }

  let warnedNoBox = false;
  function ensureChatbox() {
    if (chatbox && document.body.contains(chatbox)) return chatbox;
    chatbox = findChatbox();
    if (chatbox) { captureRest(); warnedNoBox = false; }
    else if (!warnedNoBox) {
      // Warn once, not on every retry — the input area just isn't in the DOM
      // yet (early load / SPA nav); the poll below picks it up quietly.
      warnedNoBox = true;
      console.warn("[Gemini Wallpaper] Chatbox not found yet. Tried selectors:", SELECTORS);
    }
    return chatbox;
  }

  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };

  function enable() {
    if (dragEnabled) return;
    dragEnabled = true;
    if (!ensureChatbox()) {
      // Retry quietly until the input appears; stop if the extension was
      // reloaded (stale content script) so we don't spin/log forever.
      setTimeout(() => { if (dragEnabled && !chatbox && alive()) { dragEnabled = false; enable(); } }, 1000);
      return;
    }
    createBar();
    createHandles();
    bindChatbox(chatbox);
    seedGeometry();
    applyGeometry();
    positionOverlays();
    observer = new MutationObserver(rebind);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", positionOverlays, true);
    window.addEventListener("keydown", onKeyDown, true);
    // Keep the controls stuck to the box even through silent layout reflows.
    // When it's a pinned window, also re-assert geometry so a stray one-frame
    // position (e.g. mid-navigation, before layout settles) self-corrects.
    posTimer = setInterval(() => {
      if (!dragEnabled || moving || rsDir) return;
      if (boxDrifted()) startChase();     // caught drifting → smoothly re-pin
      positionOverlays();
    }, 400);
  }

  function disable() {
    if (!dragEnabled) return;
    dragEnabled = false;
    moving = false; rsDir = "";
    window.removeEventListener("mousemove", onMoveMove, true);
    window.removeEventListener("mouseup", onMoveUp, true);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", positionOverlays, true);
    window.removeEventListener("keydown", onKeyDown, true);
    observer?.disconnect(); observer = null;
    if (posTimer) { clearInterval(posTimer); posTimer = null; }
    if (chaseRAF) { cancelAnimationFrame(chaseRAF); chaseRAF = 0; }
    if (chatbox) { unbindChatbox(chatbox); clearWindowStyles(); }
    removeBar(); removeHandles(); closePanel();
    winMode = "normal";
  }

  function onResize() {
    captureRest();
    positionOverlays();
  }

  // Esc restores a maximized window to normal (green → yellow).
  function onKeyDown(e) {
    if (e.key === "Escape" && dragEnabled && winMode === "max") {
      winMode = "normal";
      seedGeometry();
      applyGeometry();
      positionOverlays();
    }
  }

  // ── Art panel ─────────────────────────────────────────────
  function saveCard() {
    chrome.storage.local.set({ chatboxStyle: card });
    applyCardColors();
  }
  function makeBtnRow(labelText, values, current, onPick) {
    const wrap = document.createElement("div"); wrap.style.cssText = "margin-bottom:10px;";
    const lab = document.createElement("div");
    lab.textContent = labelText; lab.style.cssText = "font-size:11px;color:#9aa0c0;margin-bottom:5px;";
    wrap.appendChild(lab);
    const row = document.createElement("div"); row.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
    values.forEach(([val, text]) => {
      const b = document.createElement("button");
      b.textContent = text; b.dataset.val = val;
      b.style.cssText = "padding:4px 9px;font-size:11px;font-weight:500;border-radius:5px;cursor:pointer;border:1px solid transparent;background:#2a2a4a;color:#aaa;transition:all .15s;";
      const sel = () => {
        row.querySelectorAll("button").forEach((x) => { x.style.borderColor = "transparent"; x.style.color = "#aaa"; x.style.background = "#2a2a4a"; });
        b.style.borderColor = "#4a7cff"; b.style.color = "#4a7cff"; b.style.background = "rgba(74,124,255,0.14)";
      };
      if (val === current) sel();
      b.addEventListener("click", (e) => { e.stopPropagation(); sel(); onPick(val); });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }
  function makeSlider(labelText, min, max, step, current, unit, onInput) {
    const wrap = document.createElement("div"); wrap.style.cssText = "margin-bottom:10px;";
    const lab = document.createElement("div"); lab.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#9aa0c0;margin-bottom:5px;";
    const name = document.createElement("span"); name.textContent = labelText;
    const valEl = document.createElement("span"); valEl.style.cssText = "color:#4a7cff;font-weight:600;"; valEl.textContent = current + unit;
    lab.appendChild(name); lab.appendChild(valEl);
    const range = document.createElement("input");
    range.type = "range"; range.min = min; range.max = max; range.step = step; range.value = current;
    range.style.cssText = "width:100%;accent-color:#4a7cff;cursor:pointer;";
    range.addEventListener("input", (e) => { e.stopPropagation(); valEl.textContent = range.value + unit; onInput(parseInt(range.value, 10)); });
    wrap.appendChild(lab); wrap.appendChild(range);
    return wrap;
  }
  function buildPanel() {
    const p = document.createElement("div");
    p.id = "gwp-chatbox-panel";
    p.style.cssText =
      "position:fixed;z-index:2147483000;width:246px;max-height:80vh;overflow-y:auto;" +
      "background:#1a1a2e;border:1px solid #3a3a5a;border-radius:10px;padding:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:'Segoe UI',system-ui,sans-serif;color:#e0e0e0;display:none;";
    p.addEventListener("mousedown", (e) => e.stopPropagation());
    p.addEventListener("click", (e) => e.stopPropagation());
    const title = document.createElement("div");
    title.textContent = "⚙ Input Box Style";
    title.style.cssText = "font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;";
    p.appendChild(title);
    p.appendChild(makeBtnRow("Border", [
      ["none", "None"], ["solid", "Border"], ["shiny", "Shiny"], ["synthwave", "Synthwave"],
    ], card.border, (v) => { card.border = v; saveCard(); }));
    const tintWrap = document.createElement("div");
    tintWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
    const tintLab = document.createElement("span");
    tintLab.textContent = "Tint"; tintLab.style.cssText = "font-size:11px;color:#9aa0c0;flex:1;";
    const colorEl = document.createElement("input");
    colorEl.type = "color"; colorEl.value = card.tintColor;
    colorEl.style.cssText = "width:26px;height:20px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;";
    colorEl.addEventListener("input", (e) => { e.stopPropagation(); card.tintColor = colorEl.value; saveCard(); });
    tintWrap.appendChild(tintLab); tintWrap.appendChild(colorEl);
    p.appendChild(tintWrap);
    p.appendChild(makeSlider("Tint Opacity", 0, 100, 1, card.tintOpacity, "%", (v) => { card.tintOpacity = v; saveCard(); }));
    p.appendChild(makeSlider("Blur", 0, 24, 1, card.blur, "px", (v) => { card.blur = v; saveCard(); }));
    p.appendChild(makeSlider("Corner Radius", 0, 32, 1, card.radius, "px", (v) => { card.radius = v; if (winMode !== "max") chatbox.style.borderRadius = cardRadiusCss(); saveCard(); }));
    document.body.appendChild(p);
    return p;
  }
  function openPanel() {
    if (panel) panel.remove();
    panel = buildPanel();
    panel.style.display = "block";
    const r = bar.getBoundingClientRect();
    const w = 246, margin = 8;
    let left = r.left; if (left + w > window.innerWidth) left = window.innerWidth - w - margin; if (left < margin) left = margin;
    let top = r.bottom + margin;
    const h = Math.min(panel.offsetHeight, window.innerHeight * 0.8);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    panel.style.left = left + "px"; panel.style.top = top + "px";
  }
  function closePanel() { if (panel) panel.style.display = "none"; }
  document.addEventListener("mousedown", (e) => {
    if (panel && panel.style.display === "block" && !panel.contains(e.target) && !e.target.closest("#gwp-chatbox-bar")) closePanel();
  });

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get(
    { chatboxDraggable: false, chatboxScale: 100, chatboxStyle: CARD_DEFAULTS, chatboxWin: null },
    (s) => {
      scalePct = s.chatboxScale || 100;
      card = { ...CARD_DEFAULTS, ...s.chatboxStyle };
      if (s.chatboxWin) { winX = s.chatboxWin.x; winY = s.chatboxWin.y; winW = s.chatboxWin.w; winH = s.chatboxWin.h; seeded = true; userPlaced = true; }
      if (s.chatboxDraggable) enable();
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("chatboxDraggable" in changes) changes.chatboxDraggable.newValue ? enable() : disable();
    if ("chatboxScale" in changes) {
      scalePct = changes.chatboxScale.newValue || 100;
      if (dragEnabled && userPlaced && winMode !== "max") {
        const cx = winX + winW / 2, cy = winY + winH / 2;
        winW = restW * scalePct / 100; winH = restH * scalePct / 100;
        winX = cx - winW / 2; winY = cy - winH / 2;
        applyGeometry(); positionOverlays(); saveWin();
      }
    }
    if ("chatboxStyle" in changes) {
      card = { ...CARD_DEFAULTS, ...changes.chatboxStyle.newValue };
      if (dragEnabled) { applyCardColors(); if (winMode !== "max") chatbox.style.borderRadius = cardRadiusCss(); }
    }
  });

})();
