/**
 * Gemini Wallpaper - Code Block Styler
 *
 * Gives every <code-block> in Gemini its own look, controlled from a small
 * settings panel that pops up next to the block (independent of the main
 * popup — this has its own storage key `codeStyle`).
 *
 * Options: border style (none / border / shiny / synthwave), monospace font,
 * font size, line numbers, tint color + opacity, backdrop blur, corner radius.
 *
 * Strategy (mirrors the other modules):
 *  - One global injected <style id="gwp-code-style"> holds the look; it is
 *    rebuilt whenever settings change, so all blocks update at once.
 *  - Gemini paints a solid dark bg on several inner layers (header + pre/code),
 *    so we clear those and paint one tinted+blurred surface on <code-block>.
 *  - A ⚙ gear button is added to each block's header. It opens a single shared
 *    panel positioned beside whichever gear was clicked.
 *  - Line numbers are a per-block gutter (built in JS from code text so it
 *    survives syntax highlighting), refreshed on each scan.
 *  - A MutationObserver (debounced) re-attaches gears / gutters after Angular
 *    re-renders. Settings persist in chrome.storage.local and sync live via
 *    chrome.storage.onChanged.
 */
(function () {
  "use strict";

  const DEFAULTS = {
    tintColor: "#0f1020",
    tintOpacity: 55,     // 0–100
    blur: 12,            // px
    border: "solid",     // none | solid | shiny | synthwave
    radius: 12,          // px
    font: "",            // "" = Gemini default, else a Google mono font
    fontSize: 14,        // px
    lineNumbers: false,
  };
  let s = { ...DEFAULTS };

  // Google Fonts slugs for the monospace options.
  const FONT_SLUGS = {
    "JetBrains Mono": "JetBrains+Mono:wght@400;500;700",
    "Fira Code": "Fira+Code:wght@400;500;700",
    "Source Code Pro": "Source+Code+Pro:wght@400;500;700",
    "IBM Plex Mono": "IBM+Plex+Mono:wght@400;500;700",
  };

  function hexToRgba(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // ── Card look, applied inline to the <pre> (so it wraps only the code
  // text — not Gemini's header/toolbar — and beats class-based rules). ──
  const BORDERS = {
    none: { border: "none", shadow: "none" },
    solid: { border: "1px solid rgba(255,255,255,0.22)", shadow: "none" },
    // Glossy top highlight + soft glow.
    shiny: {
      border: "1px solid rgba(255,255,255,0.35)",
      shadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 8px 30px rgba(120,150,255,0.28), 0 0 0 1px rgba(180,200,255,0.15)",
    },
    // Neon pink border with pink+cyan glow.
    synthwave: {
      border: "1px solid #ff2e97",
      shadow: "0 0 10px rgba(255,46,151,0.6), 0 0 22px rgba(0,229,255,0.35), inset 0 0 16px rgba(138,43,226,0.28)",
    },
  };

  function applyCard(pre) {
    const rgba = hexToRgba(s.tintColor || "#0f1020", (s.tintOpacity ?? 55) / 100);
    const b = BORDERS[s.border] || BORDERS.solid;
    pre.style.setProperty("background-color", rgba, "important");
    pre.style.setProperty("backdrop-filter", `blur(${s.blur}px)`, "important");
    pre.style.setProperty("-webkit-backdrop-filter", `blur(${s.blur}px)`, "important");
    pre.style.setProperty("border-radius", s.radius + "px", "important");
    pre.style.setProperty("border", b.border, "important");
    pre.style.setProperty("box-shadow", b.shadow, "important");
    pre.style.setProperty("transition",
      "background-color .3s ease, box-shadow .3s ease, border-color .3s ease", "important");
  }

  function applyStyle() {
    // (Re)load the chosen Google font.
    document.getElementById("gwp-code-font-link")?.remove();
    if (s.font && FONT_SLUGS[s.font]) {
      const l = document.createElement("link");
      l.id = "gwp-code-font-link";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=" + FONT_SLUGS[s.font] + "&display=swap";
      document.head.appendChild(l);
    }

    let style = document.getElementById("gwp-code-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "gwp-code-style";
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = `
      /* Host is just a positioning context now — the visible card lives on the
         <pre> (set inline in applyCard), so the border wraps only the code text
         and never the header/toolbar. No overflow:hidden here, so wide code
         can't clip the download/copy buttons. */
      code-block {
        display: block !important;
        position: relative !important;
        background: transparent !important;
      }
      /* Clear Gemini's own solid backgrounds on every layer EXCEPT the <pre>
         (whose inline tint wins over this). The header floats on the wallpaper. */
      code-block > *,
      code-block .code-block-decoration,
      code-block .formatted-code-block-internal-container,
      code-block code {
        background: transparent !important;
      }
      /* Line-number gutter. Font/size/line-height are copied from the code
         element at runtime (inline) so the numbers stay aligned regardless of
         Gemini's own metrics — don't set them here. */
      .gwp-code-gutter {
        position: absolute;
        left: 0;
        text-align: right;
        white-space: pre;
        user-select: none;
        pointer-events: none;
        box-sizing: border-box;
        color: rgba(255,255,255,0.34);
        border-right: 1px solid rgba(255,255,255,0.12);
      }
      /* Gear button */
      .gwp-code-gear {
        border: none;
        background: rgba(255,255,255,0.08);
        color: #cfd6ff;
        width: 26px; height: 26px;
        border-radius: 7px;
        font-size: 15px;
        line-height: 1;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-left: 4px;
        transition: background .15s;
        flex: none;
      }
      .gwp-code-gear:hover { background: rgba(120,150,255,0.35); }
    `;
  }

  // ── Per-block: inline font/size + line-number gutter ──────────
  // Font & size are set inline with `important` so they beat Gemini's own
  // class-based rules (a plain `code-block code` selector would lose). The
  // gutter copies the code element's *computed* metrics so numbers stay
  // aligned no matter what line-height/size actually wins the cascade.
  // Gemini pins the code header (div.code-block-decoration.header-formatted,
  // position: sticky; top: -16px) so it slides over the code while scrolling.
  // Pin it to the top of the block instead. Inline `important` beats Gemini's
  // multi-class rule that a plain selector loses to. Falls back to a generic
  // sticky scan (excluding the code body) if the class ever gets renamed.
  function pinSticky(cb, pre) {
    let found = cb.querySelectorAll(".code-block-decoration, .header-formatted");
    if (!found.length && pre) {
      found = [...cb.querySelectorAll("*")].filter(
        (el) => el !== pre && !pre.contains(el) && getComputedStyle(el).position === "sticky"
      );
    }
    found.forEach((el) => {
      if (pre && pre.contains(el)) return;
      el.style.setProperty("position", "static", "important");
    });
  }

  function applyBlock(cb) {
    const pre = cb.querySelector("pre");
    if (!pre) return;
    const codeEl = pre.querySelector("code") || pre;

    applyCard(pre);
    pinSticky(cb, pre);

    const fam = s.font ? `'${s.font}', ui-monospace, monospace` : "";
    [pre, codeEl].forEach((el) => {
      if (fam) el.style.setProperty("font-family", fam, "important");
      else el.style.removeProperty("font-family");
      el.style.setProperty("font-size", s.fontSize + "px", "important");
    });

    // Comfortable padding inside the card (Gemini's own is too tight against
    // the new border). Left grows to fit the gutter when line numbers are on.
    pre.style.setProperty("padding-right", "18px", "important");

    let gutter = pre.querySelector(":scope > .gwp-code-gutter");
    if (!s.lineNumbers) {
      if (gutter) gutter.remove();
      pre.style.setProperty("padding-left", "18px", "important");
      pre.style.removeProperty("position");
      return;
    }

    const count = codeEl.textContent.replace(/\n+$/, "").split("\n").length;
    const nums = Array.from({ length: count }, (_, i) => i + 1).join("\n");
    if (!gutter) {
      gutter = document.createElement("span");
      gutter.className = "gwp-code-gutter";
      pre.appendChild(gutter);
    }
    if (gutter.textContent !== nums) gutter.textContent = nums;

    pre.style.position = "relative";
    const digits = String(count).length;
    pre.style.setProperty("padding-left", (digits + 3.5) + "ch", "important");

    // Match the code's real rendered metrics (measured after the font/size
    // and padding above are applied).
    const cs = getComputedStyle(codeEl);
    gutter.style.fontFamily = cs.fontFamily;
    gutter.style.fontSize = cs.fontSize;
    gutter.style.lineHeight = cs.lineHeight;
    gutter.style.paddingTop = cs.paddingTop;
    gutter.style.top = codeEl.offsetTop + "px";
    gutter.style.width = (digits + 1.2) + "ch";
    gutter.style.paddingRight = "0.6ch";
  }

  // ── Settings panel (single shared instance) ───────────────────
  let panel = null;

  function makeBtnRow(labelText, values, current, onPick) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-bottom:10px;";
    const lab = document.createElement("div");
    lab.textContent = labelText;
    lab.style.cssText = "font-size:11px;color:#9aa0c0;margin-bottom:5px;";
    wrap.appendChild(lab);
    const row = document.createElement("div");
    row.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
    values.forEach(([val, text]) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.dataset.val = val;
      b.style.cssText =
        "padding:4px 9px;font-size:11px;font-weight:500;border-radius:5px;cursor:pointer;" +
        "border:1px solid transparent;background:#2a2a4a;color:#aaa;transition:all .15s;";
      const sel = () => {
        row.querySelectorAll("button").forEach((x) => {
          x.style.borderColor = "transparent";
          x.style.color = "#aaa";
          x.style.background = "#2a2a4a";
        });
        b.style.borderColor = "#4a7cff";
        b.style.color = "#4a7cff";
        b.style.background = "rgba(74,124,255,0.14)";
      };
      if (val === current) sel();
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        sel();
        onPick(val);
      });
      row.appendChild(b);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function makeSlider(labelText, min, max, step, current, unit, onInput) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-bottom:10px;";
    const lab = document.createElement("div");
    lab.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#9aa0c0;margin-bottom:5px;";
    const name = document.createElement("span");
    name.textContent = labelText;
    const valEl = document.createElement("span");
    valEl.style.cssText = "color:#4a7cff;font-weight:600;";
    valEl.textContent = current + unit;
    lab.appendChild(name);
    lab.appendChild(valEl);
    const range = document.createElement("input");
    range.type = "range";
    range.min = min; range.max = max; range.step = step; range.value = current;
    range.style.cssText = "width:100%;accent-color:#4a7cff;cursor:pointer;";
    range.addEventListener("input", (e) => {
      e.stopPropagation();
      valEl.textContent = range.value + unit;
      onInput(parseInt(range.value, 10));
    });
    wrap.appendChild(lab);
    wrap.appendChild(range);
    return wrap;
  }

  function save() {
    chrome.storage.local.set({ codeStyle: s });
    applyStyle();
    document.querySelectorAll("code-block").forEach(applyBlock);
  }

  function buildPanel() {
    const p = document.createElement("div");
    p.className = "gwp-code-panel";
    p.style.cssText =
      "position:fixed;z-index:2147483000;width:250px;max-height:80vh;overflow-y:auto;" +
      "background:#1a1a2e;border:1px solid #3a3a5a;border-radius:10px;padding:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:'Segoe UI',system-ui,sans-serif;" +
      "color:#e0e0e0;display:none;";
    p.addEventListener("click", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.textContent = "⚙ Code Block Style";
    title.style.cssText = "font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;";
    p.appendChild(title);

    p.appendChild(makeBtnRow("Border", [
      ["none", "None"], ["solid", "Border"], ["shiny", "Shiny"], ["synthwave", "Synthwave"],
    ], s.border, (v) => { s.border = v; save(); }));

    p.appendChild(makeBtnRow("Font", [
      ["", "Default"], ["JetBrains Mono", "JetBrains"], ["Fira Code", "Fira Code"],
      ["Source Code Pro", "Source"], ["IBM Plex Mono", "IBM Plex"],
    ], s.font, (v) => { s.font = v; save(); }));

    p.appendChild(makeSlider("Font Size", 10, 22, 1, s.fontSize, "px", (v) => { s.fontSize = v; save(); }));

    // Line numbers toggle
    const lnWrap = document.createElement("div");
    lnWrap.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";
    const lnLab = document.createElement("span");
    lnLab.textContent = "Line Numbers";
    lnLab.style.cssText = "font-size:11px;color:#9aa0c0;";
    const lnBtn = document.createElement("button");
    const paintLn = () => {
      lnBtn.textContent = s.lineNumbers ? "On" : "Off";
      lnBtn.style.background = s.lineNumbers ? "rgba(74,124,255,0.14)" : "#2a2a4a";
      lnBtn.style.color = s.lineNumbers ? "#4a7cff" : "#aaa";
      lnBtn.style.borderColor = s.lineNumbers ? "#4a7cff" : "transparent";
    };
    lnBtn.style.cssText = "padding:4px 14px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;border:1px solid transparent;";
    paintLn();
    lnBtn.addEventListener("click", (e) => { e.stopPropagation(); s.lineNumbers = !s.lineNumbers; paintLn(); save(); });
    lnWrap.appendChild(lnLab);
    lnWrap.appendChild(lnBtn);
    p.appendChild(lnWrap);

    // Tint color + opacity
    const tintWrap = document.createElement("div");
    tintWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
    const tintLab = document.createElement("span");
    tintLab.textContent = "Tint";
    tintLab.style.cssText = "font-size:11px;color:#9aa0c0;flex:1;";
    const colorEl = document.createElement("input");
    colorEl.type = "color";
    colorEl.value = s.tintColor;
    colorEl.style.cssText = "width:26px;height:20px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;";
    colorEl.addEventListener("input", (e) => { e.stopPropagation(); s.tintColor = colorEl.value; save(); });
    tintWrap.appendChild(tintLab);
    tintWrap.appendChild(colorEl);
    p.appendChild(tintWrap);

    p.appendChild(makeSlider("Tint Opacity", 0, 100, 1, s.tintOpacity, "%", (v) => { s.tintOpacity = v; save(); }));
    p.appendChild(makeSlider("Blur", 0, 24, 1, s.blur, "px", (v) => { s.blur = v; save(); }));
    p.appendChild(makeSlider("Corner Radius", 0, 28, 1, s.radius, "px", (v) => { s.radius = v; save(); }));

    document.body.appendChild(p);
    return p;
  }

  function openPanel(gearBtn) {
    // Rebuild each open so controls reflect current settings.
    if (panel) panel.remove();
    panel = buildPanel();
    panel.style.display = "block";

    const r = gearBtn.getBoundingClientRect();
    const w = 250, margin = 8;
    let left = r.right + margin;
    if (left + w > window.innerWidth) left = r.left - w - margin;
    if (left < margin) left = margin;
    let top = r.bottom + margin;
    // clamp vertically after it has a height
    const h = Math.min(panel.offsetHeight, window.innerHeight * 0.8);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }

  function closePanel() {
    if (panel) { panel.style.display = "none"; }
  }

  document.addEventListener("mousedown", (e) => {
    if (panel && panel.style.display === "block" &&
        !panel.contains(e.target) && !e.target.closest(".gwp-code-gear")) {
      closePanel();
    }
  });

  // ── Attach gear to each code block ────────────────────────────
  // Class names are obfuscated, so we don't guess a header selector. We find
  // Gemini's own button row (the copy/download buttons) and drop the gear in
  // beside them; that keeps it in the header regardless of markup changes.
  function addGear(cb) {
    if (cb.querySelector(":scope .gwp-code-gear")) return;

    const btn = document.createElement("button");
    btn.className = "gwp-code-gear";
    btn.type = "button";
    btn.textContent = "⚙";
    btn.title = "Code block style";
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (panel && panel.style.display === "block") closePanel();
      else openPanel(btn);
    });

    // Prefer sitting inside Gemini's button group (next to copy/download).
    const geminiBtn = cb.querySelector("button:not(.gwp-code-gear)");
    if (geminiBtn && geminiBtn.parentElement) {
      geminiBtn.parentElement.insertBefore(btn, geminiBtn);
      return;
    }
    // Fallback: pin to the top-right corner of the block.
    btn.style.position = "absolute";
    btn.style.top = "10px";
    btn.style.right = "12px";
    btn.style.zIndex = "5";
    (cb.firstElementChild || cb).appendChild(btn);
  }

  function scan() {
    document.querySelectorAll("code-block").forEach((cb) => {
      addGear(cb);
      applyBlock(cb);
    });
  }

  // ── Live updates from other tabs / the popup ──────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.codeStyle) return;
    s = { ...DEFAULTS, ...changes.codeStyle.newValue };
    applyStyle();
    document.querySelectorAll("code-block").forEach(applyBlock);
  });

  // ── Boot ──────────────────────────────────────────────────────
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 300);
  });

  chrome.storage.local.get({ codeStyle: DEFAULTS }, (stored) => {
    s = { ...DEFAULTS, ...stored.codeStyle };
    applyStyle();
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
    console.log("[Gemini Wallpaper] Code style module loaded.");
  });
})();
