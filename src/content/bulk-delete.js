/**
 * Gemini Wallpaper - Sidebar Bulk Delete
 *
 * Adds a checkbox onto each conversation row in Gemini's sidebar. Select any
 * number, then a floating bar offers "Delete N". Deletion drives Gemini's own
 * UI (hover row → ⋮ → Delete → confirm) exactly like a user would — no private
 * APIs — targeting stable data-test-ids so it never mis-clicks the row itself.
 *
 * Selection is keyed by conversation id (from the /app/<id> href) so it
 * survives the sidebar's virtualized re-rendering. Enabled from the popup
 * (`bulkDeleteEnabled`). Approach adapted from hirakujira/AI-Chat-Bulk-Deleter.
 */
(function () {
  "use strict";

  const SEL = {
    row: 'gem-nav-list-item[data-test-id="conversation"]',
    link: 'a[href^="/app/"]',
    // Conversations nested inside a folder use an entirely separate structure.
    // Each conversation is a .gv-folder-conversation (the .gv-folder-item is a
    // wrapper around ALL of a folder's conversations — don't target that).
    folderRow: ".gv-folder-conversation",
    folderLink: 'a.gv-folder-conversation-link, a[href*="/app/"]',
    optionsTrigger: 'button:has(mat-icon[fonticon="more_vert"]), button[aria-haspopup="menu"]',
    folderOptions: ".gv-folder-actions-btn",
    deleteItem: 'button[data-test-id="delete-button"], [data-test-id="delete-button"]',
    confirmBtn: 'button[data-test-id="confirm-button"], [data-test-id="confirm-button"] button, [data-test-id="confirm-button"]',
    dialog: '[role="dialog"], mat-dialog-container, .mat-mdc-dialog-surface',
  };

  const idOf = (href) => { const m = /\/app\/([0-9a-zA-Z_-]+)/.exec(href || ""); return m ? m[1] : null; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let enabled = false;
  let running = false;
  const selected = new Set();   // conversation ids
  let bar = null, countEl = null, statusEl = null, delBtn = null;

  // ── DOM helpers (adapted from the reference engine) ───────
  // Full pointer sequence — Angular Material menu/dialog triggers don't fire
  // reliably from a bare .click() (they want a press/release too).
  function realClick(el) {
    if (!el) return false;
    const o = { bubbles: true, cancelable: true, view: window };
    try { el.focus && el.focus(); } catch (_) {}
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", { ...o, pointerType: "mouse" }));
      el.dispatchEvent(new MouseEvent("mousedown", o));
      el.dispatchEvent(new PointerEvent("pointerup", { ...o, pointerType: "mouse" }));
      el.dispatchEvent(new MouseEvent("mouseup", o));
    } catch (_) {}
    if (typeof el.click === "function") el.click();
    else el.dispatchEvent(new MouseEvent("click", o));
    return true;
  }
  async function waitFor(sel, timeout = 3000, interval = 100) {
    const start = Date.now();
    let el = document.querySelector(sel);
    while (!el && Date.now() - start < timeout) { await sleep(interval); el = document.querySelector(sel); }
    return el;
  }
  function isDisabled(el) {
    return !!(el.disabled || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("data-disabled"));
  }
  async function waitEnabled(el, timeout = 2500, interval = 100) {
    const start = Date.now();
    while (el && isDisabled(el) && Date.now() - start < timeout) await sleep(interval);
    return el;
  }
  function closeMenus() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  async function clearOverlays() { closeMenus(); await sleep(120); }

  // The canonical row carrying the ⋮ → Delete menu is always a
  // gem-nav-list-item. For a foldered conversation that row is a hidden
  // (display:none) archived duplicate — find it by id, and the caller un-hides
  // it. Folder rows (.gv-folder-conversation) only offer star/remove, no delete.
  function canonicalRow(id) {
    return [...document.querySelectorAll('gem-nav-list-item[data-test-id="conversation"]')].find((r) => {
      const a = r.querySelector('a[href^="/app/"]');
      return a && idOf(a.getAttribute("href")) === id;
    }) || null;
  }

  // ── Rows ──────────────────────────────────────────────────
  // Every visible row gets its own checkbox — even when the same conversation
  // appears in both "recent" and a folder. Selection is keyed by id, so the
  // duplicate checkboxes stay in sync (see injectChecks) and deletion still
  // runs once per id. (No dedup here — that's what dropped folder duplicates.)
  function pushRow(out, row, container, link) {
    if (!link) return;
    const id = idOf(link.getAttribute("href") || link.href || "");
    if (!id) return;
    const r = container.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return; // skip hidden/zero-size (e.g. archived dupes)
    out.push({ row, container, link, id, title: (link.textContent || "").trim() });
  }

  function convRows() {
    const out = [];
    // Recent conversations. The host <gem-nav-list-item> can be zero-size, so
    // measure/attach on the inner .mat-mdc-list-item box.
    document.querySelectorAll(SEL.row).forEach((row) => {
      const link = row.querySelector(SEL.link);
      const container = link ? (row.querySelector(".mat-mdc-list-item") || link.parentElement || row) : row;
      pushRow(out, row, container, link);
    });
    // Folder-nested conversations (.gv-folder-item is itself the sized box).
    document.querySelectorAll(SEL.folderRow).forEach((row) => {
      pushRow(out, row, row, row.querySelector(SEL.folderLink));
    });
    return out;
  }

  // ── Styles ────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById("gwp-bd-style")) return;
    const s = document.createElement("style");
    s.id = "gwp-bd-style";
    s.textContent = `
      /* Force-reveal the trailing ⋮ actions (normally visibility:hidden until a
         real CSS :hover, which JS can't fake) so the delete menu is clickable. */
      body.gwp-bd-active gem-nav-list-item .hovered-trailing-content,
      body.gwp-bd-active gem-nav-list-item [class*="trailing"],
      body.gwp-bd-active gem-nav-list-item .mat-mdc-menu-trigger {
        visibility: visible !important;
        opacity: 1 !important;
      }
      /* Give the checkbox its own left gutter so it never covers the title. */
      gem-nav-list-item .mat-mdc-list-item:has(> .gwp-bd-check),
      .gv-folder-conversation:has(> .gwp-bd-check) {
        padding-left: 34px !important;
      }
      .gwp-bd-check {
        position: absolute; left: 8px; top: 50%; transform: translateY(-50%);
        z-index: 6; display: flex; align-items: center; justify-content: center;
        width: 18px; height: 18px; border-radius: 4px; cursor: pointer;
        background: rgba(20,20,30,.55); box-shadow: 0 0 0 1px rgba(255,255,255,.22);
      }
      .gwp-bd-check input { cursor: pointer; width: 14px; height: 14px; margin: 0; accent-color: #f0a830; }
      #gwp-bd-bar {
        position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
        z-index: 2147483000; display: none; align-items: center; gap: 10px;
        padding: 8px 12px; border-radius: 8px; font-family: 'Consolas', ui-monospace, monospace;
        background: linear-gradient(180deg,#2c3037,#23262b); color: #e8ecf1;
        border: 1px solid #101215; border-top-color: #40464f; box-shadow: 0 8px 30px rgba(0,0,0,.55);
      }
      #gwp-bd-bar .gwp-bd-count { font-size: 12px; color: #f0a830; font-weight: 700; }
      #gwp-bd-bar .gwp-bd-status { font-size: 11px; color: #9aa0aa; min-width: 90px; }
      #gwp-bd-bar button {
        font: 700 11px/1 'Consolas', monospace; text-transform: uppercase; letter-spacing: 1px;
        padding: 7px 12px; border-radius: 5px; cursor: pointer; border: 1px solid #101215;
      }
      #gwp-bd-bar .gwp-bd-del { background: linear-gradient(180deg,#e05555,#b83030); color: #fff; border-color: #7a1c1c; }
      #gwp-bd-bar .gwp-bd-all, #gwp-bd-bar .gwp-bd-clear { background: linear-gradient(180deg,#333940,#282d33); color: #c8ccd2; border-top-color: #40464f; }
      #gwp-bd-bar button:hover { filter: brightness(1.12); }
      #gwp-bd-bar button:disabled { opacity: .5; cursor: default; filter: none; }
      /* confirm modal */
      #gwp-bd-modal { position: fixed; inset: 0; z-index: 2147483001; display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,.5); font-family: 'Segoe UI', system-ui, sans-serif; }
      #gwp-bd-modal .card { width: 300px; background: #1a1a2e; color: #e0e0e0; border: 1px solid #3a3a5a;
        border-radius: 10px; padding: 18px; box-shadow: 0 16px 50px rgba(0,0,0,.6); }
      #gwp-bd-modal h3 { font-size: 14px; margin: 0 0 8px; color: #fff; }
      #gwp-bd-modal p { font-size: 12px; color: #aab; margin: 0 0 16px; line-height: 1.5; }
      #gwp-bd-modal .row { display: flex; gap: 8px; justify-content: flex-end; }
      #gwp-bd-modal button { padding: 8px 14px; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; border: none; }
      #gwp-bd-modal .cancel { background: #2a2a4a; color: #ccc; }
      #gwp-bd-modal .ok { background: #e0474c; color: #fff; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── Checkboxes on rows ────────────────────────────────────
  function injectChecks() {
    if (!enabled) return;
    convRows().forEach(({ container, id }) => {
      const cs = getComputedStyle(container);
      if (cs.position === "static") container.style.position = "relative";
      let box = container.querySelector(":scope > .gwp-bd-check");
      if (!box) {
        box = document.createElement("label");
        box.className = "gwp-bd-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        const stop = (e) => e.stopPropagation();
        box.addEventListener("click", stop);
        box.addEventListener("mousedown", stop);
        input.addEventListener("click", stop);
        input.addEventListener("change", (e) => {
          e.stopPropagation();
          if (input.checked) selected.add(id); else selected.delete(id);
          updateBar();
        });
        box.appendChild(input);
        container.appendChild(box);
      }
      const input = box.querySelector("input");
      input.dataset.id = id;
      input.checked = selected.has(id);
      input.disabled = running;
    });
    updateBar();
  }

  function removeChecks() {
    document.querySelectorAll(".gwp-bd-check").forEach((b) => b.remove());
  }

  // ── Floating bar ──────────────────────────────────────────
  function ensureBar() {
    if (bar && document.body.contains(bar)) return;
    injectStyle();
    bar = document.createElement("div");
    bar.id = "gwp-bd-bar";
    bar.innerHTML =
      `<span class="gwp-bd-count">0 selected</span>` +
      `<button class="gwp-bd-all" type="button">All</button>` +
      `<button class="gwp-bd-clear" type="button">Clear</button>` +
      `<button class="gwp-bd-del" type="button">Delete</button>` +
      `<span class="gwp-bd-status"></span>`;
    document.body.appendChild(bar);
    countEl = bar.querySelector(".gwp-bd-count");
    statusEl = bar.querySelector(".gwp-bd-status");
    delBtn = bar.querySelector(".gwp-bd-del");
    bar.querySelector(".gwp-bd-all").addEventListener("click", () => {
      if (running) return;
      convRows().forEach(({ id }) => selected.add(id));
      injectChecks();
    });
    bar.querySelector(".gwp-bd-clear").addEventListener("click", () => {
      if (running) return;
      selected.clear();
      injectChecks();
    });
    delBtn.addEventListener("click", () => { if (!running && selected.size) confirmDelete(); });
  }

  function updateBar() {
    ensureBar();
    const n = selected.size;
    bar.style.display = enabled && n > 0 ? "flex" : "none";
    if (countEl) countEl.textContent = n + " selected";
    if (delBtn) { delBtn.textContent = "Delete " + n; delBtn.disabled = running || n === 0; }
  }

  // ── Confirm modal ─────────────────────────────────────────
  function confirmDelete() {
    const n = selected.size;
    const modal = document.createElement("div");
    modal.id = "gwp-bd-modal";
    modal.innerHTML =
      `<div class="card"><h3>Delete ${n} conversation${n > 1 ? "s" : ""}?</h3>` +
      `<p>This permanently deletes the selected chats from Gemini. This can't be undone.</p>` +
      `<div class="row"><button class="cancel" type="button">Cancel</button>` +
      `<button class="ok" type="button">Delete ${n}</button></div></div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
    modal.querySelector(".cancel").addEventListener("click", close);
    modal.querySelector(".ok").addEventListener("click", () => { close(); runDelete(); });
  }

  // ── Deletion engine ───────────────────────────────────────
  async function deleteOne(id) {
    await clearOverlays(); // dismiss any leftover menu/dialog that would block clicks

    // Always delete via the canonical gem-nav-list-item (folder rows have no
    // delete menu). Un-hide it if it's a hidden archived/folder duplicate.
    const row = canonicalRow(id);
    if (!row) return false;
    const restore = [];
    if (getComputedStyle(row).display === "none") {
      row.style.setProperty("display", "block", "important");
      restore.push(() => row.style.removeProperty("display"));
    }

    try {
      try { row.scrollIntoView({ block: "center" }); } catch (_) {}
      await sleep(80);
      const opt = row.querySelector(SEL.optionsTrigger);
      if (!opt) return false;
      realClick(opt);

      const del = await waitFor(SEL.deleteItem, 2500);
      if (!del) { closeMenus(); return false; }
      realClick(del);

      let confirm = await waitFor(SEL.confirmBtn, 3000);
      if (!confirm) {
        const dlg = await waitFor(SEL.dialog, 1500);
        if (dlg) { const bs = [...dlg.querySelectorAll("button")]; confirm = bs[bs.length - 1] || null; }
      }
      if (!confirm) { closeMenus(); return false; }
      await waitEnabled(confirm, 2500);
      if (isDisabled(confirm)) { closeMenus(); return false; }
      realClick(confirm);
      await sleep(500);
      return true;
    } finally {
      restore.forEach((f) => f());
    }
  }

  async function runDelete() {
    if (running) return;
    running = true;
    injectChecks();
    updateBar();
    const ids = [...selected];
    let done = 0, fail = 0;
    for (let i = 0; i < ids.length; i++) {
      if (statusEl) statusEl.textContent = `Deleting ${i + 1}/${ids.length}…`;
      let ok = false;
      try { ok = await deleteOne(ids[i]); } catch (_) { ok = false; }
      if (ok) { done++; selected.delete(ids[i]); } else { fail++; }
      await sleep(1200);
      injectChecks();
    }
    running = false;
    injectChecks();
    if (statusEl) statusEl.textContent = `Done: ${done} deleted${fail ? `, ${fail} failed` : ""}`;
    setTimeout(() => { if (statusEl && !running) statusEl.textContent = ""; }, 4000);
  }

  // ── Enable / disable ──────────────────────────────────────
  function applyEnabled(v) {
    enabled = !!v;
    document.body.classList.toggle("gwp-bd-active", enabled);
    if (enabled) {
      injectStyle();
      ensureBar();
      injectChecks();
      // Observe ONLY the sidebar, not document.body — otherwise every chat /
      // code-block render fires this and the constant re-injection starves
      // other modules' observers (e.g. code-block styling stops applying).
      const root = document.querySelector("bard-sidenav-container") ||
        document.querySelector("bard-sidenav") ||
        document.querySelector("side-navigation-v2") || document.body;
      observer.observe(root, { childList: true, subtree: true });
    } else {
      observer.disconnect();
      selected.clear();
      removeChecks();
      if (bar) bar.style.display = "none";
    }
  }

  // Throttle that still fires under a continuous mutation stream (a resetting
  // debounce could be starved during heavy sidebar re-rendering).
  let obsTimer = null;
  const observer = new MutationObserver(() => {
    if (!enabled || running) return;
    if (obsTimer) return;
    obsTimer = setTimeout(() => { obsTimer = null; injectChecks(); }, 300);
  });

  // ── Init ──────────────────────────────────────────────────
  chrome.storage.local.get({ bulkDeleteEnabled: false }, (s) => applyEnabled(s.bulkDeleteEnabled));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if ("bulkDeleteEnabled" in changes) applyEnabled(changes.bulkDeleteEnabled.newValue);
  });

})();
