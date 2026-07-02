/**
 * Gemini Wallpaper - Context guard
 *
 * When an unpacked extension is reloaded, the content scripts already running
 * on the open page become "stale": their chrome.* context is gone, so any
 * chrome.storage call throws "Uncaught Error: Extension context invalidated."
 * until the tab is refreshed.
 *
 * All of this extension's content scripts share ONE isolated world per frame,
 * so patching chrome.storage.local here (loaded first) protects every module:
 * once the context is invalidated, storage calls quietly no-op instead of
 * throwing. A page refresh then loads a fresh, fully-working set of scripts.
 */
(function () {
  "use strict";
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };
  const local = chrome.storage && chrome.storage.local;
  if (!local || local.__gwpGuarded) return;
  local.__gwpGuarded = true;
  ["get", "set", "remove", "clear"].forEach((m) => {
    const orig = typeof local[m] === "function" ? local[m].bind(local) : null;
    if (!orig) return;
    local[m] = function (...args) {
      if (!alive()) return;                 // stale script — swallow silently
      try { return orig(...args); } catch (_) { /* invalidated mid-call */ }
    };
  });
  // Expose for modules that want to gate their own timers/logging.
  window.__gwpAlive = alive;
})();
