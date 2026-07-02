/**
 * Gemini Wallpaper - Hide Chat History
 *
 * Long sessions get hard to scan. This adds a small eye toggle to every
 * conversation turn (next to Gemini's copy/edit actions on the user query).
 * Clicking it collapses that whole exchange (question + answer) down to a slim
 * bar showing a snippet; clicking the bar brings it back.
 *
 * Hidden turns are remembered per conversation (keyed by URL) using a text
 * fingerprint of the user's message, so they stay hidden across Angular
 * re-renders and page reloads.
 *
 * Strategy mirrors the other modules: one injected <style>, a throttled
 * MutationObserver that (re)attaches toggles + re-applies the hidden state,
 * and chrome.storage.local for persistence.
 */
(function () {
  "use strict";

  const KEY = "gwpHiddenTurns";
  const TURN = ".conversation-container";

  let enabled = true;          // on by default; toggle via `hideChatEnabled`
  let store = {};              // { url: [fingerprint, ...] }
  let lastUrl = location.href;

  // ── Fingerprint a turn by its user-query text ─────────────
  function queryText(container) {
    const q = container.querySelector("user-query, .user-query-bubble-with-background, user-query-content");
    return (q ? q.textContent : "").replace(/\s+/g, " ").trim();
  }
  function fp(text) {
    const t = text.slice(0, 160);
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0;
    return t.length + ":" + (h >>> 0);
  }
  function snippet(text) {
    const t = text || "(empty message)";
    return t.length > 80 ? t.slice(0, 80) + "…" : t;
  }

  function curSet() {
    const arr = store[lastUrl];
    return new Set(Array.isArray(arr) ? arr : []);
  }
  function persist(set) {
    store[lastUrl] = [...set];
    chrome.storage.local.set({ [KEY]: store });
  }

  // ── Style ─────────────────────────────────────────────────
  const EYE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  function injectStyle() {
    if (document.getElementById("gwp-hide-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-hide-style";
    st.textContent = `
      /* Subtle icon button that blends with the faint "Fork" label. */
      .gwp-hide-btn {
        width: 22px; height: 22px; border: none; border-radius: 6px;
        background: transparent; color: rgba(220,225,245,.62); cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        opacity: .78; transition: opacity .15s, background .15s;
        flex: none; padding: 0; vertical-align: middle; margin-left: 4px;
      }
      .gwp-hide-btn:hover { opacity: 1; background: rgba(74,124,255,.28); color: #eef1ff; }

      /* Collapse everything in a hidden turn except our slim bar. */
      ${TURN}.gwp-hidden-turn > *:not(.gwp-hide-bar) { display: none !important; }
      .gwp-hide-bar { display: none; }
      ${TURN}.gwp-hidden-turn > .gwp-hide-bar {
        display: flex; align-items: center; gap: 10px; cursor: pointer;
        margin: 6px 0; padding: 8px 14px; border-radius: 10px;
        background: rgba(20,22,34,.5); border: 1px solid rgba(255,255,255,.12);
        color: #c7cbe0; font: 500 13px/1.3 'Segoe UI', system-ui, sans-serif;
        backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
        transition: background .15s;
      }
      ${TURN}.gwp-hidden-turn > .gwp-hide-bar:hover { background: rgba(74,124,255,.28); }
      .gwp-hide-bar .gwp-hide-ico { flex: none; opacity: .85; display: inline-flex; }
      .gwp-hide-bar .gwp-hide-txt { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .gwp-hide-bar .gwp-hide-show { flex: none; font-size: 11px; letter-spacing: .5px; text-transform: uppercase; opacity: .7; }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Per-turn wiring ───────────────────────────────────────
  function ensureBar(container) {
    let bar = container.querySelector(":scope > .gwp-hide-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "gwp-hide-bar";
      bar.innerHTML =
        `<span class="gwp-hide-ico">${EYE_OFF}</span>` +
        `<span class="gwp-hide-txt"></span>` +
        `<span class="gwp-hide-show">show</span>`;
      bar.addEventListener("click", (e) => { e.stopPropagation(); setHidden(container, false); });
      container.insertBefore(bar, container.firstChild);
    }
    bar.querySelector(".gwp-hide-txt").textContent = snippet(queryText(container));
    return bar;
  }

  function setHidden(container, hidden) {
    const set = curSet();
    const key = fp(queryText(container));
    if (hidden) {
      ensureBar(container);
      container.classList.add("gwp-hidden-turn");
      set.add(key);
    } else {
      container.classList.remove("gwp-hidden-turn");
      set.delete(key);
    }
    persist(set);
  }

  // Find the "⑃ Fork" control to the left of the user bubble so our toggle
  // sits beside it (not with Gemini's own copy/edit actions).
  function findFork(container) {
    let el = container.querySelector('[aria-label*="fork" i], [data-test-id*="fork" i]');
    if (el) return el;
    let best = null, bestLen = Infinity;
    container.querySelectorAll('button, [role="button"], span, div').forEach((c) => {
      const t = c.textContent.replace(/\s+/g, " ").trim();
      if (t.length <= 24 && /fork/i.test(t) && t.length < bestLen) { best = c; bestLen = t.length; }
    });
    return best;
  }

  function addToggle(container) {
    if (container.querySelector(".gwp-hide-btn")) return;

    const btn = document.createElement("button");
    btn.className = "gwp-hide-btn";
    btn.type = "button";
    btn.title = "Hide this exchange";
    btn.innerHTML = EYE_OFF;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setHidden(container, !container.classList.contains("gwp-hidden-turn"));
    });

    const fork = findFork(container);
    if (fork && fork.parentElement) {
      // Place it right beside the Fork label.
      fork.insertAdjacentElement("afterend", btn);
      return;
    }
    // Fallback: pin to the top-left of the query bubble (still away from
    // Gemini's copy/edit cluster on the right).
    const q = container.querySelector("user-query");
    const host = (q && (q.querySelector(".user-query-bubble-with-background") || q)) || container;
    btn.style.position = "absolute";
    btn.style.top = "35px";
    btn.style.left = "-30px";
    btn.style.zIndex = "5";
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(btn);
  }

  function scan() {
    if (!enabled) return;
    if (location.href !== lastUrl) lastUrl = location.href;
    const set = curSet();
    document.querySelectorAll(TURN).forEach((container) => {
      addToggle(container);
      const shouldHide = set.has(fp(queryText(container)));
      if (shouldHide && !container.classList.contains("gwp-hidden-turn")) {
        ensureBar(container);
        container.classList.add("gwp-hidden-turn");
      } else if (!shouldHide && container.classList.contains("gwp-hidden-turn")) {
        container.classList.remove("gwp-hidden-turn");
      }
    });
  }

  // ── Enable / disable ──────────────────────────────────────
  function applyEnabled(v) {
    enabled = v !== false;
    if (enabled) { injectStyle(); scan(); }
    else {
      document.querySelectorAll(TURN + ".gwp-hidden-turn").forEach((c) => c.classList.remove("gwp-hidden-turn"));
      document.querySelectorAll(".gwp-hide-btn").forEach((b) => b.remove());
    }
  }

  // ── Boot ──────────────────────────────────────────────────
  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 300);
  });

  chrome.storage.local.get({ [KEY]: {}, hideChatEnabled: true }, (s) => {
    store = s[KEY] && typeof s[KEY] === "object" ? s[KEY] : {};
    applyEnabled(s.hideChatEnabled);
    observer.observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (KEY in changes) { store = changes[KEY].newValue || {}; scan(); }
    if ("hideChatEnabled" in changes) applyEnabled(changes.hideChatEnabled.newValue);
  });
})();
