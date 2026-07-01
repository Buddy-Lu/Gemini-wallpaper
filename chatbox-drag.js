/**
 * Gemini Wallpaper - Draggable chatbox with jelly physics
 *
 * Drag translates the chatbox via CSS transform (no layout reflow).
 * Velocity drives a live skewX + stretch deformation that springs back.
 *
 * Side walls (mouse-bound morph, NO rotation):
 *   When the chatbox center reaches a side wall, the position locks (wall-side
 *   edge stays at the wall) and morphT is computed each mousemove as
 *   (mouse overshoot past wall) / MORPH_FULL_PX, clamped 0..1.
 *   The transform scales width → H/W and height → W/H (volume preserved),
 *   with transform-origin pinned to the wall-side edge. Border-radius is
 *   compensated so the visible corner stays round at any scale.
 *   The chatbox's children (input field, buttons, icons) get faded out as
 *   morphT grows — a transform: scale on the parent crushes children visually,
 *   so we hide them and let only the outer pill's bg/blur show through.
 *   Pulling the mouse back away from the wall scrubs morphT back to 0
 *   immediately — fully reversible.
 *   On mouseup, morphT LATCHES at its current value (no spring-back). To
 *   un-morph, grab the box again and drag the mouse away, or double-click
 *   the handle to reset.
 *
 * Two ways to start a drag:
 *   1. The floating blue handle above the chatbox
 *   2. Mousedown directly on the chatbox itself (anywhere that isn't an
 *      input / button / contenteditable). Lets you grab the bubble even
 *      if the handle is hard to spot.
 *
 * Scale: `chatboxScale` (50–150%) applies even when drag is off.
 */
