/**
 * Gemini Wallpaper - Code Block Styler
 *
 * Gives every <code-block> in Gemini its own look, controlled from a small
 * settings panel that pops up next to the block (independent of the main
 * popup — this has its own storage keys).
 *
 * PER-BLOCK: the ⚙ panel edits the look of the block you opened it from. Each
 * block is identified by a stable hash of its code text, so its custom look
 * re-attaches to the right block even after Angular re-renders. A default look
 * (`codeStyle`) applies to any block you haven't customized; per-block
 * overrides live in `codeStyleBlocks` = { blockId: style }. "Apply to all"
 * makes the current block's look the default and clears every override.
 *
 * Options: border style (none / border / shiny / synthwave), monospace font,
 * font size, line numbers, tint color + opacity, backdrop blur, corner radius.
 *
 * PERFORMANCE:
 *  - Each <pre> caches a signature of its last-applied style; the debounced
 *    rescan skips blocks whose look hasn't changed (no redundant reflow).
 *  - backdrop-filter blur is the expensive part, so an IntersectionObserver
 *    drops it on blocks scrolled off-screen and restores it when they return —
 *    only visible blocks ever hold a blur layer.
 *
 * A MutationObserver (throttled) re-attaches gears / gutters after Angular
 * re-renders. Settings persist in chrome.storage.local and sync live.
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
  let s = { ...DEFAULTS };   // default look (un-customized blocks)
  let blocks = {};           // blockId → per-block style override
  let enabled = true;        // master on/off — when off, blocks look like default Gemini

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

  // ── Block identity (stable across Angular re-renders) ─────────
  function hashCode(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function blockId(cb) {
    const code = cb.querySelector("code") || cb.querySelector("pre");
    const txt = code ? code.textContent : "";
    // Cache by length so a settled block isn't re-hashed every scan; a growing
    // block (still streaming) re-hashes until its text stops changing.
    if (cb.__gwpId && cb.__gwpLen === txt.length) return cb.__gwpId;
    cb.__gwpId = "c" + hashCode(txt.trim());
    cb.__gwpLen = txt.length;
    return cb.__gwpId;
  }
  function styleFor(cb) {
    const o = blocks[blockId(cb)];
    return o ? { ...DEFAULTS, ...o } : s;
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

  // Blur is NOT set here — it's gated by visibility in setBlur().
  function applyCard(pre, st) {
    const rgba = hexToRgba(st.tintColor || "#0f1020", (st.tintOpacity ?? 55) / 100);
    const b = BORDERS[st.border] || BORDERS.solid;
    pre.style.setProperty("background-color", rgba, "important");
    pre.style.setProperty("border-radius", st.radius + "px", "important");
    pre.style.setProperty("border", b.border, "important");
    pre.style.setProperty("box-shadow", b.shadow, "important");
    pre.style.setProperty("transition",
      "background-color .3s ease, box-shadow .3s ease, border-color .3s ease", "important");
  }

  // ── Visibility-gated blur (the one GPU-heavy property) ────────
  function setBlur(pre) {
    const b = (pre.__gwpVisible !== false && pre.__gwpBlur > 0) ? pre.__gwpBlur : 0;
    if (b > 0) {
      pre.style.setProperty("backdrop-filter", `blur(${b}px)`, "important");
      pre.style.setProperty("-webkit-backdrop-filter", `blur(${b}px)`, "important");
    } else {
      pre.style.removeProperty("backdrop-filter");
      pre.style.removeProperty("-webkit-backdrop-filter");
    }
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { e.target.__gwpVisible = e.isIntersecting; setBlur(e.target); });
  }, { rootMargin: "250px 0px" });   // pre-warm slightly before it scrolls in

  // ── Google fonts: load the union of every font in use, once ───
  function loadFonts() {
    const fonts = new Set();
    if (s.font) fonts.add(s.font);
    Object.values(blocks).forEach((b) => { if (b && b.font) fonts.add(b.font); });
    const fams = [...fonts].filter((f) => FONT_SLUGS[f]).map((f) => "family=" + FONT_SLUGS[f]);
    const key = fams.join("&");
    const existing = document.getElementById("gwp-code-font-link");
    if (existing && existing.dataset.key === key) return;   // unchanged — don't refetch
    existing?.remove();
    if (!fams.length) return;
    const l = document.createElement("link");
    l.id = "gwp-code-font-link"; l.rel = "stylesheet"; l.dataset.key = key;
    l.href = "https://fonts.googleapis.com/css2?" + key + "&display=swap";
    document.head.appendChild(l);
  }

  // ── Gear button styling — ALWAYS present so the on/off toggle stays reachable
  //    even when block styling is turned off. ──
  function applyGearStyle() {
    if (document.getElementById("gwp-code-gear-style")) return;
    const st = document.createElement("style");
    st.id = "gwp-code-gear-style";
    st.textContent = `
      .gwp-code-gear {
        border: none; background: rgba(255,255,255,0.08); color: #cfd6ff;
        width: 26px; height: 26px; border-radius: 7px; font-size: 15px; line-height: 1;
        cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
        margin-left: 4px; transition: background .15s; flex: none;
      }
      .gwp-code-gear:hover { background: rgba(120,150,255,0.35); }
      /* A block with its own custom look gets a dot on its gear. */
      .gwp-code-gear.gwp-custom::after {
        content: ""; position: absolute; margin: -12px 0 0 12px;
        width: 6px; height: 6px; border-radius: 50%; background: #6aa0ff;
      }
    `;
    (document.head || document.documentElement).appendChild(st);
  }

  // ── Block-styling <style> — only present while the feature is ON. Removing it
  //    (toggle off) restores Gemini's native code blocks (solid bg + fonts). ──
  function applyStyle() {
    if (document.getElementById("gwp-code-style")) return;
    const style = document.createElement("style");
    style.id = "gwp-code-style";
    style.textContent = `
      /* Host is just a positioning context — the visible card lives on the
         <pre> (set inline in applyCard), so the border wraps only the code text
         and never the header/toolbar. No overflow:hidden, so wide code can't
         clip the download/copy buttons. */
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
      /* Force code token spans to inherit the block's monospace font. They'd
         otherwise be grabbed by this extension's own chat-font rule
         (#gwp-font-style: 'model-response :not(mat-icon)...', specificity
         (0,1,2) !important). This selector is (0,1,3) so it wins; the spans
         then inherit the mono font we set inline on <code>. */
      code-block pre code *:not(.gwp-code-gutter) {
        font-family: inherit !important;
      }
      /* Line-number gutter. Font/size/line-height are copied from the code
         element at runtime (inline) so numbers stay aligned. */
      .gwp-code-gutter {
        position: absolute; left: 0; text-align: right; white-space: pre;
        user-select: none; pointer-events: none; box-sizing: border-box;
        color: rgba(255,255,255,0.34); border-right: 1px solid rgba(255,255,255,0.12);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }
  function removeStyle() { document.getElementById("gwp-code-style")?.remove(); }

  // Strip every inline style + gutter we added, reverting a block to default.
  function stripBlock(cb) {
    const pre = cb.querySelector("pre");
    if (!pre) return;
    ["background-color", "border-radius", "border", "box-shadow", "transition",
     "backdrop-filter", "-webkit-backdrop-filter", "font-family", "font-size",
     "padding-left", "padding-right", "position"].forEach((p) => pre.style.removeProperty(p));
    const codeEl = pre.querySelector("code");
    if (codeEl) { codeEl.style.removeProperty("font-family"); codeEl.style.removeProperty("font-size"); }
    pre.querySelector(":scope > .gwp-code-gutter")?.remove();
    try { io.unobserve(pre); } catch (_) {}
    pre.__gwpSig = null;
  }

  // Apply the current on/off state to the page (no storage write — caller does that).
  function applyEnabledState() {
    if (enabled) {
      applyStyle();
      document.querySelectorAll("code-block").forEach((cb) => { addGear(cb); applyBlock(cb); refreshGearDot(cb); });
    } else {
      removeStyle();
      document.querySelectorAll("code-block").forEach((cb) => { addGear(cb); stripBlock(cb); });
    }
  }
  function setEnabled(on) {
    enabled = on;
    chrome.storage.local.set({ codeStyleEnabled: on });
    applyEnabledState();
  }

  // Gemini pins the code header (sticky). Pin it to the top of the block so it
  // doesn't slide over the code while scrolling.
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

  // ── Per-block: inline font/size + line-number gutter ──────────
  function applyBlock(cb) {
    const pre = cb.querySelector("pre");
    if (!pre) return;
    const codeEl = pre.querySelector("code") || pre;
    const st = styleFor(cb);

    io.observe(pre);            // track visibility (idempotent)
    pre.__gwpBlur = st.blur;

    const lineCount = st.lineNumbers
      ? codeEl.textContent.replace(/\n+$/, "").split("\n").length : 0;
    // Signature of everything that affects this block's rendered look. If it's
    // unchanged, skip the (reflow-inducing) re-apply — just keep blur in sync.
    const sig = [st.tintColor, st.tintOpacity, st.blur, st.border, st.radius,
                 st.font, st.fontSize, st.lineNumbers, lineCount].join("|");
    if (pre.__gwpSig === sig) { setBlur(pre); return; }
    pre.__gwpSig = sig;

    applyCard(pre, st);
    setBlur(pre);
    pinSticky(cb, pre);

    // Always set an explicit monospace inline (custom font, else a mono stack).
    // The chat-font feature (gwp-font-style) forces the user's reading font on
    // everything inside model-response with !important; setting our font inline
    // is the only way that reliably wins on <pre>/<code>. (Token spans are
    // handled by the high-specificity rule in applyStyle.)
    const fam = st.font
      ? `'${st.font}', ui-monospace, monospace`
      : `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    [pre, codeEl].forEach((el) => {
      el.style.setProperty("font-family", fam, "important");
      el.style.setProperty("font-size", st.fontSize + "px", "important");
    });
    pre.style.setProperty("padding-right", "18px", "important");

    let gutter = pre.querySelector(":scope > .gwp-code-gutter");
    if (!st.lineNumbers) {
      if (gutter) gutter.remove();
      pre.style.setProperty("padding-left", "18px", "important");
      pre.style.removeProperty("position");
      return;
    }

    const count = lineCount;
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

    const cs = getComputedStyle(codeEl);
    gutter.style.fontFamily = cs.fontFamily;
    gutter.style.fontSize = cs.fontSize;
    gutter.style.lineHeight = cs.lineHeight;
    gutter.style.paddingTop = cs.paddingTop;
    gutter.style.top = codeEl.offsetTop + "px";
    gutter.style.width = (digits + 1.2) + "ch";
    gutter.style.paddingRight = "0.6ch";
  }

  // ── Persist + apply ───────────────────────────────────────────
  function commit() {
    chrome.storage.local.set({ codeStyle: s, codeStyleBlocks: blocks });
  }
  function reapply(cb) {
    const pre = cb.querySelector("pre");
    if (pre) pre.__gwpSig = null;   // force this one block to re-render
    applyBlock(cb);
    refreshGearDot(cb);
  }
  // Edit one field of the block the panel is open on.
  function editField(cb, key, val) {
    const id = blockId(cb);
    const base = blocks[id] ? blocks[id] : { ...DEFAULTS, ...s };
    base[key] = val;
    blocks[id] = base;
    commit();
    if (key === "font") loadFonts();
    reapply(cb);
  }

  // ── Settings panel (single shared instance) ───────────────────
  let panel = null, panelBlock = null, panelGear = null;

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
          x.style.borderColor = "transparent"; x.style.color = "#aaa"; x.style.background = "#2a2a4a";
        });
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
    const wrap = document.createElement("div");
    wrap.style.cssText = "margin-bottom:10px;";
    const lab = document.createElement("div");
    lab.style.cssText = "display:flex;justify-content:space-between;font-size:11px;color:#9aa0c0;margin-bottom:5px;";
    const name = document.createElement("span"); name.textContent = labelText;
    const valEl = document.createElement("span");
    valEl.style.cssText = "color:#4a7cff;font-weight:600;"; valEl.textContent = current + unit;
    lab.appendChild(name); lab.appendChild(valEl);
    const range = document.createElement("input");
    range.type = "range"; range.min = min; range.max = max; range.step = step; range.value = current;
    range.style.cssText = "width:100%;accent-color:#4a7cff;cursor:pointer;";
    range.addEventListener("input", (e) => {
      e.stopPropagation();
      valEl.textContent = range.value + unit;
      onInput(parseInt(range.value, 10));
    });
    wrap.appendChild(lab); wrap.appendChild(range);
    return wrap;
  }

  function buildPanel(cb) {
    const cur = styleFor(cb);
    const customized = !!blocks[blockId(cb)];

    const p = document.createElement("div");
    p.className = "gwp-code-panel";
    p.style.cssText =
      "position:fixed;z-index:2147483000;width:250px;max-height:80vh;overflow-y:auto;" +
      "background:#1a1a2e;border:1px solid #3a3a5a;border-radius:10px;padding:14px;" +
      "box-shadow:0 12px 40px rgba(0,0,0,0.5);font-family:'Segoe UI',system-ui,sans-serif;" +
      "color:#e0e0e0;display:none;";
    p.addEventListener("click", (e) => e.stopPropagation());

    const title = document.createElement("div");
    title.textContent = "⚙ This block's look";
    title.style.cssText = "font-size:13px;font-weight:600;color:#fff;margin-bottom:3px;";
    p.appendChild(title);
    const sub = document.createElement("div");
    sub.textContent = customized ? "Customized — overrides the default." : "Editing this block only.";
    sub.style.cssText = "font-size:10px;color:#8a90b0;margin-bottom:12px;";
    p.appendChild(sub);

    // Master on/off — when off, every code block reverts to Gemini's default look.
    const master = document.createElement("div");
    master.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #2a2a4a;";
    const mLab = document.createElement("span");
    mLab.textContent = "Code styling"; mLab.style.cssText = "font-size:12px;font-weight:600;color:#fff;";
    const mBtn = document.createElement("button");
    mBtn.style.cssText = "padding:5px 16px;font-size:11px;font-weight:700;border-radius:6px;cursor:pointer;border:1px solid transparent;";
    mBtn.textContent = enabled ? "On" : "Off";
    mBtn.style.background = enabled ? "rgba(74,124,255,0.18)" : "#2a2a4a";
    mBtn.style.color = enabled ? "#4a7cff" : "#aaa";
    mBtn.style.borderColor = enabled ? "#4a7cff" : "transparent";
    mBtn.addEventListener("click", (e) => { e.stopPropagation(); setEnabled(!enabled); openPanel(panelGear, cb); });
    master.appendChild(mLab); master.appendChild(mBtn);
    p.appendChild(master);

    if (!enabled) {
      const off = document.createElement("div");
      off.textContent = "Code blocks use Gemini's default look. Turn on to customize.";
      off.style.cssText = "font-size:11px;color:#8a90b0;line-height:1.5;";
      p.appendChild(off);
      document.body.appendChild(p);
      return p;
    }

    p.appendChild(makeBtnRow("Border", [
      ["none", "None"], ["solid", "Border"], ["shiny", "Shiny"], ["synthwave", "Synthwave"],
    ], cur.border, (v) => editField(cb, "border", v)));

    p.appendChild(makeBtnRow("Font", [
      ["", "Default"], ["JetBrains Mono", "JetBrains"], ["Fira Code", "Fira Code"],
      ["Source Code Pro", "Source"], ["IBM Plex Mono", "IBM Plex"],
    ], cur.font, (v) => editField(cb, "font", v)));

    p.appendChild(makeSlider("Font Size", 10, 22, 1, cur.fontSize, "px", (v) => editField(cb, "fontSize", v)));

    // Line numbers toggle
    let ln = cur.lineNumbers;
    const lnWrap = document.createElement("div");
    lnWrap.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;";
    const lnLab = document.createElement("span");
    lnLab.textContent = "Line Numbers"; lnLab.style.cssText = "font-size:11px;color:#9aa0c0;";
    const lnBtn = document.createElement("button");
    const paintLn = () => {
      lnBtn.textContent = ln ? "On" : "Off";
      lnBtn.style.background = ln ? "rgba(74,124,255,0.14)" : "#2a2a4a";
      lnBtn.style.color = ln ? "#4a7cff" : "#aaa";
      lnBtn.style.borderColor = ln ? "#4a7cff" : "transparent";
    };
    lnBtn.style.cssText = "padding:4px 14px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;border:1px solid transparent;";
    paintLn();
    lnBtn.addEventListener("click", (e) => { e.stopPropagation(); ln = !ln; paintLn(); editField(cb, "lineNumbers", ln); });
    lnWrap.appendChild(lnLab); lnWrap.appendChild(lnBtn);
    p.appendChild(lnWrap);

    // Tint color + opacity
    const tintWrap = document.createElement("div");
    tintWrap.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:10px;";
    const tintLab = document.createElement("span");
    tintLab.textContent = "Tint"; tintLab.style.cssText = "font-size:11px;color:#9aa0c0;flex:1;";
    const colorEl = document.createElement("input");
    colorEl.type = "color"; colorEl.value = cur.tintColor;
    colorEl.style.cssText = "width:26px;height:20px;border:none;border-radius:4px;cursor:pointer;padding:0;background:none;";
    colorEl.addEventListener("input", (e) => { e.stopPropagation(); editField(cb, "tintColor", colorEl.value); });
    tintWrap.appendChild(tintLab); tintWrap.appendChild(colorEl);
    p.appendChild(tintWrap);

    p.appendChild(makeSlider("Tint Opacity", 0, 100, 1, cur.tintOpacity, "%", (v) => editField(cb, "tintOpacity", v)));
    p.appendChild(makeSlider("Blur", 0, 24, 1, cur.blur, "px", (v) => editField(cb, "blur", v)));
    p.appendChild(makeSlider("Corner Radius", 0, 28, 1, cur.radius, "px", (v) => editField(cb, "radius", v)));

    // Scope actions
    const actions = document.createElement("div");
    actions.style.cssText = "display:flex;gap:6px;margin-top:6px;";
    const allBtn = document.createElement("button");
    allBtn.textContent = "Apply to all";
    allBtn.style.cssText = "flex:1;padding:7px;font-size:11px;font-weight:600;border:none;border-radius:7px;cursor:pointer;background:rgba(74,124,255,0.22);color:#bcd0ff;";
    allBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      s = { ...DEFAULTS, ...styleFor(cb) };   // this block's look becomes the default
      blocks = {};                            // clear every per-block override
      commit(); loadFonts();
      document.querySelectorAll("code-block").forEach((c) => { c.querySelector("pre") && (c.querySelector("pre").__gwpSig = null); applyBlock(c); refreshGearDot(c); });
      closePanel();
    });
    const resetBtn = document.createElement("button");
    resetBtn.textContent = customized ? "Reset block" : "";
    resetBtn.style.cssText = "flex:1;padding:7px;font-size:11px;font-weight:600;border:none;border-radius:7px;cursor:pointer;background:#2a2a4a;color:#aaa;" + (customized ? "" : "visibility:hidden;");
    resetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      delete blocks[blockId(cb)];
      commit(); loadFonts(); reapply(cb);
      openPanel(panelGear, cb);   // rebuild to show it now follows the default
    });
    actions.appendChild(allBtn); actions.appendChild(resetBtn);
    p.appendChild(actions);

    document.body.appendChild(p);
    return p;
  }

  function openPanel(gearBtn, cb) {
    if (panel) panel.remove();
    panelBlock = cb; panelGear = gearBtn;
    panel = buildPanel(cb);
    panel.style.display = "block";

    const r = gearBtn.getBoundingClientRect();
    const w = 250, margin = 8;
    let left = r.right + margin;
    if (left + w > window.innerWidth) left = r.left - w - margin;
    if (left < margin) left = margin;
    let top = r.bottom + margin;
    const h = Math.min(panel.offsetHeight, window.innerHeight * 0.8);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  }
  function closePanel() { if (panel) panel.style.display = "none"; }

  document.addEventListener("mousedown", (e) => {
    if (panel && panel.style.display === "block" &&
        !panel.contains(e.target) && !e.target.closest(".gwp-code-gear")) {
      closePanel();
    }
  });

  // ── Attach gear to each code block ────────────────────────────
  function refreshGearDot(cb) {
    const gear = cb.querySelector(":scope .gwp-code-gear");
    if (gear) gear.classList.toggle("gwp-custom", !!blocks[blockId(cb)]);
  }
  function addGear(cb) {
    if (cb.querySelector(":scope .gwp-code-gear")) { refreshGearDot(cb); return; }

    const btn = document.createElement("button");
    btn.className = "gwp-code-gear";
    btn.type = "button";
    btn.textContent = "⚙";
    btn.title = "Style this code block";
    btn.style.position = "relative";  // anchor the custom dot
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      if (panel && panel.style.display === "block" && panelBlock === cb) closePanel();
      else openPanel(btn, cb);
    });

    // Gemini's header (.code-block-decoration — a flex row of [language label,
    // .buttons]) holds copy/download inside a FIXED-WIDTH .buttons box sized
    // for exactly two icons. Inserting our gear into that box overflows it and
    // wraps the icons onto a second line (the overlap bug). Instead we sit the
    // gear in the header itself, pushed right (margin-left:auto) so it hugs the
    // button group without disturbing it.
    const dec = cb.querySelector(".code-block-decoration, .header-formatted");
    if (dec) {
      btn.style.marginLeft = "auto";
      btn.style.marginRight = "6px";
      const buttons = dec.querySelector(".buttons");
      if (buttons) dec.insertBefore(btn, buttons);
      else dec.appendChild(btn);
      refreshGearDot(cb);
    }
    // No header yet → skip; the next scan (every 300ms) retries once it exists.
  }

  function scan() {
    document.querySelectorAll("code-block").forEach((cb) => {
      addGear(cb);                       // gear always present (lets you re-enable)
      if (enabled) applyBlock(cb);
      else stripBlock(cb);
    });
  }

  // ── Live updates from other tabs / the popup ──────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    // Master on/off flipped elsewhere (another tab): apply it here too.
    if (changes.codeStyleEnabled) {
      enabled = changes.codeStyleEnabled.newValue !== false;
      applyEnabledState();
      return;
    }
    if (!changes.codeStyle && !changes.codeStyleBlocks) return;
    if (changes.codeStyle) s = { ...DEFAULTS, ...changes.codeStyle.newValue };
    if (changes.codeStyleBlocks) blocks = changes.codeStyleBlocks.newValue || {};
    if (!enabled) return;   // nothing to restyle while off
    loadFonts();
    // sig guard means unchanged blocks are skipped; only truly-changed ones re-render.
    document.querySelectorAll("code-block").forEach((cb) => { applyBlock(cb); refreshGearDot(cb); });
  });

  // ── Boot ──────────────────────────────────────────────────────
  // Throttle (not a resetting debounce): under a continuous mutation stream a
  // resetting debounce could starve; this guarantees a run ~every 300ms.
  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => { timer = null; scan(); }, 300);
  });

  chrome.storage.local.get({ codeStyle: DEFAULTS, codeStyleBlocks: {}, codeStyleEnabled: true }, (stored) => {
    s = { ...DEFAULTS, ...stored.codeStyle };
    blocks = stored.codeStyleBlocks || {};
    enabled = stored.codeStyleEnabled !== false;
    applyGearStyle();          // gear CSS is always present
    if (enabled) applyStyle();
    loadFonts();
    scan();
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
