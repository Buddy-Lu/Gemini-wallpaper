/**
 * Gemini Wallpaper - Thinking Buddy
 *
 * While Gemini is generating a response, a looping anime "loading" GIF appears
 * just to the LEFT of the user's latest prompt bubble, so the wait feels
 * shorter. It hides as soon as generation ends.
 *
 * GIFs are hotlinked from Tenor (personal use). "Thinking" is detected from
 * Gemini's stop-generating control. A rAF loop keeps the mascot pinned beside
 * the prompt bubble as the view scrolls.
 */
(function () {
  "use strict";

  const GIFS = [
    "https://media1.tenor.com/m/2QgTA5XJoyUAAAAC/yuru-yuri-anime.gif",
    "https://media1.tenor.com/m/-BkyQQx9M7sAAAAC/loading-blush.gif",
    "https://media1.tenor.com/m/TgPXdDAfIeIAAAAd/gawr-gura-gura.gif",
    "https://media1.tenor.com/m/V_0ti1a3_GoAAAAC/loading-azurlane.gif",
  ];

  let enabled = true;
  let el = null, imgEl = null;
  let showing = false;
  let showTimer = null, hideTimer = null, posRaf = null, gifTimer = null, gifIdx = 0;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // ── Style ─────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-tb-style")) return;
    const s = document.createElement("style");
    s.id = "gwp-tb-style";
    s.textContent = `
      #gwp-thinking-buddy {
        position: fixed; z-index: 9995; pointer-events: none; display: none;
        animation: gwp-tb-pop .3s cubic-bezier(.18,1.4,.4,1);
      }
      #gwp-thinking-buddy img {
        display: block; width: 120px; height: auto; max-height: 150px;
        border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,.5);
        animation: gwp-tb-float 2.6s infinite ease-in-out;
      }
      @keyframes gwp-tb-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      @keyframes gwp-tb-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function build() {
    if (el && document.body.contains(el)) return;
    injectStyle();
    el = document.createElement("div");
    el.id = "gwp-thinking-buddy";
    imgEl = document.createElement("img");
    imgEl.alt = "";
    imgEl.draggable = false;
    el.appendChild(imgEl);
    document.body.appendChild(el);
  }

  // ── Positioning: left of the latest user prompt bubble ────
  function lastPromptRect() {
    const bubbles = document.querySelectorAll(
      ".user-query-bubble-with-background, user-query, user-query-content"
    );
    let target = null;
    bubbles.forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) target = b;   // last visible one
    });
    if (!target) return null;
    const r = target.getBoundingClientRect();
    // only usable if it's actually within the viewport
    if (r.bottom < 8 || r.top > window.innerHeight - 8) return null;
    return r;
  }

  function positionBuddy() {
    if (!el) return;
    const bw = el.offsetWidth || 120, bh = el.offsetHeight || 120;
    const r = lastPromptRect();
    let left, top;
    if (r) {
      left = r.left - bw - 14;
      top = r.top + r.height / 2 - bh / 2;
    } else {
      // fallback: bottom-left, above the input bar
      left = 16;
      top = window.innerHeight - bh - 140;
    }
    el.style.left = clamp(left, 8, window.innerWidth - bw - 8) + "px";
    el.style.top = clamp(top, 8, window.innerHeight - bh - 8) + "px";
  }

  function posLoop() {
    if (!showing) { posRaf = null; return; }
    positionBuddy();
    posRaf = requestAnimationFrame(posLoop);
  }

  // ── Thinking detection ────────────────────────────────────
  function isVisible(n) {
    if (!n) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && n.offsetParent !== null;
  }
  function isThinking() {
    const stopBtn = document.querySelector(
      'button[aria-label*="stop" i], button[aria-label*="停止"], ' +
      '[data-test-id*="stop" i], [data-testid*="stop" i]'
    );
    if (stopBtn && isVisible(stopBtn)) return true;
    const stopIcon = document.querySelector('mat-icon[fonticon="stop"], mat-icon[data-mat-icon-name="stop"]');
    if (stopIcon && isVisible(stopIcon)) return true;
    return false;
  }

  // ── Show / hide ───────────────────────────────────────────
  function show() {
    if (showing || !enabled) return;
    showing = true;
    build();
    gifIdx = Math.floor(Math.random() * GIFS.length);
    imgEl.src = GIFS[gifIdx];
    el.style.display = "block";
    el.style.animation = "none";
    void el.offsetWidth;             // restart pop-in
    el.style.animation = "";
    positionBuddy();
    if (posRaf == null) posRaf = requestAnimationFrame(posLoop);
    // Cycle to the next GIF every 2 seconds while thinking.
    clearInterval(gifTimer);
    gifTimer = setInterval(() => {
      gifIdx = (gifIdx + 1) % GIFS.length;
      imgEl.src = GIFS[gifIdx];
    }, 2000);
  }
  function hide() {
    if (!showing) return;
    showing = false;
    clearInterval(gifTimer);
    if (posRaf != null) { cancelAnimationFrame(posRaf); posRaf = null; }
    if (el) el.style.display = "none";
  }

  // ── Poll loop ─────────────────────────────────────────────
  function poll() {
    if (!enabled) return;
    if (isThinking()) {
      clearTimeout(hideTimer);
      if (!showing && showTimer == null) {
        showTimer = setTimeout(() => { showTimer = null; show(); }, 220);
      }
    } else {
      if (showTimer != null) { clearTimeout(showTimer); showTimer = null; }
      if (showing && hideTimer == null) {
        hideTimer = setTimeout(() => { hideTimer = null; hide(); }, 300);
      }
    }
  }

  let pollInterval = null;
  let moTimer = null;
  const mo = new MutationObserver(() => {
    if (!enabled) return;
    clearTimeout(moTimer);
    moTimer = setTimeout(poll, 120);
  });

  function start() {
    if (pollInterval == null) pollInterval = setInterval(poll, 400);
    mo.observe(document.body, { childList: true, subtree: true });
    poll();
  }
  function stopWatch() {
    if (pollInterval != null) { clearInterval(pollInterval); pollInterval = null; }
    mo.disconnect();
    hide();
  }

  function applyEnabled(v) {
    enabled = !!v;
    if (enabled) start();
    else stopWatch();
  }

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get({ thinkingBuddy: true }, (s) => applyEnabled(s.thinkingBuddy));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("thinkingBuddy" in changes) applyEnabled(changes.thinkingBuddy.newValue);
  });

  console.log("[Gemini Wallpaper] Thinking buddy loaded.");
})();
