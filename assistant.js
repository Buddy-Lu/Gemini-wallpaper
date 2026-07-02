/**
 * Gemini Wallpaper - Assistant
 *
 * A floating glass orb (like the iPhone AssistiveTouch button):
 *   • draggable, snaps to the nearest screen edge on release
 *   • fades translucent when idle, wakes on touch/hover
 *   • breathing + glowing-glass shimmer
 *   • TAP springs open the Assistant menu
 *
 * Menu (laid out to match the guide): a scrollable grid of round feature icons
 * in a fixed order, a "settings" rounded-rectangle button below the grid, and
 * an intro tooltip that appears ON the icon you hover. Clicking a circle
 * toggles its feature or opens its mini-panel (wallpaper / pet / about).
 *
 * Writes only chrome.storage.local keys the other modules already watch.
 */
(function () {
  "use strict";

  const KEY_ON = "magicBall";        // storage key kept for back-compat
  const KEY_POS = "magicBallPos";
  const SIZE = 56;
  const EDGE = 14;
  const IDLE_MS = 2600;
  const CLICK_PX = 6;

  const ICO = (f) => chrome.runtime.getURL("icons/assistant/" + f);
  const GITHUB = "https://github.com/Buddy-Lu/Gemini-wallpaper";

  // README content for the About page — every feature + how to use it.
  const README = [
    { img: "wallpaper.png",   name: "Wallpaper",      how: "Set any image as Gemini's background. Open Assistant → wallpaper, or drag & drop / Ctrl+V an image onto the page. Tune dim, blur, brightness and glass tint in Settings." },
    { img: "pet.png",         name: "Pet",            how: "A little animated pet — duck, dog or fox — that wanders the screen. Drag it anywhere and it stays put." },
    { img: "chatbox.png",     name: "Chatbox Window", how: "Turns the input into a real window: 🔴 minimize to a chat chip, 🟡 restore, 🟢 maximize (Esc to exit). Drag the title bar to move, drag the edges to resize." },
    { img: "font.png",        name: "Word Font",      how: "Choose custom chat + CJK fonts from the toolbar popup." },
    { img: "highlighter.png", name: "Highlighter",    how: "Highlight text in a chat; the highlight re-anchors to the right words even after Gemini re-renders." },
    { img: "notes.png",       name: "Sticky Notes",   how: "Hit + Note, select some text, and a draggable note is linked to it with an arrow — pick the arrow colour." },
    { img: "bulk.png",        name: "Bulk Delete",    how: "Adds checkboxes to sidebar chats (recent and foldered). Tick several and delete them in one go." },
    { img: "math.png",        name: "Math Fixer",     how: "Renders LaTeX math in responses with bundled KaTeX." },
    { img: "hide.png",        name: "Hide Chat",      how: "Click the eye next to a message's Fork to collapse that exchange to a slim bar — great for long sessions." },
    { img: "buddy.png",       name: "Thinking Buddy", how: "A cute mascot appears while Gemini is generating, so the wait is less boring." },
    { img: "theme.png",       name: "Code Theme",     how: "Every code block gets a ⚙ panel: border style, monospace font & size, line numbers, tint, blur and radius." },
    { icon: "🔮",             name: "Assistant",      how: "This orb! Drag it to any edge; tap to open the menu. Hover an icon to read what it does, tap to toggle it on." },
  ];

  // Grid icons — order fixed to the guide. kind: toggle | wallpaper | pet | about | info
  // `img` = bundled PNG; `icon` = emoji fallback where no PNG was provided.
  const ITEMS = [
    { id: "enabled",           img: "wallpaper.png", label: "wallpaper",    kind: "wallpaper", intro: "Set a custom background — drag & drop, choose a file, or paste an image." },
    { id: "petEnabled",        img: "pet.png",       label: "pet",          kind: "pet",       intro: "A tiny animated pet that wanders the screen. Pick duck, dog or fox." },
    { id: "chatboxDraggable",  img: "chatbox.png",   label: "chatbox",      kind: "toggle",    intro: "Turn the input into a draggable, resizable window with traffic-light controls." },
    { id: "font",              img: "font.png",      label: "word font",    kind: "info",      intro: "Custom chat + CJK fonts, set from the toolbar popup." },
    { id: "about",             img: "about.png",     label: "about",        kind: "about",     intro: "About Gemini Wallpaper." },
    { id: "annotate",          img: "highlighter.png", label: "highlighter", kind: "info",      intro: "Highlight text in a chat; the highlight re-anchors even after Gemini re-renders." },
    { id: "notesEnabled",      img: "notes.png",     label: "sticky notes", kind: "toggle",    intro: "Notes linked by an arrow to highlighted text in a chat." },
    { id: "bulkDeleteEnabled", img: "bulk.png",      label: "bulk delete",  kind: "toggle",    intro: "Checkboxes on sidebar chats to delete many at once." },
    { id: "math",              img: "math.png",      label: "math fixer",   kind: "info",      intro: "Renders LaTeX math in responses via bundled KaTeX." },
    { id: "code",              img: "theme.png",     label: "code theme",   kind: "info",      intro: "Give each code block its own look — click the ⚙ on a block: border style, mono font & size, line numbers, tint, blur, radius." },
    { id: "hideChatEnabled",   img: "hide.png",      label: "Hide Chat",    kind: "toggle",    intro: "Collapse any exchange to a slim bar to tidy up long sessions." },
    { id: "thinkingBuddy",     img: "buddy.png",     label: "think buddy",  kind: "toggle",    intro: "A cute mascot that pops up while Gemini is thinking." },
  ];
  const iconHtml = (it) => it.img
    ? `<img src="${ICO(it.img)}" alt="" draggable="false">`
    : it.icon;

  const ON_KEYS = ["enabled", "petEnabled", "chatboxDraggable", "notesEnabled", "bulkDeleteEnabled", "hideChatEnabled", "thinkingBuddy"];

  const SLIDERS = [
    { key: "overlayOpacity", label: "Dim",    min: 0,  max: 100, def: 50,  toUi: (v) => Math.round(v * 100), toStore: (v) => v / 100, unit: "%" },
    { key: "blur",           label: "Blur",   min: 0,  max: 20,  def: 0,   unit: "px" },
    { key: "brightness",     label: "Bright", min: 30, max: 130, def: 100, unit: "%" },
    { key: "glassOpacity",   label: "Glass",  min: 0,  max: 100, def: 45,  unit: "%" },
  ];
  const PETS = [["duck", "Duck"], ["dog", "Dog"], ["fox", "Fox"]];

  let ball = null, glass = null, menu = null, backdrop = null, intro = null;
  let x = 24, y = 200;
  let dragging = false, moved = false, downX = 0, downY = 0, offX = 0, offY = 0;
  let idleTimer = null, menuOpen = false, view = "home", infoItem = null;
  const state = {};

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  // ── Style ─────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-as-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-as-style";
    st.textContent = `
      @keyframes gwp-as-spin  { to { transform: rotate(360deg); } }
      @keyframes gwp-as-hue   { 0%,100% { filter: hue-rotate(0deg); } 50% { filter: hue-rotate(45deg); } }
      @keyframes gwp-as-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
      @keyframes gwp-as-pop { 0% { transform: scale(.3); opacity: 0; } 60% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }

      #gwp-as-ball {
        position: fixed; z-index: 2147482000; width: ${SIZE}px; height: ${SIZE}px;
        cursor: grab; opacity: 1; touch-action: none;
        transition: left .34s cubic-bezier(.22,1,.36,1), top .34s cubic-bezier(.22,1,.36,1), opacity .45s ease, transform .12s ease;
      }
      #gwp-as-ball.gwp-as-dragging { transition: opacity .2s, transform .12s; cursor: grabbing; }
      #gwp-as-ball.gwp-as-idle { opacity: .42; }
      #gwp-as-ball:active { transform: scale(.9); }
      #gwp-as-ball .gwp-as-glass {
        width: 100%; height: 100%; border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow:
          inset 0 0 8px #ffffff,
          inset 4px 0 12px #ee82ee, inset -4px 0 12px #00ffff,
          inset 4px 0 44px #ee82ee, inset -4px 0 44px #00ffff,
          0 0 6px #ffffff, -5px 0 18px #ee82ee, 5px 0 18px #00ffff;
        animation: gwp-as-spin 5s linear infinite, gwp-as-hue 2.4s ease-in-out infinite, gwp-as-breathe 3.6s ease-in-out infinite;
      }

      #gwp-as-backdrop {
        position: fixed; inset: 0; z-index: 2147482400; background: rgba(6,7,16,.28);
        opacity: 0; transition: opacity .22s ease; backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
      }
      #gwp-as-backdrop.gwp-as-show { opacity: 1; }

      #gwp-as-menu {
        position: fixed; z-index: 2147482500; width: 270px; padding: 12px;
        border-radius: 24px; background: rgba(24,26,40,.74);
        backdrop-filter: blur(24px) saturate(1.3); -webkit-backdrop-filter: blur(24px) saturate(1.3);
        border: 1px solid rgba(255,255,255,.14); box-shadow: 0 18px 55px rgba(0,0,0,.55);
        color: #eef1ff; font-family: 'Segoe UI', system-ui, sans-serif;
        transform: scale(.35); opacity: 0; transform-origin: var(--gwp-ox, 100%) var(--gwp-oy, 100%);
        transition: transform .3s cubic-bezier(.2,1.25,.32,1), opacity .2s ease;
      }
      #gwp-as-menu.gwp-as-open { transform: scale(1); opacity: 1; }

      #gwp-as-menu .gwp-as-head { display:flex; align-items:center; gap:8px; margin: 2px 4px 8px; }
      #gwp-as-menu .gwp-as-title { font-size: 13px; font-weight: 700; letter-spacing:.3px; flex:1; }
      #gwp-as-menu .gwp-as-back { background: transparent; border:none; color:#9fb4ff; cursor:pointer; font-size:16px; font-weight:700; padding:0 4px; }

      /* Intro tooltip — positioned right on the hovered icon. */
      #gwp-as-menu .gwp-as-intro {
        position: absolute; z-index: 5; pointer-events:none; max-width: 200px;
        background: rgba(12,14,26,.97); border:1px solid rgba(255,255,255,.16); border-radius:11px;
        padding: 8px 11px; box-shadow: 0 8px 22px rgba(0,0,0,.55);
        opacity: 0; transform: translateY(-3px); transition: opacity .13s, transform .13s;
      }
      #gwp-as-menu .gwp-as-intro.show { opacity: 1; transform: translateY(0); }
      #gwp-as-menu .gwp-as-intro b { display:block; font-size:12px; margin-bottom:2px; }
      #gwp-as-menu .gwp-as-intro span { font-size: 11px; opacity:.82; line-height:1.35; }

      #gwp-as-menu .gwp-as-grid {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 4px;
        max-height: 238px; overflow-y: auto; padding: 4px 2px; scrollbar-width: thin;
      }
      #gwp-as-menu .gwp-as-grid::-webkit-scrollbar { width: 6px; }
      #gwp-as-menu .gwp-as-grid::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }

      #gwp-as-menu .gwp-as-item {
        display:flex; flex-direction:column; align-items:center; gap:5px; border:none; cursor:pointer;
        background:transparent; color:inherit; padding:2px 0; border-radius:12px; animation: gwp-as-pop .3s backwards;
      }
      /* Light tile so the (mostly dark line-art) icons stay visible; the
         "on" state is a blue ring/glow, not a fill that would hide the icon. */
      #gwp-as-menu .gwp-as-ic {
        width: 50px; height: 50px; border-radius: 15px; display:flex; align-items:center; justify-content:center;
        font-size: 22px; background: #f1f3fa; border: 1px solid rgba(255,255,255,.5);
        transition: box-shadow .16s, transform .12s; overflow: hidden;
      }
      #gwp-as-menu .gwp-as-ic img { width: 28px; height: 28px; object-fit: contain; pointer-events: none; display:block; }
      #gwp-as-menu .gwp-as-item:hover .gwp-as-ic { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.35); }
      #gwp-as-menu .gwp-as-item.on .gwp-as-ic {
        box-shadow: 0 0 0 2px #6aa0ff, 0 6px 16px rgba(90,120,255,.5);
      }
      #gwp-as-menu .gwp-as-lbl { font-size: 10px; opacity: .82; text-align:center; }

      /* settings — a rounded-rectangle button below the grid (NOT a circle). */
      #gwp-as-menu .gwp-as-settings {
        width:100%; margin-top:10px; padding:11px; border:none; border-radius:14px; cursor:pointer;
        background: rgba(255,255,255,.10); color:#eef1ff; font-size:13px; font-weight:600; transition: background .15s;
        display:flex; align-items:center; justify-content:center; gap:8px;
      }
      #gwp-as-menu .gwp-as-settings:hover { background: rgba(122,155,255,.42); }
      #gwp-as-menu .gwp-as-settings img { width:18px; height:18px; object-fit:contain; }

      #gwp-as-menu .gwp-as-row { display:flex; align-items:center; gap:10px; margin: 9px 4px; }
      #gwp-as-menu .gwp-as-row label { flex: 0 0 52px; font-size: 11px; opacity: .8; }
      #gwp-as-menu .gwp-as-row input[type=range] { flex: 1; accent-color: #7a9bff; cursor: pointer; }
      #gwp-as-menu .gwp-as-row .gwp-as-val { flex: 0 0 34px; text-align:right; font-size: 11px; font-weight:600; color:#9fb4ff; }
      #gwp-as-menu .gwp-as-btn {
        width:100%; margin-top:8px; padding:10px; border:none; border-radius:13px; cursor:pointer;
        background: rgba(255,255,255,.10); color:#eef1ff; font-size:12px; font-weight:600; transition: background .15s;
        display:flex; align-items:center; justify-content:center; gap:8px;
      }
      #gwp-as-menu .gwp-as-btn:hover { background: rgba(122,155,255,.42); }
      #gwp-as-menu .gwp-as-seg { display:flex; gap:6px; margin: 10px 4px; }
      #gwp-as-menu .gwp-as-seg button {
        flex:1; padding:9px 0; border-radius:11px; border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06); color:#dfe4f7; font-size:12px; font-weight:600; cursor:pointer; transition: all .15s;
      }
      #gwp-as-menu .gwp-as-seg button.on { background: linear-gradient(160deg,#6aa0ff,#7a5cff); border-color: transparent; box-shadow: 0 5px 14px rgba(90,120,255,.4); }
      #gwp-as-menu .gwp-as-tint { display:flex; align-items:center; gap:10px; margin: 10px 4px; font-size:11px; opacity:.85; }
      #gwp-as-menu input[type=color] { width:26px; height:22px; border:none; border-radius:5px; background:none; cursor:pointer; padding:0; }
      #gwp-as-menu .gwp-as-note { font-size:11px; opacity:.7; line-height:1.5; margin: 6px 6px 2px; }
      #gwp-as-menu .gwp-as-switch { display:flex; align-items:center; justify-content:space-between; margin: 8px 4px; }
      #gwp-as-menu .gwp-as-switch .lab { font-size:12px; font-weight:600; }
      #gwp-as-menu .gwp-as-pill { border:none; border-radius:20px; padding:6px 16px; font-size:11px; font-weight:700; cursor:pointer; color:#fff; }
      #gwp-as-menu .gwp-as-pill.on { background:#28c840; } #gwp-as-menu .gwp-as-pill.off { background: rgba(255,255,255,.16); }
      #gwp-as-menu .gwp-as-hero { display:flex; flex-direction:column; align-items:center; gap:8px; padding: 6px 4px 2px; text-align:center; }
      #gwp-as-menu .gwp-as-hero .big { font-size: 40px; width:56px; height:56px; border-radius:15px; background:#f1f3fa; display:flex; align-items:center; justify-content:center; }
      #gwp-as-menu .gwp-as-hero .big img { width:36px; height:36px; object-fit:contain; }
      /* Live CSS glowing orb for the About hero (same look as the ball). */
      #gwp-as-menu .gwp-as-hero-orb {
        width: 92px; height: 92px; border-radius: 50%; margin: 4px 0 2px;
        background: radial-gradient(circle at 50% 42%, rgba(255,255,255,.2), rgba(10,10,22,.18) 72%);
        box-shadow:
          inset 0 0 14px #ffffff,
          inset 7px 0 20px #ee82ee, inset -7px 0 20px #00ffff,
          inset 7px 0 74px #ee82ee, inset -7px 0 74px #00ffff,
          0 0 10px #ffffff, -8px 0 30px #ee82ee, 8px 0 30px #00ffff;
        animation: gwp-as-spin 5s linear infinite, gwp-as-hue 2.4s ease-in-out infinite, gwp-as-breathe 3.6s ease-in-out infinite;
      }

      /* README / About page */
      #gwp-as-menu .gwp-as-doc { max-height: 340px; overflow-y: auto; padding: 2px 4px 2px 2px; scrollbar-width: thin; }
      #gwp-as-menu .gwp-as-doc::-webkit-scrollbar { width: 6px; }
      #gwp-as-menu .gwp-as-doc::-webkit-scrollbar-thumb { background: rgba(255,255,255,.2); border-radius: 3px; }
      #gwp-as-menu .gwp-as-tagline { text-align:center; font-size:11px; opacity:.75; line-height:1.45; margin: 0 6px 10px; }
      #gwp-as-menu .gwp-as-gh {
        display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none;
        margin: 2px 2px 8px; padding:10px; border-radius:12px; color:#eef1ff; font-size:12px; font-weight:600;
        background: linear-gradient(160deg,#3a3f52,#22252f); border:1px solid rgba(255,255,255,.14); transition: filter .15s;
      }
      #gwp-as-menu .gwp-as-gh:hover { filter: brightness(1.2); }
      #gwp-as-menu .gwp-as-seclbl { font-size:10px; letter-spacing:1px; text-transform:uppercase; opacity:.5; margin: 8px 4px 4px; }
      #gwp-as-menu .gwp-as-feat { display:flex; gap:10px; align-items:flex-start; margin: 9px 3px; }
      #gwp-as-menu .gwp-as-feat .fic { flex:0 0 34px; width:34px; height:34px; border-radius:10px; background:#f1f3fa; display:flex; align-items:center; justify-content:center; font-size:18px; }
      #gwp-as-menu .gwp-as-feat .fic img { width:22px; height:22px; object-fit:contain; }
      #gwp-as-menu .gwp-as-feat .ftx b { font-size:12px; display:block; margin-bottom:2px; }
      #gwp-as-menu .gwp-as-feat .ftx span { font-size:11px; opacity:.78; line-height:1.42; }
      #gwp-as-menu .gwp-as-share { text-align:center; font-size:11px; opacity:.8; line-height:1.5; margin: 12px 6px 4px; }
      #gwp-as-menu .gwp-as-copy {
        margin: 6px auto 2px; display:block; border:none; border-radius:20px; padding:7px 18px; cursor:pointer;
        background: rgba(122,155,255,.25); color:#dfe6ff; font-size:11px; font-weight:700;
      }
      #gwp-as-menu .gwp-as-copy:hover { background: rgba(122,155,255,.45); }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Ball ──────────────────────────────────────────────────
  function createBall() {
    if (ball) return;
    injectStyle();
    ball = document.createElement("div");
    ball.id = "gwp-as-ball";
    ball.title = "Tap to open · drag to move";
    glass = document.createElement("div");
    glass.className = "gwp-as-glass";
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
    idleTimer = setTimeout(() => ball && !menuOpen && ball.classList.add("gwp-as-idle"), IDLE_MS);
  }
  function wake() { if (!ball) return; ball.classList.remove("gwp-as-idle"); armIdle(); }

  // ── Drag / tap ────────────────────────────────────────────
  function onDown(e) {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    wake();
    dragging = true; moved = false;
    downX = e.clientX; downY = e.clientY;
    const r = ball.getBoundingClientRect();
    offX = e.clientX - r.left; offY = e.clientY - r.top;
    ball.classList.add("gwp-as-dragging");
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
  function onUp() {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove("gwp-as-dragging");
    window.removeEventListener("pointermove", onMove, true);
    window.removeEventListener("pointerup", onUp, true);
    if (moved) {
      const cx = x + SIZE / 2;
      x = cx < window.innerWidth / 2 ? EDGE : window.innerWidth - SIZE - EDGE;
      place();
      chrome.storage.local.set({ [KEY_POS]: { x, y } });
    } else {
      toggleMenu();
    }
    armIdle();
  }

  // ── Menu shell ────────────────────────────────────────────
  function toggleMenu() { menuOpen ? closeMenu() : openMenu(); }
  function openMenu() {
    if (!ball) return;
    menuOpen = true; view = "home"; wake(); ball.classList.remove("gwp-as-idle");
    backdrop = document.createElement("div");
    backdrop.id = "gwp-as-backdrop";
    backdrop.addEventListener("pointerdown", () => closeMenu());
    document.body.appendChild(backdrop);
    menu = document.createElement("div");
    menu.id = "gwp-as-menu";
    document.body.appendChild(menu);
    renderMenu();
    requestAnimationFrame(() => { backdrop.classList.add("gwp-as-show"); menu.classList.add("gwp-as-open"); });
  }
  function closeMenu(immediate) {
    menuOpen = false;
    const m = menu, b = backdrop;
    menu = null; backdrop = null; intro = null;
    if (!m) return;
    if (immediate) { m.remove(); b?.remove(); armIdle(); return; }
    m.classList.remove("gwp-as-open"); b?.classList.remove("gwp-as-show");
    setTimeout(() => { m.remove(); b?.remove(); }, 260);
    armIdle();
  }
  function positionMenu() {
    if (!menu) return;
    const bw = 270, gap = 12;
    const r = ball.getBoundingClientRect();
    const openLeft = r.left + SIZE / 2 > window.innerWidth / 2;
    let left = openLeft ? r.left - bw - gap : r.right + gap;
    left = clamp(left, 8, window.innerWidth - bw - 8);
    const mh = menu.offsetHeight || 300;
    let top = clamp(r.top + SIZE / 2 - mh / 2, 8, window.innerHeight - mh - 8);
    menu.style.left = left + "px"; menu.style.top = top + "px";
    menu.style.setProperty("--gwp-ox", openLeft ? "100%" : "0%");
    menu.style.setProperty("--gwp-oy", clamp(r.top + SIZE / 2 - top, 0, mh) + "px");
  }
  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = "";
    if (view === "home") renderHome();
    else if (view === "settings") renderSettings();
    else if (view === "wallpaper") renderWallpaper();
    else if (view === "pet") renderPet();
    else if (view === "about") renderAbout();
    else if (view === "info") renderInfo();
    positionMenu();
  }

  function header(title, withBack) {
    const h = document.createElement("div");
    h.className = "gwp-as-head";
    if (withBack) {
      const back = document.createElement("button");
      back.className = "gwp-as-back"; back.textContent = "‹";
      back.addEventListener("click", (e) => { e.stopPropagation(); view = "home"; renderMenu(); });
      h.appendChild(back);
    }
    const t = document.createElement("div");
    t.className = "gwp-as-title"; t.textContent = title;
    h.appendChild(t);
    return h;
  }

  // ── Home (grid + settings button) ─────────────────────────
  function renderHome() {
    menu.appendChild(header("Assistant", false));

    intro = document.createElement("div");
    intro.className = "gwp-as-intro";
    intro.innerHTML = `<b></b><span></span>`;
    menu.appendChild(intro);

    const grid = document.createElement("div");
    grid.className = "gwp-as-grid";
    ITEMS.forEach((it, i) => {
      const on = ON_KEYS.includes(it.id) && !!state[it.id];
      const item = document.createElement("button");
      item.className = "gwp-as-item" + (on ? " on" : "");
      item.style.animationDelay = (i * 22) + "ms";
      item.innerHTML = `<span class="gwp-as-ic">${iconHtml(it)}</span><span class="gwp-as-lbl">${it.label}</span>`;
      item.addEventListener("mouseenter", () => showIntro(it, item));
      item.addEventListener("mouseleave", hideIntro);
      item.addEventListener("click", (e) => { e.stopPropagation(); onItem(it, item); });
      grid.appendChild(item);
    });
    menu.appendChild(grid);

    const settings = document.createElement("button");
    settings.className = "gwp-as-settings";
    settings.innerHTML = `<img src="${ICO("settings.png")}" alt="" draggable="false"><span>settings</span>`;
    settings.addEventListener("click", (e) => { e.stopPropagation(); view = "settings"; renderMenu(); });
    menu.appendChild(settings);
  }

  // Intro tooltip positioned right on the hovered icon.
  function showIntro(it, el) {
    if (!intro) return;
    intro.querySelector("b").textContent = it.label;
    intro.querySelector("span").textContent = it.intro;
    intro.classList.add("show");
    const mr = menu.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const tw = intro.offsetWidth, th = intro.offsetHeight;
    let left = er.left - mr.left + er.width / 2 - tw / 2;
    left = clamp(left, 6, menu.clientWidth - tw - 6);
    let top = er.top - mr.top - th - 8;              // above the icon
    if (top < 4) top = er.bottom - mr.top + 8;       // flip below if no room
    intro.style.left = left + "px";
    intro.style.top = top + "px";
  }
  function hideIntro() { intro && intro.classList.remove("show"); }

  function onItem(it, el) {
    if (it.kind === "toggle") {
      const next = !state[it.id];
      state[it.id] = next;
      chrome.storage.local.set({ [it.id]: next });
      el.classList.toggle("on", next);
      return;
    }
    if (it.kind === "wallpaper") { view = "wallpaper"; renderMenu(); return; }
    if (it.kind === "pet")      { view = "pet"; renderMenu(); return; }
    if (it.kind === "about")    { view = "about"; renderMenu(); return; }
    if (it.kind === "info")     { infoItem = it; view = "info"; renderMenu(); return; }
  }

  function switchRow(labelText, key) {
    const row = document.createElement("div");
    row.className = "gwp-as-switch";
    const lab = document.createElement("span"); lab.className = "lab"; lab.textContent = labelText;
    const pill = document.createElement("button");
    const paint = () => { const on = !!state[key]; pill.textContent = on ? "On" : "Off"; pill.className = "gwp-as-pill " + (on ? "on" : "off"); };
    paint();
    pill.addEventListener("click", (e) => { e.stopPropagation(); state[key] = !state[key]; chrome.storage.local.set({ [key]: state[key] }); paint(); });
    row.appendChild(lab); row.appendChild(pill);
    return row;
  }

  // ── Wallpaper sub-panel ───────────────────────────────────
  function renderWallpaper() {
    menu.appendChild(header("wallpaper", true));
    menu.appendChild(switchRow("Show wallpaper", "enabled"));
    const up = document.createElement("button");
    up.className = "gwp-as-btn"; up.textContent = "🖼  Choose image…";
    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.addEventListener("change", () => {
      const f = file.files && file.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => { chrome.storage.local.set({ imageData: reader.result, enabled: true }); state.enabled = true; view = "home"; renderMenu(); };
      reader.readAsDataURL(f);
    });
    up.addEventListener("click", (e) => { e.stopPropagation(); file.click(); });
    menu.appendChild(up); menu.appendChild(file);
    const note = document.createElement("div");
    note.className = "gwp-as-note";
    note.textContent = "You can also drag & drop an image onto the page, or press Ctrl+V to paste one.";
    menu.appendChild(note);
  }

  // ── Pet sub-panel ─────────────────────────────────────────
  function renderPet() {
    menu.appendChild(header("pet", true));
    menu.appendChild(switchRow("Show pet", "petEnabled"));
    const seg = document.createElement("div");
    seg.className = "gwp-as-seg";
    PETS.forEach(([val, txt]) => {
      const b = document.createElement("button");
      b.textContent = txt;
      if (state.petType === val) b.classList.add("on");
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state.petType = val; state.petEnabled = true;
        chrome.storage.local.set({ petType: val, petEnabled: true });
        seg.querySelectorAll("button").forEach((z) => z.classList.remove("on"));
        b.classList.add("on");
      });
      seg.appendChild(b);
    });
    menu.appendChild(seg);
    const note = document.createElement("div");
    note.className = "gwp-as-note"; note.textContent = "Drag the pet anywhere — it stays where you drop it.";
    menu.appendChild(note);
  }

  // ── Settings sub-panel ────────────────────────────────────
  function renderSettings() {
    menu.appendChild(header("settings", true));
    SLIDERS.forEach((sl) => {
      const raw = state[sl.key];
      const uiVal = sl.toUi ? sl.toUi(raw) : raw;
      const row = document.createElement("div");
      row.className = "gwp-as-row";
      const lab = document.createElement("label"); lab.textContent = sl.label;
      const range = document.createElement("input");
      range.type = "range"; range.min = sl.min; range.max = sl.max; range.value = uiVal;
      const val = document.createElement("span"); val.className = "gwp-as-val"; val.textContent = uiVal + sl.unit;
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
    const tint = document.createElement("div");
    tint.className = "gwp-as-tint";
    const tlab = document.createElement("span"); tlab.textContent = "Glass tint"; tlab.style.flex = "1";
    const color = document.createElement("input");
    color.type = "color"; color.value = state.glassColor || "#000000";
    color.addEventListener("input", (e) => { e.stopPropagation(); state.glassColor = color.value; chrome.storage.local.set({ glassColor: color.value }); });
    tint.appendChild(tlab); tint.appendChild(color);
    menu.appendChild(tint);
  }

  // ── About + generic info ──────────────────────────────────
  function renderAbout() {
    menu.appendChild(header("about", true));

    const doc = document.createElement("div");
    doc.className = "gwp-as-doc";

    const hero = document.createElement("div");
    hero.className = "gwp-as-hero";
    hero.innerHTML = `<div class="gwp-as-hero-orb"></div><div style="font-weight:700;font-size:15px;">Gemini Wallpaper</div>`;
    doc.appendChild(hero);

    const tag = document.createElement("div");
    tag.className = "gwp-as-tagline";
    tag.textContent = "Make Gemini yours — a wallpaper, a pet, a windowed chatbox and a pile of handy powers, all from one floating orb.";
    doc.appendChild(tag);

    const gh = document.createElement("a");
    gh.className = "gwp-as-gh";
    gh.href = GITHUB; gh.target = "_blank"; gh.rel = "noopener noreferrer";
    gh.innerHTML = `<span>★</span><span>Star it on GitHub — Buddy-Lu/Gemini-wallpaper</span>`;
    doc.appendChild(gh);

    const sec = document.createElement("div");
    sec.className = "gwp-as-seclbl"; sec.textContent = "Features · how to use";
    doc.appendChild(sec);

    README.forEach((f) => {
      const row = document.createElement("div");
      row.className = "gwp-as-feat";
      const ic = document.createElement("div");
      ic.className = "fic";
      ic.innerHTML = f.img ? `<img src="${ICO(f.img)}" alt="" draggable="false">` : f.icon;
      const tx = document.createElement("div");
      tx.className = "ftx";
      const b = document.createElement("b"); b.textContent = f.name;
      const s = document.createElement("span"); s.textContent = f.how;
      tx.appendChild(b); tx.appendChild(s);
      row.appendChild(ic); row.appendChild(tx);
      doc.appendChild(row);
    });

    const share = document.createElement("div");
    share.className = "gwp-as-share";
    share.innerHTML = "Made with 💜 — if you like it, tell your friends!";
    doc.appendChild(share);

    const copy = document.createElement("button");
    copy.className = "gwp-as-copy";
    copy.textContent = "Copy share link";
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard?.writeText(GITHUB).then(
        () => { copy.textContent = "Copied! ✓"; setTimeout(() => (copy.textContent = "Copy share link"), 1600); },
        () => { copy.textContent = GITHUB; }
      );
    });
    doc.appendChild(copy);

    menu.appendChild(doc);
  }
  function renderInfo() {
    const it = infoItem || { label: "", intro: "" };
    menu.appendChild(header(it.label, true));
    const hero = document.createElement("div");
    hero.className = "gwp-as-hero";
    hero.innerHTML = `<div class="big">${iconHtml(it)}</div>`;
    menu.appendChild(hero);
    const note = document.createElement("div");
    note.className = "gwp-as-note"; note.textContent = it.intro;
    menu.appendChild(note);
  }

  // ── Storage sync ──────────────────────────────────────────
  function refreshHighlights() {
    if (menu && view === "home") {
      const items = menu.querySelectorAll(".gwp-as-item");
      ITEMS.forEach((it, i) => items[i]?.classList.toggle("on", ON_KEYS.includes(it.id) && !!state[it.id]));
    }
  }

  const DEFAULTS = { petType: "duck", glassColor: "#000000", [KEY_POS]: null, [KEY_ON]: false };
  ON_KEYS.forEach((k) => (DEFAULTS[k] = k === "enabled" || k === "thinkingBuddy" || k === "hideChatEnabled"));
  SLIDERS.forEach((sl) => (DEFAULTS[sl.key] = sl.toStore ? sl.toStore(sl.def) : sl.def));

  chrome.storage.local.get(DEFAULTS, (s) => {
    Object.keys(DEFAULTS).forEach((k) => { if (k !== KEY_POS) state[k] = s[k]; });
    if (s[KEY_POS]) { x = s[KEY_POS].x; y = s[KEY_POS].y; }
    else { x = window.innerWidth - SIZE - EDGE; y = Math.round(window.innerHeight * 0.5); }
    if (s[KEY_ON]) createBall();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const k in changes) if (k in state) state[k] = changes[k].newValue;
    if (KEY_ON in changes) changes[KEY_ON].newValue ? createBall() : removeBall();
    refreshHighlights();
  });

  window.addEventListener("resize", () => { if (ball) { place(); if (menuOpen) positionMenu(); } });

  console.log("[Gemini Wallpaper] Assistant module loaded.");
})();
