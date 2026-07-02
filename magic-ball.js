/**
 * Gemini Wallpaper - Magic Ball (AssistiveTouch-style launcher)
 *
 * A floating glass orb that behaves like the iPhone AssistiveTouch button:
 *   • draggable, snaps to the nearest screen edge on release
 *   • fades to translucent when idle, wakes to full opacity on touch/hover
 *   • gentle "breathing" + the glowing-glass shimmer while it sits
 *   • TAP (no drag) springs open a control menu
 *
 * The menu is the extension's showcase / quick-launcher: a grid of round
 * buttons that toggle every feature live (wallpaper, pet, chatbox window,
 * notes, thinking buddy, bulk delete, hide chat), plus a Panel view with the
 * main visual controls (dim / blur / brightness / glass tint + image upload).
 *
 * It only writes the same chrome.storage.local keys the other modules already
 * watch, so toggling here drives them instantly.
 */
(function () {
  "use strict";

  const KEY_ON = "magicBall";
  const KEY_POS = "magicBallPos";
  const SIZE = 56;
  const EDGE = 14;          // gap from screen edge when snapped
  const IDLE_MS = 2600;     // fade to translucent after this idle time
  const CLICK_PX = 6;       // movement under this on release ⇒ a tap

  // Feature toggles shown in the menu grid.
  const FEATURES = [
    { key: "enabled",           def: true,  icon: "🖼️", label: "Wallpaper" },
    { key: "petEnabled",        def: false, icon: "🐾", label: "Pet" },
    { key: "chatboxDraggable",  def: false, icon: "🪟", label: "Window" },
    { key: "magicBall",         def: false, icon: "🔮", label: "Ball",  self: true },
    { key: "notesEnabled",      def: false, icon: "📝", label: "Notes" },
    { key: "thinkingBuddy",     def: true,  icon: "💭", label: "Buddy" },
    { key: "bulkDeleteEnabled", def: false, icon: "🗑️", label: "Bulk Del" },
    { key: "hideChatEnabled",   def: true,  icon: "🙈", label: "Hide" },
  ];

  // Main-panel sliders (mirror the toolbar popup's visual controls).
  const SLIDERS = [
    { key: "overlayOpacity", label: "Dim",    min: 0,  max: 100, def: 50,  toUi: (v) => Math.round(v * 100), toStore: (v) => v / 100, unit: "%" },
    { key: "blur",           label: "Blur",   min: 0,  max: 20,  def: 0,   unit: "px" },
    { key: "brightness",     label: "Bright", min: 30, max: 130, def: 100, unit: "%" },
    { key: "glassOpacity",   label: "Glass",  min: 0,  max: 100, def: 45,  unit: "%" },
  ];

  let ball = null, glass = null, menu = null, backdrop = null;
  let x = 24, y = 200;
  let dragging = false, moved = false, downX = 0, downY = 0, offX = 0, offY = 0;
  let idleTimer = null, menuOpen = false, view = "home";
  const state = {};   // cached feature/slider values

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ── Style ─────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-mb-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-mb-style";
    st.textContent = `
      @keyframes gwp-mb-spin  { to { transform: rotate(360deg); } }
      @keyframes gwp-mb-hue   { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(45deg); } }
      @keyframes gwp-mb-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes gwp-mb-pop { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }

      #gwp-mb-ball {
        position: fixed; z-index: 2147482000; width: ${SIZE}px; height: ${SIZE}px;
        cursor: grab; opacity: 1; touch-action: none;
        transition: left .34s cubic-bezier(.22,1,.36,1), top .34s cubic-bezier(.22,1,.36,1), opacity .45s ease, transform .12s ease;
      }
      #gwp-mb-ball.gwp-mb-dragging { transition: opacity .2s, transform .12s; cursor: grabbing; }
      #gwp-mb-ball.gwp-mb-idle { opacity: .42; }
      #gwp-mb-ball:active { transform: scale(.9); }
      #gwp-mb-ball .gwp-mb-glass {
        width: 100%; height: 100%; border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow:
          inset 0 0 8px #ffffff,
          inset 4px 0 12px #ee82ee, inset -4px 0 12px #00ffff,
          inset 4px 0 44px #ee82ee, inset -4px 0 44px #00ffff,
          0 0 6px #ffffff, -5px 0 18px #ee82ee, 5px 0 18px #00ffff;
        animation: gwp-mb-spin 5s linear infinite, gwp-mb-hue 2.4s ease-in-out infinite, gwp-mb-breathe 3.6s ease-in-out infinite;
      }

      #gwp-mb-backdrop {
        position: fixed; inset: 0; z-index: 2147482400; background: rgba(6,7,16,.28);
        opacity: 0; transition: opacity .22s ease; backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
      }
      #gwp-mb-backdrop.gwp-mb-show { opacity: 1; }

      #gwp-mb-menu {
        position: fixed; z-index: 2147482500; width: 250px; padding: 14px;
        border-radius: 22px; background: rgba(24,26,40,.72);
        backdrop-filter: blur(22px) saturate(1.3); -webkit-backdrop-filter: blur(22px) saturate(1.3);
        border: 1px solid rgba(255,255,255,.14); box-shadow: 0 18px 50px rgba(0,0,0,.55);
        color: #eef1ff; font-family: 'Segoe UI', system-ui, sans-serif;
        transform: scale(.35); opacity: 0; transform-origin: var(--gwp-ox, 100%) var(--gwp-oy, 100%);
        transition: transform .3s cubic-bezier(.2,1.25,.32,1), opacity .2s ease;
      }
      #gwp-mb-menu.gwp-mb-open { transform: scale(1); opacity: 1; }

      #gwp-mb-menu .gwp-mb-head { display:flex; align-items:center; justify-content:space-between; margin: 0 2px 10px; }
      #gwp-mb-menu .gwp-mb-title { font-size: 13px; font-weight: 700; letter-spacing:.3px; opacity:.95; }
      #gwp-mb-menu .gwp-mb-sub { font-size: 11px; opacity:.55; }

      #gwp-mb-menu .gwp-mb-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 6px; }
      #gwp-mb-menu .gwp-mb-item {
        display:flex; flex-direction:column; align-items:center; gap:4px; border:none; cursor:pointer;
        background:transparent; color:inherit; padding:4px 0; border-radius:12px; animation: gwp-mb-pop .34s backwards;
      }
      #gwp-mb-menu .gwp-mb-ic {
        width: 44px; height: 44px; border-radius: 50%; display:flex; align-items:center; justify-content:center;
        font-size: 20px; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.10);
        transition: background .16s, box-shadow .16s, transform .12s;
      }
      #gwp-mb-menu .gwp-mb-item:hover .gwp-mb-ic { transform: translateY(-1px); background: rgba(255,255,255,.14); }
      #gwp-mb-menu .gwp-mb-item.on .gwp-mb-ic {
        background: linear-gradient(160deg, #6aa0ff, #7a5cff);
        box-shadow: 0 0 0 1px rgba(150,180,255,.5), 0 6px 16px rgba(90,120,255,.45);
      }
      #gwp-mb-menu .gwp-mb-lbl { font-size: 10px; opacity: .8; }

      #gwp-mb-menu .gwp-mb-row { display:flex; align-items:center; gap:10px; margin: 10px 2px; }
      #gwp-mb-menu .gwp-mb-row label { flex: 0 0 54px; font-size: 11px; opacity: .8; }
      #gwp-mb-menu .gwp-mb-row input[type=range] { flex: 1; accent-color: #7a9bff; cursor: pointer; }
      #gwp-mb-menu .gwp-mb-row .gwp-mb-val { flex: 0 0 34px; text-align:right; font-size: 11px; font-weight:600; color:#9fb4ff; }
      #gwp-mb-menu .gwp-mb-btn {
        width:100%; margin-top:6px; padding:9px; border:none; border-radius:12px; cursor:pointer;
        background: rgba(255,255,255,.10); color:#eef1ff; font-size:12px; font-weight:600; transition: background .15s;
      }
      #gwp-mb-menu .gwp-mb-btn:hover { background: rgba(122,155,255,.4); }
      #gwp-mb-menu .gwp-mb-back { background: transparent; border:none; color:#9fb4ff; cursor:pointer; font-size:12px; font-weight:600; }
      #gwp-mb-menu .gwp-mb-tint { display:flex; align-items:center; gap:10px; margin: 10px 2px; font-size:11px; opacity:.85; }
      #gwp-mb-menu input[type=color] { width:26px; height:22px; border:none; border-radius:5px; background:none; cursor:pointer; padding:0; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Ball ──────────────────────────────────────────────────
  function createBall() {
    if (ball) return;
    injectStyle();
    ball = document.createElement("div");
    ball.id = "gwp-mb-ball";
    ball.title = "Tap to open · drag to move";
    glass = document.createElement("div");
    glass.className = "gwp-mb-glass";
    ball.appendChild(glass);
    ball.addEventListener("pointerdown", onDown);
    ball.addEventListener("pointerenter", wake);
    document.body.appendChild(ball);
    place();
    armIdle();
  }
  function removeBall() {
    closeMenu(true);
    ball?.remove(); ball = null; glass = null;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }
  function place() {
    if (!ball) return;
    x = clamp(x, EDGE, window.innerWidth - SIZE - EDGE);
    y = clamp(y, EDGE, window.innerHeight - SIZE - EDGE);
    ball.style.left = x + "px";
    ball.style.top = y + "px";
  }
  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ball && !menuOpen && ball.classList.add("gwp-mb-idle"), IDLE_MS);
  }
  function wake() {
    if (!ball) return;
    ball.classList.remove("gwp-mb-idle");
    armIdle();
  }

  // ── Drag / tap ────────────────────────────────────────────
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    wake();
    dragging = true; moved = false;
    downX = e.clientX; downY = e.clientY;
    const r = ball.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
    ball.classList.add("gwp-mb-dragging");
    ball.setPointerCapture?.(e.pointerId);
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
  }
  function onMove(e) {
    if (!dragging) return;
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > CLICK_PX) moved = true;
    x = e.clientX - offX; y = e.clientY - offY;
    place();
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove("gwp-mb-dragging");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    if (moved) {
      // Snap to nearest horizontal edge (AssistiveTouch style).
      const cx = x + SIZE / 2;
      x = cx < window.innerWidth / 2 ? EDGE : window.innerWidth - SIZE - EDGE;
      place();
      chrome.storage.local.set({ [KEY_POS]: { x, y } });
    } else {
      toggleMenu();
    }
    armIdle();
  }

  // ── Menu ──────────────────────────────────────────────────
  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }

  function openMenu() {
    if (!ball) return;
    menuOpen = true; view = "home";
    wake(); ball.classList.remove("gwp-mb-idle");

    backdrop = document.createElement("div");
    backdrop.id = "gwp-mb-backdrop";
    backdrop.addEventListener("pointerdown", () => closeMenu());
    document.body.appendChild(backdrop);

    menu = document.createElement("div");
    menu.id = "gwp-mb-menu";
    document.body.appendChild(menu);
    renderMenu();
    positionMenu();

    requestAnimationFrame(() => {
      backdrop.classList.add("gwp-mb-show");
      menu.classList.add("gwp-mb-open");
    });
  }

  function closeMenu(immediate) {
    menuOpen = false;
    const m = menu, b = backdrop;
    menu = null; backdrop = null;
    if (!m) return;
    if (immediate) { m.remove(); b?.remove(); armIdle(); return; }
    m.classList.remove("gwp-mb-open");
    b?.classList.remove("gwp-mb-show");
    setTimeout(() => { m.remove(); b?.remove(); }, 260);
    armIdle();
  }

  function positionMenu() {
    if (!menu) return;
    const bw = 250, gap = 12;
    const r = ball.getBoundingClientRect();
    const openLeft = r.left + SIZE / 2 > window.innerWidth / 2;
    let left = openLeft ? r.left - bw - gap : r.right + gap;
    left = clamp(left, 8, window.innerWidth - bw - 8);
    const mh = menu.offsetHeight || 260;
    let top = clamp(r.top + SIZE / 2 - mh / 2, 8, window.innerHeight - mh - 8);
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    // Spring origin points back at the ball.
    menu.style.setProperty("--gwp-ox", (openLeft ? "100%" : "0%"));
    menu.style.setProperty("--gwp-oy", clamp(r.top + SIZE / 2 - top, 0, mh) + "px");
  }

  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    view === "settings" ? renderSettings() : renderHome();
    positionMenu();
  }

  function renderHome() {
    const head = document.createElement("div");
    head.className = "gwp-mb-head";
    head.innerHTML = `<span class="gwp-mb-title">Magic Ball</span><span class="gwp-mb-sub">tap a power</span>`;
    menu.appendChild(head);

    const grid = document.createElement("div");
    grid.className = "gwp-mb-grid";
    FEATURES.forEach((f, i) => {
      const on = !!state[f.key];
      const item = document.createElement("button");
      item.className = "gwp-mb-item" + (on ? " on" : "");
      item.style.animationDelay = (i * 28) + "ms";
      item.innerHTML = `<span class="gwp-mb-ic">${f.icon}</span><span class="gwp-mb-lbl">${f.label}</span>`;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        const next = !state[f.key];
        state[f.key] = next;
        chrome.storage.local.set({ [f.key]: next });
        item.classList.toggle("on", next);
        // Turning the ball itself off closes + removes it.
        if (f.self && !next) closeMenu();
      });
      grid.appendChild(item);
    });
    menu.appendChild(grid);

    const btn = document.createElement("button");
    btn.className = "gwp-mb-btn";
    btn.textContent = "⚙  Main Panel";
    btn.addEventListener("click", (e) => { e.stopPropagation(); view = "settings"; renderMenu(); });
    menu.appendChild(btn);
  }

  function renderSettings() {
    const head = document.createElement("div");
    head.className = "gwp-mb-head";
    const back = document.createElement("button");
    back.className = "gwp-mb-back"; back.textContent = "‹ Back";
    back.addEventListener("click", (e) => { e.stopPropagation(); view = "home"; renderMenu(); });
    const title = document.createElement("span");
    title.className = "gwp-mb-title"; title.textContent = "Main Panel";
    head.appendChild(back); head.appendChild(title);
    head.appendChild(document.createElement("span"));
    menu.appendChild(head);

    SLIDERS.forEach((sl) => {
      const raw = state[sl.key];
      const uiVal = sl.toUi ? sl.toUi(raw) : raw;
      const row = document.createElement("div");
      row.className = "gwp-mb-row";
      const lab = document.createElement("label"); lab.textContent = sl.label;
      const range = document.createElement("input");
      range.type = "range"; range.min = sl.min; range.max = sl.max; range.value = uiVal;
      const val = document.createElement("span");
      val.className = "gwp-mb-val"; val.textContent = uiVal + sl.unit;
      range.addEventListener("input", (e) => {
        e.stopPropagation();
        const ui = parseInt(range.value, 10);
        val.textContent = ui + sl.unit;
        const store = sl.toStore ? sl.toStore(ui) : ui;
        state[sl.key] = store;
        chrome.storage.local.set({ [sl.key]: store });
      });
      row.appendChild(lab); row.appendChild(range); row.appendChild(val);
      menu.appendChild(row);
    });

    // Glass tint colour
    const tint = document.createElement("div");
    tint.className = "gwp-mb-tint";
    const tlab = document.createElement("span"); tlab.textContent = "Glass tint"; tlab.style.flex = "1";
    const color = document.createElement("input");
    color.type = "color"; color.value = state.glassColor || "#000000";
    color.addEventListener("input", (e) => { e.stopPropagation(); state.glassColor = color.value; chrome.storage.local.set({ glassColor: color.value }); });
    tint.appendChild(tlab); tint.appendChild(color);
    menu.appendChild(tint);

    // Wallpaper image upload
    const up = document.createElement("button");
    up.className = "gwp-mb-btn"; up.textContent = "🖼  Set Wallpaper…";
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        chrome.storage.local.set({ imageData: reader.result, enabled: true });
        state.enabled = true;
      };
      reader.readAsDataURL(f);
    });
    up.addEventListener("click", (e) => { e.stopPropagation(); file.click(); });
    menu.appendChild(up);
    menu.appendChild(file);
  }

  // ── Storage sync ──────────────────────────────────────────
  function refreshHighlights() {
    if (menu && view === "home") {
      const items = menu.querySelectorAll(".gwp-mb-item");
      FEATURES.forEach((f, i) => items[i]?.classList.toggle("on", !!state[f.key]));
    }
  }

  const DEFAULTS = {};
  FEATURES.forEach((f) => (DEFAULTS[f.key] = f.def));
  SLIDERS.forEach((sl) => (DEFAULTS[sl.key] = sl.def == null ? 0 : (sl.toStore ? sl.toStore(sl.def) : sl.def)));
  DEFAULTS.glassColor = "#000000";
  DEFAULTS[KEY_POS] = null;

  chrome.storage.local.get(DEFAULTS, (s) => {
    Object.keys(DEFAULTS).forEach((k) => { if (k !== KEY_POS) state[k] = s[k]; });
    if (s[KEY_POS]) { x = s[KEY_POS].x; y = s[KEY_POS].y; }
    else { x = window.innerWidth - SIZE - EDGE; y = Math.round(window.innerHeight * 0.5); }
    if (s.magicBall) createBall();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) if (k in state || FEATURES.some((f) => f.key === k)) state[k] = changes[k].newValue;
    if ("magicBall" in changes) changes.magicBall.newValue ? createBall() : removeBall();
    refreshHighlights();
  });

  window.addEventListener("resize", () => { if (ball) { place(); if (menuOpen) positionMenu(); } });

  console.log("[Gemini Wallpaper] Magic ball module loaded.");
})();
