/**
 * Gemini Wallpaper - Animated Pet
 *
 * Supports multiple pet types. Sprite GIFs from the vscode-pets project.
 */
(function () {
  "use strict";

  const RAW = "https://raw.githubusercontent.com/tonybaloney/vscode-pets/master/media/";

  // ── Pet catalogue ─────────────────────────────────────────
  const PETS = {
    duck: { folder: "rubber-duck", prefix: "yellow", hasLie: false },
    dog:  { folder: "dog",         prefix: "akita",  hasLie: true  },
    fox:  { folder: "fox",         prefix: "red",    hasLie: true  },
  };

  function gifsFor(type) {
    const p = PETS[type] || PETS.duck;
    const b = `${RAW}${p.folder}/${p.prefix}_`;
    return {
      idle:  b + "idle_8fps.gif",
      walk:  b + "walk_8fps.gif",
      run:   b + "run_8fps.gif",
      swipe: b + "swipe_8fps.gif",
      lie:   p.hasLie ? b + "lie_8fps.gif" : b + "idle_8fps.gif",
    };
  }

  function statesFor(gifs) {
    return {
      idle:      { gif: gifs.idle,  vx:  0,    flip: false, minMs: 1800, maxMs: 5000 },
      walkRight: { gif: gifs.walk,  vx:  1.4,  flip: false, minMs: 2000, maxMs: 4500 },
      walkLeft:  { gif: gifs.walk,  vx: -1.4,  flip: true,  minMs: 2000, maxMs: 4500 },
      runRight:  { gif: gifs.run,   vx:  3.2,  flip: false, minMs:  800, maxMs: 2200 },
      runLeft:   { gif: gifs.run,   vx: -3.2,  flip: true,  minMs:  800, maxMs: 2200 },
      swipe:     { gif: gifs.swipe, vx:  0,    flip: false, minMs: 1400, maxMs: 1400 },
      lie:       { gif: gifs.lie,   vx:  0,    flip: false, minMs: 2000, maxMs: 6000 },
    };
  }

  const TRANSITIONS = {
    idle:      [["idle", 2], ["walkRight", 3], ["walkLeft", 3], ["runRight", 1], ["runLeft", 1], ["swipe", 0.5], ["lie", 0.5]],
    walkRight: [["idle", 2], ["walkRight", 3], ["runRight", 1.5], ["swipe", 0.5]],
    walkLeft:  [["idle", 2], ["walkLeft",  3], ["runLeft",  1.5], ["swipe", 0.5]],
    runRight:  [["idle", 1], ["walkRight", 2], ["runRight", 1]],
    runLeft:   [["idle", 1], ["walkLeft",  2], ["runLeft",  1]],
    swipe:     [["idle", 3], ["walkLeft",  1], ["walkRight", 1]],
    lie:       [["idle", 2], ["walkLeft",  1], ["walkRight", 1]],
  };

  const PET_SIZE = 80;

  // ── Runtime state ─────────────────────────────────────────
  let enabled  = false;
  let petType  = "duck";
  let GIFS     = gifsFor("duck");
  let STATES   = statesFor(GIFS);

  let petEl   = null;
  let imgEl   = null;
  let posX    = 120;
  let state   = "idle";
  let stateMs = 0;
  let animId  = null;
  let lastNow = 0;
  let bottomRefreshTimer = 0;

  // Drag placement
  let groundPx   = 120;     // resting vertical level (px from bottom)
  let autoGround = true;    // follow the input bar until the pet is placed
  let bottomPx   = 120;     // current CSS bottom (px)
  let dragging   = false;
  let dragDX = 0, dragDY = 0; // cursor→pet offset while grabbed

  // ── Helpers ───────────────────────────────────────────────
  function pick(choices) {
    const total = choices.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [name, w] of choices) { r -= w; if (r <= 0) return name; }
    return choices[0][0];
  }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function maxX() { return window.innerWidth - PET_SIZE; }

  function bottomOffset() {
    const selectors = [
      "input-container", "input-area-v2", "input-area-v3", "input-area-v4",
      ".input-area", ".input-area-container",
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.top > window.innerHeight * 0.7)
          return window.innerHeight - rect.top + 10;
      }
    }
    return 120;
  }

  // ── State machine ─────────────────────────────────────────
  function enterState(name) {
    if ((name === "walkRight" || name === "runRight") && posX >= maxX() * 0.95)
      name = name.replace("Right", "Left");
    if ((name === "walkLeft"  || name === "runLeft")  && posX <= 4)
      name = name.replace("Left", "Right");

    state = name;
    const s = STATES[name];
    stateMs = rand(s.minMs, s.maxMs);
    if (imgEl.src !== s.gif) imgEl.src = s.gif;
    imgEl.style.transform = s.flip ? "scaleX(-1)" : "scaleX(1)";
  }

  // ── Tick ──────────────────────────────────────────────────
  function tick(now) {
    if (!enabled || !petEl) return;
    animId = requestAnimationFrame(tick);

    const dt = lastNow ? Math.min(now - lastNow, 100) : 16;
    lastNow = now;

    // While grabbed the pet is positioned by the mouse handlers — freeze here
    // but keep the RAF loop alive so it resumes cleanly on release.
    if (dragging) return;

    // Resting level: track the input bar until the user drops the pet
    // somewhere — after that it stays where it was placed.
    if (autoGround) {
      bottomRefreshTimer += dt;
      if (bottomRefreshTimer >= 2000) {
        bottomRefreshTimer = 0;
        groundPx = bottomOffset();
      }
    }
    bottomPx = groundPx;

    stateMs -= dt;
    if (stateMs <= 0) enterState(pick(TRANSITIONS[state] || TRANSITIONS.idle));

    posX += STATES[state].vx * (dt / 16);
    if (posX < 0)      { posX = 0;      enterState(state.includes("Left")  ? state.replace("Left",  "Right") : "idle"); }
    if (posX > maxX()) { posX = maxX(); enterState(state.includes("Right") ? state.replace("Right", "Left")  : "idle"); }

    petEl.style.left = Math.round(posX) + "px";
    petEl.style.bottom = Math.round(bottomPx) + "px";
  }

  // ── Drag handling ─────────────────────────────────────────
  function onPetDown(e) {
    if (!enabled || !petEl || e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    const rect = petEl.getBoundingClientRect();
    dragDX = e.clientX - rect.left;
    dragDY = e.clientY - rect.top;
    petEl.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    // Hold pose: freeze on idle, facing forward.
    state = "idle";
    stateMs = Infinity;
    if (imgEl.src !== GIFS.idle) imgEl.src = GIFS.idle;
    imgEl.style.transform = "scaleX(1)";
    document.addEventListener("mousemove", onPetMove, true);
    document.addEventListener("mouseup", onPetUp, true);
  }

  function onPetMove(e) {
    if (!dragging) return;
    e.preventDefault();
    posX = clamp(e.clientX - dragDX, 0, maxX());
    const top = e.clientY - dragDY;
    bottomPx = clamp(window.innerHeight - top - PET_SIZE, 0, window.innerHeight - PET_SIZE);
    petEl.style.left = Math.round(posX) + "px";
    petEl.style.bottom = Math.round(bottomPx) + "px";
  }

  function onPetUp() {
    if (!dragging) return;
    dragging = false;
    lastNow = 0; // reset dt so it doesn't jump after the pause
    groundPx = bottomPx; // keep the pet at the height it was dropped
    autoGround = false;  // stop snapping back to the input bar
    enterState("idle");  // restart the state machine (stateMs was frozen)
    petEl.style.cursor = "grab";
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onPetMove, true);
    document.removeEventListener("mouseup", onPetUp, true);
  }

  // ── DOM ───────────────────────────────────────────────────
  function createPet() {
    if (document.getElementById("gwp-pet")) return;

    petEl = document.createElement("div");
    petEl.id = "gwp-pet";
    Object.assign(petEl.style, {
      position: "fixed",
      bottom: bottomOffset() + "px",
      left: posX + "px",
      width: PET_SIZE + "px",
      height: PET_SIZE + "px",
      zIndex: "9998",
      pointerEvents: "auto",
      userSelect: "none",
      cursor: "grab",
      touchAction: "none",
    });
    petEl.title = "Drag me!";

    imgEl = document.createElement("img");
    Object.assign(imgEl.style, {
      width: "100%", height: "100%",
      objectFit: "contain",
      imageRendering: "pixelated",
      pointerEvents: "none",
    });
    imgEl.alt = "";
    imgEl.draggable = false; // suppress native image drag-and-drop

    petEl.appendChild(imgEl);
    petEl.addEventListener("mousedown", onPetDown);
    document.body.appendChild(petEl);

    window.addEventListener("resize", () => {
      if (petEl) petEl.style.bottom = bottomOffset() + "px";
    });
  }

  function startPet() {
    createPet();
    posX = rand(PET_SIZE, window.innerWidth - PET_SIZE * 2);
    lastNow = 0;
    bottomRefreshTimer = 0;
    groundPx = bottomOffset();
    autoGround = true;
    bottomPx = groundPx;
    dragging = false;
    enterState("idle");
    animId = requestAnimationFrame(tick);
  }

  function stopPet() {
    cancelAnimationFrame(animId);
    animId = null;
    if (dragging) {
      dragging = false;
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onPetMove, true);
      document.removeEventListener("mouseup", onPetUp, true);
    }
    document.getElementById("gwp-pet")?.remove();
    petEl = null;
    imgEl = null;
  }

  function applyEnabled(val) {
    enabled = !!val;
    enabled ? startPet() : stopPet();
  }

  function applyType(type) {
    petType = PETS[type] ? type : "duck";
    GIFS   = gifsFor(petType);
    STATES = statesFor(GIFS);
    // If pet is running, restart so it picks up the new sprites
    if (enabled) { stopPet(); startPet(); }
  }

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get({ petEnabled: false, petType: "duck" }, (s) => {
    applyType(s.petType);
    applyEnabled(s.petEnabled);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("petType"    in changes) applyType(changes.petType.newValue);
    if ("petEnabled" in changes) applyEnabled(changes.petEnabled.newValue);
  });

})();