(function () {
  "use strict";

  // First visible match wins. input-area-v2 is the historical chatbox tag.
  // Add v3/v4 to survive Gemini renaming. input-container last — it's a thin
  // gradient strip on the zero-state screen, not the real chatbox.
  const SELECTORS = [
    "input-area-v2", "input-area-v3", "input-area-v4",
    ".text-input-field", ".input-area",
    "input-container",
  ];
  const HANDLE_ID = "gwp-chatbox-handle";

  // ── Feature state ─────────────────────────────────────────
  let dragEnabled = false;
  let userScale   = 1.0;
  let chatbox     = null;
  let handle      = null;
  let observer    = null;

  // Rest geometry (chatbox bounds with NO transform applied)
  let restCenterX = 0, restCenterY = 0;
  let restWidth   = 0, restHeight  = 0;

  // Drag state
  let dragging    = false;
  let dragStartX  = 0, dragStartY  = 0;
  let dragStartTX = 0, dragStartTY = 0;
  let translateX  = 0, translateY  = 0;

  // Mouse velocity (px / ms), smoothed
  let velX = 0, velY = 0;
  let lastMouseX = 0, lastMouseY = 0;
  let lastMoveTime = 0;

  // Jelly deformation (deltas from identity, only used when NOT morphed against a wall)
  let defSkewX = 0, defStretchX = 0, defStretchY = 0;
  let defSkewVX = 0, defStretchVX = 0, defStretchVY = 0;

  // Mouse-bound side-wall morph (NO springs, NO rotation).
  // morphT is recomputed each mousemove from raw mouse overshoot past the wall;
  // pulling the mouse back scrubs it down. On mouseup it decays to 0.
  let morphT    = 0;        // 0..1, current applied morph progress
  let morphSide = "none";   // "left" | "right" | "none"

  let animId = null;

  // Tuning
  const STIFFNESS       = 0.20;
  const DAMPING         = 0.65;
  const K_SKEW          = 14;     // deg per (px/ms) of horizontal velocity
  const K_STRETCH       = 0.18;
  const VEL_CLAMP       = 1.5;
  const MORPH_FULL_PX   = 140;    // mouse must push this many px past the wall to reach morphT = 1
  const MORPH_CORNER_PX = 26;     // visible border-radius (px) during morph
  const CONTENT_FADE_K  = 3.5;    // morphT * CONTENT_FADE_K = how fast children fade (1.0 ≈ fully hidden at morphT ≈ 0.29)

  // ── Utilities ─────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // Fade the chatbox's direct children — they get visually crushed by the
  // outer scale(), so we hide them and let only the outer pill (background
  // + backdrop-blur from the wallpaper extension's CSS) show through.
  // Cached so we don't reapply identical styles every frame.
  let lastChildOpacity = -1;
  function setChildOpacity(o) {
    if (!chatbox) return;
    if (Math.abs(o - lastChildOpacity) < 0.01) return;
    lastChildOpacity = o;
    const v = o >= 0.999 ? "" : String(o);
    for (const c of chatbox.children) c.style.opacity = v;
  }

  // ── DOM lookup ────────────────────────────────────────────
  function findChatbox() {
    for (const sel of SELECTORS) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.getBoundingClientRect().height > 0) return el;
      }
    }
    return null;
  }

  function captureRest() {
    // Freeze rest geometry for the duration of a drag — any recapture while
    // dragging would corrupt translate math (mouse-to-position is computed
    // relative to the rest captured at mousedown).
    if (!chatbox || dragging) return;
    const saved = chatbox.style.transform;
    chatbox.style.transform = "";
    void chatbox.offsetHeight; // force reflow before measurement
    const r = chatbox.getBoundingClientRect();
    restCenterX = r.left + r.width  / 2;
    restCenterY = r.top  + r.height / 2;
    restWidth   = r.width;
    restHeight  = r.height;
    chatbox.style.transform = saved;
  }

  // ── Handle (visible affordance) ───────────────────────────
  function createHandle() {
    if (handle) return;
    handle = document.createElement("div");
    handle.id = HANDLE_ID;
    Object.assign(handle.style, {
      position:    "fixed",
      width:       "52px",
      height:      "12px",
      background:  "rgba(74, 124, 255, 0.65)",
      borderRadius: "8px",
      cursor:      "grab",
      zIndex:      "9999",
      boxShadow:   "0 2px 10px rgba(0, 0, 0, 0.35)",
      transition:  "background 0.15s, transform 0.15s",
      pointerEvents: "auto",
    });
    handle.title = "Drag chatbox — or drag the chatbox itself. Double-click to reset.";
    handle.addEventListener("mousedown", startDrag);
    handle.addEventListener("dblclick", resetPosition);
    handle.addEventListener("mouseenter", () => {
      handle.style.background = "rgba(74, 124, 255, 0.9)";
      handle.style.transform  = "scale(1.1)";
    });
    handle.addEventListener("mouseleave", () => {
      if (!dragging) {
        handle.style.background = "rgba(74, 124, 255, 0.65)";
        handle.style.transform  = "scale(1)";
      }
    });
    document.body.appendChild(handle);
  }

  function removeHandle() {
    handle?.remove();
    handle = null;
  }

  // Handle follows the VISIBLE box. During a wall morph the rest-frame center
  // stays put but the visual center shifts toward the wall (transform-origin is
  // pinned there), and visible height grows from halfRestH → halfRestW. Track
  // both so the handle stays anchored above the morphed strip.
  function positionHandle() {
    if (!handle) return;
    const halfRestW = (restWidth  / 2) * userScale;
    const halfRestH = (restHeight / 2) * userScale;
    const halfVisibleW = halfRestW + morphT * (halfRestH - halfRestW);
    const halfVisibleH = halfRestH + morphT * (halfRestW - halfRestH);

    let cx;
    if (morphSide === "right" && morphT > 0)      cx = window.innerWidth - halfVisibleW;
    else if (morphSide === "left"  && morphT > 0) cx = halfVisibleW;
    else                                           cx = restCenterX + translateX;
    const cy = restCenterY + translateY;

    const desiredLeft = cx - 26;
    const desiredTop  = cy - halfVisibleH - 18;
    handle.style.left = clamp(desiredLeft, 4, window.innerWidth  - 56) + "px";
    handle.style.top  = clamp(desiredTop,  4, window.innerHeight - 24) + "px";
  }

  // ── Transform ─────────────────────────────────────────────
  function isIdentity() {
    return userScale === 1
      && translateX === 0 && translateY === 0
      && Math.abs(defSkewX)    < 0.05
      && Math.abs(defStretchX) < 0.001
      && Math.abs(defStretchY) < 0.001
      && morphT < 0.001;
  }

  function applyTransform() {
    if (!chatbox) return;
    if (isIdentity()) {
      chatbox.style.transform       = "";
      chatbox.style.transformOrigin = "";
      chatbox.style.borderRadius    = "";
      chatbox.style.overflow        = "";
      chatbox.style.willChange      = "";
      setChildOpacity(1);
      return;
    }

    if (morphT > 0 && morphSide !== "none") {
      // Volume-preserving squash + stretch.
      // At morphT=0: scale (1, 1) — natural shape.
      // At morphT=1: scaleX = H/W (shrink wide pill to a thin vertical strip),
      //              scaleY = W/H (grow tall to the same volume).
      // Origin is pinned to the wall-side edge so the box collapses INTO the wall.
      const aspect = restHeight / restWidth; // wide pill ⇒ aspect ≪ 1
      const sx = userScale * (1 + morphT * (aspect       - 1));
      const sy = userScale * (1 + morphT * (1 / aspect   - 1));
      const originX = morphSide === "right" ? "100%" : "0%";

      // Compensate border-radius so the visible corner stays ~MORPH_CORNER_PX
      // after the scale chews on it. Browser clamps to half-side automatically,
      // so a huge pre-scale radius just yields a clean pill at any aspect.
      const rx = MORPH_CORNER_PX / Math.max(sx, 0.001);
      const ry = MORPH_CORNER_PX / Math.max(sy, 0.001);

      chatbox.style.transform       = `translate(${translateX}px, ${translateY}px) scale(${sx}, ${sy})`;
      chatbox.style.transformOrigin = `${originX} 50%`;
      chatbox.style.borderRadius    = `${rx}px / ${ry}px`;
      chatbox.style.overflow        = "hidden"; // suppress portal/overflow content escaping the pill
      chatbox.style.willChange      = "transform";

      // Hide inner content so the children don't render crushed/stretched
      // within the scaled pill. Fully faded by ~morphT 0.29 → from then on
      // the pill is a clean colored strip.
      setChildOpacity(clamp(1 - morphT * CONTENT_FADE_K, 0, 1));
      return;
    }

    // Free drag (no morph): velocity-driven skew + stretch around center.
    const sx = userScale * (1 + defStretchX);
    const sy = userScale * (1 + defStretchY);
    chatbox.style.transform =
      `translate(${translateX}px, ${translateY}px) scale(${sx}, ${sy}) skewX(${defSkewX}deg)`;
    chatbox.style.transformOrigin = "center center";
    chatbox.style.borderRadius    = "";
    chatbox.style.overflow        = "";
    chatbox.style.willChange      = "transform";
    setChildOpacity(1);
  }

  // ── Wall morph + position clamp ──────────────────────────
  // SCRUB MODEL: morphT is a direct function of mouse overshoot past a side wall.
  // No springs, no easing on the way in — pull the mouse back and the morph
  // immediately unwinds. (Only on mouseup does morphT decay over a few frames.)
  //
  //   morphT = clamp((mouseOvershootPastWall) / MORPH_FULL_PX, 0, 1)
  //
  // While morphT > 0, the rest-frame box's wall-side edge is locked at the wall.
  // The visible squash + stretch comes entirely from applyTransform()'s scale +
  // transform-origin = wall edge.
  function updateWallPressureAndClamp(desiredTX, desiredTY) {
    const halfRestW = (restWidth  / 2) * userScale;
    const halfRestH = (restHeight / 2) * userScale;

    const desiredCx = restCenterX + desiredTX;
    const desiredCy = restCenterY + desiredTY;

    // Rest-frame overshoot past each side wall (in px, positive when past).
    const overflowLeft  = (halfRestW) - desiredCx;                              // >0 if pushing left
    const overflowRight = desiredCx - (window.innerWidth  - halfRestW);         // >0 if pushing right

    // Pick the dominant side. Ties (neither active) ⇒ morph clears.
    if (overflowRight > 0 && overflowRight >= overflowLeft) {
      morphSide = "right";
      morphT    = clamp(overflowRight / MORPH_FULL_PX, 0, 1);
      // Lock the unscaled box's right edge at the right wall — scale collapses
      // toward this edge via transform-origin, so the wall-side stays flush.
      translateX = (window.innerWidth - halfRestW) - restCenterX;
    } else if (overflowLeft > 0) {
      morphSide = "left";
      morphT    = clamp(overflowLeft / MORPH_FULL_PX, 0, 1);
      translateX = halfRestW - restCenterX;
    } else {
      // Not pushing into a side wall — free drag. Scrub morph back to 0
      // IMMEDIATELY so reversal is seamless and mouse-bound.
      morphSide = "none";
      morphT    = 0;
      translateX = clamp(desiredTX, halfRestW - restCenterX, (window.innerWidth - halfRestW) - restCenterX);
    }

    // Y axis: no morph; just keep the center inside the viewport.
    translateY = clamp(desiredTY, halfRestH - restCenterY, (window.innerHeight - halfRestH) - restCenterY);
  }

  // ── Drag ──────────────────────────────────────────────────
  function startDrag(e) {
    if (!chatbox || dragging) return; // ignore re-entrant calls — a second
    // startDrag mid-drag would reset dragStart* to a stale mouse position
    // and corrupt the translate math.
    e.preventDefault();
    e.stopPropagation();
    captureRest();
    dragging = true;
    if (handle) handle.style.cursor = "grabbing";
    document.body.style.cursor     = "grabbing";
    document.body.style.userSelect = "none";

    dragStartX  = e.clientX;
    dragStartY  = e.clientY;
    // If re-grabbing a latched morph, pre-load dragStartTX with the morph's
    // virtual overshoot so the first mouse delta scrubs from the current morphT
    // instead of snapping to 0 (translateX is locked at the wall, so without
    // this offset desiredCx = wall position and morphT instantly collapses).
    const morphOvershoot = morphT * MORPH_FULL_PX *
      (morphSide === "right" ? 1 : morphSide === "left" ? -1 : 0);
    dragStartTX = translateX + morphOvershoot;
    dragStartTY = translateY;
    lastMouseX  = e.clientX;
    lastMouseY  = e.clientY;
    lastMoveTime = performance.now();
    velX = 0;
    velY = 0;

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   endDrag);

    if (!animId) animId = requestAnimationFrame(tick);
  }

  function onMouseMove(e) {
    if (!dragging) return;
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveTime);
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    velX = velX * 0.5 + (dx / dt) * 0.5;
    velY = velY * 0.5 + (dy / dt) * 0.5;

    const desiredTX = dragStartTX + (e.clientX - dragStartX);
    const desiredTY = dragStartTY + (e.clientY - dragStartY);
    updateWallPressureAndClamp(desiredTX, desiredTY);

    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastMoveTime = now;
  }

  function endDrag() {
    dragging = false;
    // morphT keeps its current value here — the tick loop will decay it to 0.
    if (handle) handle.style.cursor = "grab";
    document.body.style.cursor     = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup",   endDrag);
  }

  function resetPosition() {
    translateX = translateY = 0;
    defSkewX = defStretchX = defStretchY = 0;
    defSkewVX = defStretchVX = defStretchVY = 0;
    morphT = 0;
    morphSide = "none";
    applyTransform();
    positionHandle();
  }

  // ── Direct chatbox drag (anywhere on the bubble) ──────────
  function isInteractiveTarget(target) {
    if (!target || target.nodeType !== 1) return false;
    return !!target.closest(
      'input, textarea, button, [contenteditable="true"], [role="button"], ' +
      '[role="textbox"], a, mat-icon, .mat-icon, .ql-editor, rich-textarea'
    );
  }

  function onChatboxMouseDown(e) {
    if (!dragEnabled || !chatbox || dragging) return;
    if (isInteractiveTarget(e.target)) return; // don't hijack typing/buttons
    startDrag(e);
  }

  // ── Animation tick ────────────────────────────────────────
  function tick() {
    if (!dragEnabled) { animId = null; return; }

    if (dragging) {
      const idleMs = performance.now() - lastMoveTime;
      if (idleMs > 30) { velX *= 0.7; velY *= 0.7; }
    }

    // Velocity-driven skew/stretch ONLY when not morphed against a wall —
    // during a morph the scrub-driven scale owns the look, and stacking the
    // velocity stretch on top reads as noisy double-deformation.
    let targetSkewX = 0, targetStretchX = 0, targetStretchY = 0;
    if (dragging && morphT === 0) {
      const vx = clamp(velX, -VEL_CLAMP, VEL_CLAMP);
      const vy = clamp(velY, -VEL_CLAMP, VEL_CLAMP);
      targetSkewX    = vx * K_SKEW;
      targetStretchX = Math.abs(vx) * K_STRETCH - Math.abs(vy) * (K_STRETCH * 0.5);
      targetStretchY = Math.abs(vy) * K_STRETCH - Math.abs(vx) * (K_STRETCH * 0.5);
    }

    defSkewVX    += (targetSkewX    - defSkewX)    * STIFFNESS;
    defStretchVX += (targetStretchX - defStretchX) * STIFFNESS;
    defStretchVY += (targetStretchY - defStretchY) * STIFFNESS;
    defSkewVX    *= DAMPING;
    defStretchVX *= DAMPING;
    defStretchVY *= DAMPING;
    defSkewX    += defSkewVX;
    defStretchX += defStretchVX;
    defStretchY += defStretchVY;

    // morphT is mouse-bound during drag and LATCHED on release — never touched
    // by tick. To un-morph, the user grabs the box again and drags away (the
    // mouse-bound update in onMouseMove will scrub morphT back down) or
    // double-clicks the handle (resetPosition clears it).

    applyTransform();
    positionHandle();

    // Only the velocity skew/stretch springs need extra frames after release —
    // morphT is latched, so it doesn't drive the loop.
    const stillMoving = dragging
      || Math.abs(defSkewX)    > 0.05  || Math.abs(defSkewVX)    > 0.05
      || Math.abs(defStretchX) > 0.001 || Math.abs(defStretchVX) > 0.001
      || Math.abs(defStretchY) > 0.001 || Math.abs(defStretchVY) > 0.001;

    if (stillMoving) {
      animId = requestAnimationFrame(tick);
    } else {
      defSkewX = defStretchX = defStretchY = 0;
      applyTransform();
      animId = null;
    }
  }

  // ── Mount / unmount ───────────────────────────────────────
  function rebind() {
    // Don't re-capture rest geometry while the user is actively dragging —
    // Gemini's Angular layout shifts a lot, and a fresh capture mid-drag
    // would jerk the chatbox to a wrong position. Resume after release.
    if (dragging) return;
    const fresh = findChatbox();
    if (fresh && fresh !== chatbox) {
      if (chatbox) {
        setChildOpacity(1);                  // clear children before dropping the ref
        chatbox.style.transform       = "";
        chatbox.style.transformOrigin = "";
        chatbox.style.borderRadius    = "";
        chatbox.style.overflow        = "";
        chatbox.style.willChange      = "";
        chatbox.removeEventListener("mousedown", onChatboxMouseDown);
      }
      lastChildOpacity = -1; // force re-apply against the new chatbox's children
      chatbox = fresh;
      chatbox.addEventListener("mousedown", onChatboxMouseDown);
      captureRest();
      applyTransform();
    }
    positionHandle();
  }

  function ensureChatbox() {
    if (chatbox && document.body.contains(chatbox)) return chatbox;
    chatbox = findChatbox();
    if (chatbox) {
      captureRest();
      console.log(
        "[Gemini Wallpaper] Chatbox bound:",
        chatbox.tagName.toLowerCase(),
        `rest=${Math.round(restWidth)}x${Math.round(restHeight)} center=(${Math.round(restCenterX)},${Math.round(restCenterY)})`
      );
    } else {
      console.warn("[Gemini Wallpaper] Chatbox not found. Tried selectors:", SELECTORS);
    }
    return chatbox;
  }

  function applyScaleOnly() {
    if (!ensureChatbox()) return;
    applyTransform();
  }

  function enable() {
    if (dragEnabled) return;
    dragEnabled = true;
    if (!ensureChatbox()) {
      setTimeout(() => { if (dragEnabled && !chatbox) { dragEnabled = false; enable(); } }, 1000);
      return;
    }
    createHandle();
    chatbox.addEventListener("mousedown", onChatboxMouseDown);
    positionHandle();
    applyTransform();
    observer = new MutationObserver(rebind);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", positionHandle, true);
  }

  function disable() {
    if (!dragEnabled) return;
    dragEnabled = false;
    dragging = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup",   endDrag);
    window.removeEventListener("resize",    onResize);
    window.removeEventListener("scroll",    positionHandle, true);
    observer?.disconnect();
    observer = null;
    if (chatbox) chatbox.removeEventListener("mousedown", onChatboxMouseDown);
    removeHandle();
    translateX = translateY = 0;
    defSkewX = defStretchX = defStretchY = 0;
    defSkewVX = defStretchVX = defStretchVY = 0;
    morphT = 0;
    morphSide = "none";
    applyTransform(); // keeps userScale if non-default, else clears; restores child opacity
  }

  function onResize() {
    captureRest();
    if (dragging) updateWallPressureAndClamp(translateX, translateY);
    positionHandle();
  }

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get(
    { chatboxDraggable: false, chatboxScale: 100 },
    (s) => {
      userScale = (s.chatboxScale || 100) / 100;
      if (s.chatboxDraggable) {
        enable();
      } else if (userScale !== 1) {
        applyScaleOnly();
      }
    }
  );

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("chatboxDraggable" in changes) {
      changes.chatboxDraggable.newValue ? enable() : disable();
    }
    if ("chatboxScale" in changes) {
      userScale = (changes.chatboxScale.newValue || 100) / 100;
      if (dragEnabled) applyTransform();
      else             applyScaleOnly();
    }
  });

  console.log("[Gemini Wallpaper] Chatbox drag module loaded.");
})();
