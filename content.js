/**
 * Gemini Wallpaper - Content Script
 * 
 * Injected into gemini.google.com to replace the default
 * background with a user-chosen wallpaper image.
 * 
 * Strategy:
 *  1. Insert a fixed background div + overlay behind Gemini's UI
 *  2. Make Gemini's own background layers transparent
 *  3. Listen for settings changes from the popup via chrome.storage
 *  4. Use MutationObserver to re-apply transparency when Gemini
 *     re-renders its SPA (class names can change on navigation)
 */

(function () {
  "use strict";

  // ── Default settings ──────────────────────────────────────
  const DEFAULTS = {
    enabled: true,
    imageData: "",          // base64 data-url of the wallpaper
    overlayOpacity: 0.5,    // 0 = no dim, 1 = fully black
    blur: 0,                // px of backdrop blur on the overlay
    brightness: 100,        // % brightness of the wallpaper image
    chatFont: "",           // Latin Google Font name, empty = Gemini default
    cjkFont: "",            // Traditional Chinese Google Font name, empty = Gemini default
    glassColor: "#000000",  // hex tint color for glass surfaces
    glassOpacity: 45,       // 0-100
  };

  let settings = { ...DEFAULTS };

  // ── Create wallpaper DOM elements ─────────────────────────
  const bgEl = document.createElement("div");
  bgEl.id = "gemini-wallpaper-bg";

  const overlayEl = document.createElement("div");
  overlayEl.id = "gemini-wallpaper-overlay";

  function injectElements() {
    if (!document.getElementById("gemini-wallpaper-bg")) {
      document.body.prepend(overlayEl);
      document.body.prepend(bgEl);
    }
  }

  // ── Apply current settings to DOM ─────────────────────────
  function applySettings() {
    if (!settings.enabled || !settings.imageData) {
      bgEl.style.display = "none";
      overlayEl.style.display = "none";
      restoreOriginalBg();
      return;
    }

    bgEl.style.display = "block";
    overlayEl.style.display = "block";

    // Wallpaper image
    bgEl.style.backgroundImage = `url(${settings.imageData})`;
    bgEl.style.filter = `brightness(${settings.brightness}%)`;

    // Overlay dimming
    overlayEl.style.background = `rgba(0, 0, 0, ${settings.overlayOpacity})`;
    if (settings.blur > 0) {
      overlayEl.style.backdropFilter = `blur(${settings.blur}px)`;
      overlayEl.style.webkitBackdropFilter = `blur(${settings.blur}px)`;
    } else {
      overlayEl.style.backdropFilter = "none";
      overlayEl.style.webkitBackdropFilter = "none";
    }

    // Make Gemini's own backgrounds transparent
    makeGeminiTransparent();
  }

  // ── Force Gemini's background elements to be transparent ──
  //    Gemini uses several nested containers with solid backgrounds.
  //    We need to clear them so our wallpaper shows through.
  //    These selectors are broad to survive class-name changes.

  const TRANSPARENT_TARGETS = [
    // Only the page background layers — NOT UI chrome (sidebar, input bar)
    "body",
    "bard-app",
    "gemini-app",          // possible new root tag after 2026 redesign
    "main",
    "[role='main']",
    ".main-content",
    ".chat-container",
    ".conversation-container",
  ];

  // Extra: target elements with inline dark backgrounds
  function makeGeminiTransparent() {
    TRANSPARENT_TARGETS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        // Only override if the computed bg is a solid dark color
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
          el.style.setProperty("background-color", "transparent", "important");
          el.style.setProperty("background-image", "none", "important");
          el.dataset.geminiWallpaperOverride = "true";
        }
      });
    });
  }

  function restoreOriginalBg() {
    document.querySelectorAll("[data-gemini-wallpaper-override]").forEach((el) => {
      el.style.removeProperty("background-color");
      el.style.removeProperty("background-image");
      delete el.dataset.geminiWallpaperOverride;
    });
  }

  // ── MutationObserver: re-apply on SPA navigation ──────────
  //    Gemini is a single-page app that re-renders containers.
  //    We watch for DOM changes and re-apply transparency.
  //    Debounced so rapid SPA mutations don't queue thousands of
  //    querySelectorAll calls and stall the renderer.
  let _observerTimer = null;
  const observer = new MutationObserver(() => {
    if (!settings.enabled || !settings.imageData) return;
    clearTimeout(_observerTimer);
    _observerTimer = setTimeout(makeGeminiTransparent, 150);
  });

  function startObserver() {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // ── Load settings from chrome.storage ─────────────────────
  function loadSettings() {
    chrome.storage.local.get(DEFAULTS, (stored) => {
      settings = { ...DEFAULTS, ...stored };
      applySettings();
      applyFont();
      applyGlass();
    });
  }



  // ── Font application ──────────────────────────────────────
  const FONT_TARGETS = [
    "model-response", "user-query", "message-content",
    ".model-response-text", "response-container",
    ".gds-display-m",   // zero-state welcome greeting title ("…我們進入正題吧！")
  ].join(", ");

  const GOOGLE_FONTS = {
    // Latin
    "Inter":            "Inter:wght@400;500;600",
    "Merriweather":     "Merriweather:wght@400;700",
    "JetBrains Mono":   "JetBrains+Mono:wght@400;500",
    "Nunito":           "Nunito:wght@400;500;600",
    // Traditional Chinese
    "Noto Serif TC":    "Noto+Serif+TC:wght@400;700",
    "Noto Sans TC":     "Noto+Sans+TC:wght@400;500;700",
    "LXGW WenKai TC":  "LXGW+WenKai+TC",
    "Zen Old Mincho":   "Zen+Old+Mincho:wght@400;700",
    "Zen Maru Gothic":  "Zen+Maru+Gothic:wght@400;500",
  };

  function applyFont() {
    document.getElementById("gwp-font-link")?.remove();
    document.getElementById("gwp-font-style")?.remove();

    const latin = settings.chatFont;
    const cjk   = settings.cjkFont;
    if (!latin && !cjk) return;

    // Build a single Google Fonts URL combining both families
    const families = [latin, cjk]
      .filter(f => f && GOOGLE_FONTS[f])
      .map(f => "family=" + GOOGLE_FONTS[f])
      .join("&");

    if (families) {
      const link = document.createElement("link");
      link.id = "gwp-font-link";
      link.rel = "stylesheet";
      link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
      document.head.appendChild(link);
    }

    // Stack fonts: Latin first, then CJK fallback for Chinese characters
    const stack = [latin, cjk].filter(Boolean).map(f => `'${f}'`).join(", ");
    const fallback = cjk ? "serif" : "sans-serif";

    // Exclude mat-icon (Google Symbols icon font) — overriding it turns icons into raw text
    const notIcon = ":not(mat-icon):not([class*='mat-ligature'])";
    const style = document.createElement("style");
    style.id = "gwp-font-style";
    style.textContent = `
      ${FONT_TARGETS},
      ${FONT_TARGETS.split(", ").map(s => `${s} *${notIcon}`).join(", ")} {
        font-family: ${stack}, ${fallback} !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Glass tint application ────────────────────────────────
  function applyGlass() {
    document.getElementById("gwp-glass-style")?.remove();

    const hex = settings.glassColor || "#000000";
    const opacity = (settings.glassOpacity ?? 45) / 100;

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;

    // Use specific custom-element tag names only. Class names like `.input-area`
    // were too broad — they matched the outer wrapper holding the whole
    // conversation, painting a giant tinted box over half the screen.
    const style = document.createElement("style");
    style.id = "gwp-glass-style";
    style.textContent = `
      bard-sidenav,
      gemini-sidenav,
      input-area-v2,
      input-area-v3,
      input-area-v4,
      .user-query-bubble-with-background {
        background-color: ${rgba} !important;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Listen for live changes from popup ────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in settings) {
        settings[key] = newValue;
      }
    }
    applySettings();
    applyFont();
    applyGlass();
  });

  // ── Init ──────────────────────────────────────────────────
  injectElements();
  loadSettings();
  startObserver();

})();
