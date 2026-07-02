<div align="center">

# 🌌 Gemini Wallpaper

### Make Google Gemini™ truly yours ✨

Set a custom wallpaper, glass-frost the UI, annotate answers, tame long chats,
and keep a little companion around while you work.
**A personal power-up for the Gemini web app — no account, no cloud, all local.**

<p>
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/Chrome-✓-4285F4?style=flat-square&logo=googlechrome&logoColor=white" alt="Chrome">
  <img src="https://img.shields.io/badge/Edge-✓-0078D7?style=flat-square&logo=microsoftedge&logoColor=white" alt="Edge">
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License">
  <img src="https://img.shields.io/badge/dependencies-none-brightgreen?style=flat-square" alt="No dependencies">
</p>

</div>

---

## 👋 Why?

Gemini is great, but the page is *fixed* — one background, one look, no place to
keep your own marks. This extension injects itself into `gemini.google.com` and
hands the page back to you: your wallpaper, your fonts, your glass, plus a set of
reading and chat-management tools that Gemini doesn't ship. Everything is opt-in,
everything persists in `chrome.storage.local`, and nothing ever leaves your browser.

Almost every tool is reachable from a single floating **Assistant** orb, so the
page stays clean until you want it.

---

## ✨ Features

### 🖼️ Background & Look

- **🌅 Custom Wallpaper** — Set any image (JPG/PNG/WebP) as Gemini's background. Add one by **drag-and-drop**, **file picker**, or **paste (Ctrl+V)** straight onto the page. Stored as a resized image so it stays snappy.
- **🎚️ Dim · Blur · Brightness** — Fine-tune a dark overlay, background blur, and brightness so your text stays readable over any image.
- **🧊 Glass Material** — Frost the sidebar and input box like real glass, with your own **tint color** and **opacity**.
- **🔤 Custom Fonts** — Swap the interface font for Latin and Traditional-Chinese text independently.
- **⚡ Live & Persistent** — Every change applies instantly (no reload) and survives restarts. A `MutationObserver` re-applies the look whenever Gemini's SPA re-renders.

### 📖 Reading & Annotation

- **🖍️ Highlights & Underlines** — Drag to select text in any answer and mark it with a **highlighter** or **underline** in several colors. Marks are saved and restored across navigation and reloads.
- **📝 Linked Notes** — Attach a floating, draggable **note card** to any passage in a reply, connected to the text by a drawn arrow. Notes are scoped per-conversation and follow the text as you scroll.
- **∑ Math Fix** — When Gemini prints raw LaTeX instead of rendering it, each broken equation is flagged with a **Fix** button that renders it in place with **KaTeX** — bundled locally, so it works offline. Handles both block (`$$…$$`) and inline (`$…$`) math, and leaves plain prose and currency (`$5`) alone.
- **🎨 Code Block Styler** — Give every code block its own look from a ⚙ panel: border style (**none / border / shiny / synthwave**), monospace font, font size, line numbers, tint + opacity, backdrop blur, and corner radius. Style **one block** or **apply to all**; per-block looks re-attach even after Gemini re-renders.

### 💬 Chat Management

- **👁️ Hide Chat History** — Collapse any question-and-answer exchange down to a slim snippet bar with a per-turn eye toggle. Hidden turns are remembered per conversation, so long sessions stay scannable.
- **🗑️ Sidebar Bulk Delete** — Adds a checkbox to each conversation in the sidebar; select as many as you like and a floating bar deletes them in one go. It drives Gemini's own delete flow (no private APIs), and selection survives the sidebar's virtualized scrolling.

### 🐾 Fun & Ambience

- **🧭 Assistant Launcher** — A floating, iOS-AssistiveTouch-style **glass orb** that snaps to the nearest screen edge, breathes and shimmers when idle, and springs open a grid of feature icons (with an intro tooltip on each) plus a settings button — the hub for everything above.
- **🦆 Desktop Pet** — A little **duck, dog, or fox** wanders along the page (sprites from the vscode-pets project).
- **⏳ Thinking Buddy** — While Gemini is generating, a looping anime "loading" mascot appears beside your prompt so the wait feels shorter, then disappears when the answer arrives.
- **🪟 Windowed Chatbox** — Turn the input box into a real draggable/resizable window with macOS-style traffic lights (**minimize · restore · maximize**) and its own art panel for border, tint, blur, and radius.

### 🛡️ Under the Hood

- **Context guard** — A tiny first-loaded script keeps the other modules from throwing "Extension context invalidated" after you reload the unpacked extension; storage calls quietly no-op until you refresh the tab.
- **Zero dependencies, zero network** — No build step, no tracking, no external calls (KaTeX and its fonts are vendored locally). Settings live only in `chrome.storage.local`.

---

## 📥 Installation

This isn't on the Web Store yet — load it unpacked in about a minute:

1. **Download** this repo (green **Code → Download ZIP**, then unzip) or `git clone` it.
2. Open **`chrome://extensions/`** (works the same on Edge: `edge://extensions/`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. Pin **Gemini Wallpaper** from the puzzle-piece menu.
6. Open **[gemini.google.com](https://gemini.google.com)** — the Assistant orb appears, and the toolbar popup gives you the wallpaper controls.

> After editing the extension, hit **Reload** on `chrome://extensions/`, then refresh the Gemini tab.

---

## 🚀 Quick Start

- **Set a wallpaper:** click the toolbar icon → drop or pick an image → tune dim / blur / brightness. Or just **paste an image** anywhere on the Gemini page.
- **Reach every feature:** tap the floating **Assistant orb** and pick an icon from the grid.
- **Annotate:** select text in an answer → choose a highlight color, or add a linked note.
- **Fix math:** spot a flagged equation → click **Fix**.
- **Clean up:** open **Hide Chat** eyes to fold exchanges, or enable **Bulk Delete** to clear old chats.

---

## 🗂️ Project Structure

```
Gemini-wallpaper/
├── manifest.json          # MV3 manifest (must stay at root)
├── src/
│   ├── content/           # injected content scripts (one IIFE per feature)
│   │   ├── guard.js           # stale-context guard (loads first)
│   │   ├── content.js         # wallpaper · fonts · glass
│   │   ├── assistant.js       # floating orb + feature menu
│   │   ├── annotations.js     # highlights / underlines
│   │   ├── linked-notes.js    # per-chat note cards
│   │   ├── math.js            # LaTeX detect + Fix (KaTeX)
│   │   ├── code-style.js      # per-block code theming
│   │   ├── hide-chat.js       # collapse exchanges
│   │   ├── bulk-delete.js     # sidebar multi-select delete
│   │   ├── chatbox-drag.js    # windowed input box
│   │   ├── pet.js             # walking desktop pet
│   │   └── thinking-buddy.js  # loading mascot
│   ├── popup/             # toolbar popup (popup.html + popup.js)
│   └── styles/            # content.css
├── vendor/
│   ├── katex/             # KaTeX lib + woff2 fonts (local, offline)
│   └── katex-fonts.js     # font-loading glue
└── assets/
    ├── icons/             # toolbar + Assistant menu icons
    └── wallpaper/         # your local wallpapers (gitignored)
```

Each content script is a self-contained IIFE. They never call each other — they
coordinate purely through `chrome.storage.local`, so the popup writes a key and
the relevant module picks it up live. See **[PROJECT_DOCS.md](./PROJECT_DOCS.md)**
for a line-by-line walkthrough of how each module works.

---

## 🩹 Troubleshooting

- **Wallpaper or a feature stopped showing?** Gemini's DOM (obfuscated class names) changes between deployments. Refresh the tab first; if it persists, the selectors may need updating — the modules use broad, resilient selectors (`main`, `[role="main"]`, stable `data-test-id`s) but Google can still move things.
- **"Extension context invalidated" in the console?** You reloaded the unpacked extension while a Gemini tab was open. Just refresh the tab — `guard.js` keeps it from breaking in the meantime.
- **Math didn't render?** Only equations Gemini printed as raw LaTeX get a **Fix** button; already-rendered math is left as-is.

---

## 📄 License

**MIT** — do whatever you want with it. KaTeX is bundled under its own MIT license,
and pet sprites come from the [vscode-pets](https://github.com/tonybaloney/vscode-pets) project.

<div align="center">
  <sub>Not affiliated with Google. "Gemini" is a trademark of Google LLC.</sub>
</div>
