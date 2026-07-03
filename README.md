<div align="center">

<img src="assets/icons/icon128.png" width="96" alt="Gemini Wallpaper logo">

# 🌌 Gemini Wallpaper

### Make Google Gemini™ truly yours ✨

Custom wallpaper · frosted-glass UI · highlights & linked notes · math fix · code themes · desktop pets<br>
**A personal power-up for the Gemini web app — no account, no cloud, 100% local.**

<p>
  <a href="../../releases/latest"><img src="https://img.shields.io/github/v/release/Buddy-Lu/Gemini-wallpaper?style=for-the-badge&color=8b5cf6&label=download" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/dependencies-none-16a34a?style=for-the-badge" alt="No dependencies">
</p>

<sub><b>English</b> · <a href="README.zh-TW.md">繁體中文</a></sub>

<br>

<img src="docs/img/overview.png" width="94%" alt="Gemini Wallpaper in action — wallpaper, glass UI, notes, highlights, code theme, and a pet">

<sub><i>A custom wallpaper, frosted UI, linked notes joined by arrows, colored highlights, a themed code block, and a DJ-duck companion — all live on one page.</i></sub>

</div>

---

## 👋 Why?

Gemini is great, but the page is *fixed* — one background, one look, nowhere to keep your own marks. Gemini Wallpaper injects into `gemini.google.com` and hands the page back to you: **your** wallpaper, **your** fonts, **your** glass, plus a set of reading and chat-management tools Gemini doesn't ship.

Everything is opt-in, everything persists in `chrome.storage.local`, and **nothing ever leaves your browser**. Almost every tool lives behind a single floating **Assistant orb**, so the page stays clean until you want it.

<div align="center">
<img src="docs/img/assistant-menu.png" width="340" alt="The floating Assistant menu grid">
<br><sub><i>Tap the orb → every feature, one grid.</i></sub>
</div>

---

## ✨ Features

### 🖼️ Background &amp; Look

Set any image (JPG/PNG/WebP) as Gemini's background — by **drag-and-drop**, **file picker**, or **paste (Ctrl+V)** straight onto the page. Then fine-tune a dark **dim** overlay, background **blur**, and **brightness** so text stays readable over any image, and **frost** the sidebar and input box like real glass with your own tint and opacity.

<div align="center">
<img src="docs/img/wallpaper.png" width="88%" alt="Wallpaper panel: show toggle, image preview, quality presets, dim/blur/bright/glass sliders">
</div>

- **🌅 Custom wallpaper** — any image, resized and stored locally so the page stays snappy.
- **🎚️ Dim · Blur · Brightness** — dial in readability over busy art.
- **🧊 Glass material** — frosted sidebar &amp; input bar with your tint + opacity (`Auto` samples the wallpaper).
- **⚡ Live &amp; persistent** — every change applies instantly, survives restarts, and re-applies as Gemini's SPA re-renders.

#### 🔤 Custom Fonts

Swap the interface font for **Latin** and **Traditional-Chinese** text independently — Latin leads, Chinese fills in for 中文 characters.

<div align="center">
<img src="docs/img/fonts.png" width="420" alt="Word Font panel with Latin and Chinese font chips">
</div>

---

### 📖 Reading &amp; Annotation

Drag to select text in any answer and mark it with a **highlighter** or **underline** in several colors, or pin a floating **note card** to a passage — joined to the text by a drawn arrow. Marks and notes are saved **per conversation** and restored across scrolling, navigation, and reloads.

<div align="center">
<img src="docs/img/annotate.png" width="90%" alt="Highlights in several colors plus linked note cards connected by arrows">
</div>

<table>
<tr>
<td width="50%" align="center"><img src="docs/img/highlighter.png" alt="Colored highlights and underlines on an answer"><br><sub><b>🖍️ Highlights &amp; underlines</b> — multi-color, saved per chat.</sub></td>
<td width="50%" align="center"><img src="docs/img/notes.png" alt="Draggable note cards linked to text"><br><sub><b>📝 Linked notes</b> — draggable cards tied to a passage.</sub></td>
</tr>
</table>

#### ∑ Math Fix

When Gemini prints **raw LaTeX** instead of rendering it, each broken equation gets a **Fix** button that renders it in place with **KaTeX** (bundled locally — works offline). Handles block `$$…$$` and inline `$…$`, and leaves plain prose and currency like `$5` alone.

<table>
<tr>
<td width="50%" align="center"><b>Before — raw LaTeX</b></td>
<td width="50%" align="center"><b>After — one click</b></td>
</tr>
<tr>
<td><img src="docs/img/math-before.png" alt="Equations shown as raw LaTeX with Fix buttons"></td>
<td><img src="docs/img/math-after.png" alt="Same equations rendered cleanly with KaTeX"></td>
</tr>
</table>

#### 🎨 Code Block Styler

Give every code block its own look from a ⚙ panel: border style (**none / border / shiny / synthwave**), monospace font, size, line numbers, tint + opacity, backdrop blur, and corner radius. Style **one block** or **apply to all** — per-block looks re-attach even after Gemini re-renders. Set a global default (and a master on/off) from the **Code Theme** card in the Assistant.

<table>
<tr>
<td width="62%" align="center"><img src="docs/img/code.png" alt="A themed code block over the wallpaper"><br><sub>A themed block, live over your wallpaper.</sub></td>
<td width="38%" align="center"><img src="docs/img/code-panel.png" alt="Code styling panel with border, font, tint, blur controls"><br><sub>The per-block ⚙ styling panel.</sub></td>
</tr>
</table>

---

### 💬 Chat Management

- **👁️ Hide chat history** — collapse any Q&amp;A exchange to a slim snippet bar with a per-turn eye toggle. Hidden turns are remembered per conversation, so long sessions stay scannable.
- **🗑️ Sidebar bulk delete** — adds a checkbox to each sidebar conversation; select many and a floating bar clears them in one go. It drives Gemini's own delete flow (no private APIs), and selection survives the sidebar's virtualized scrolling.

<div align="center">
<img src="docs/img/hide.png" width="90%" alt="Collapsed chat turns shown as slim snippet bars">
</div>

---

### 🐾 Fun &amp; Ambience

- **🧭 Assistant launcher** — a floating, iOS-AssistiveTouch-style **glass orb** that snaps to the nearest edge, breathes when idle, and springs open the feature grid.
- **⏳ Thinking buddy** — a looping anime mascot appears beside your prompt while Gemini generates, then vanishes when the answer lands.
- **🪟 Windowed chatbox** — turn the input box into a draggable/resizable window with macOS-style traffic lights (minimize · restore · maximize) and its own art panel.
- **🦆 Desktop pet** — a little companion wanders the page. Pick your favorite:

<table>
<tr>
<td align="center"><img src="docs/img/pet-duck.png" height="96" alt="Duck pet sprite"><br><sub><b>Duck</b></sub></td>
<td align="center"><img src="docs/img/pet-dog.png" height="96" alt="Dog pet sprite"><br><sub><b>Dog</b></sub></td>
<td align="center"><img src="docs/img/pet-fox.png" height="96" alt="Fox pet sprite"><br><sub><b>Fox</b></sub></td>
</tr>
</table>

<sub>Pet sprites from the <a href="https://github.com/tonybaloney/vscode-pets">vscode-pets</a> project.</sub>

---

### ⚙️ One Control Center

Language (8 locales), image quality, glass tint, code defaults, GitHub, and a two-tap reset — all in one bento-grid settings view.

<div align="center">
<img src="docs/img/settings.png" width="88%" alt="Settings bento grid: language, image quality, glass tint, GitHub, reset">
</div>

### 🛡️ Under the Hood

- **Context guard** — a tiny first-loaded script stops other modules from throwing *"Extension context invalidated"* after you reload the unpacked extension; storage calls quietly no-op until you refresh the tab.
- **Zero dependencies, zero network** — no build step, no tracking, no external calls (KaTeX and its fonts are vendored locally). Settings live only in `chrome.storage.local`.

---

## 📥 Installation

Not on the Web Store yet — load it unpacked in about a minute:

1. **Download** the latest **[release ZIP](../../releases/latest)** and unzip it (you'll get one `gemini-wallpaper` folder). *Or* clone this repo.
2. Open **`chrome://extensions/`** (Edge: `edge://extensions/`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the folder containing **`manifest.json`**.
5. Pin **Gemini Wallpaper** from the puzzle-piece menu.
6. Open **[gemini.google.com](https://gemini.google.com)** — the Assistant orb appears, and the toolbar popup gives you wallpaper controls.

> After editing the code, hit **Reload** on `chrome://extensions/`, then refresh the Gemini tab.

---

## 🚀 Quick Start

- **Set a wallpaper** — toolbar icon → drop or pick an image → tune dim / blur / brightness. Or just **paste an image** anywhere on the page.
- **Reach every feature** — tap the floating **Assistant orb** and pick an icon.
- **Annotate** — select text → choose a highlight color, or add a linked note.
- **Fix math** — spot a flagged equation → click **Fix**.
- **Clean up** — open **Hide Chat** eyes to fold exchanges, or enable **Bulk Delete** to clear old chats.

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
├── assets/                # toolbar + Assistant icons, bundled fonts
└── docs/img/              # README screenshots
```

Each content script is a self-contained IIFE. They never call each other — they coordinate purely through `chrome.storage.local`, so the popup writes a key and the relevant module picks it up live.

---

## 🩹 Troubleshooting

- **A feature stopped showing?** Gemini's DOM (obfuscated class names) shifts between deployments. Refresh the tab first; the modules use broad, resilient selectors, but Google can still move things.
- **"Extension context invalidated" in the console?** You reloaded the unpacked extension while a Gemini tab was open — just refresh the tab. `guard.js` keeps it from breaking in the meantime.
- **Math didn't render?** Only equations Gemini printed as raw LaTeX get a **Fix** button; already-rendered math is left as-is.

### ⚠️ Known limitations

- **Assistant orb sometimes goes unclickable.** Occasionally the floating orb stops responding to clicks — just **refresh the page** and it comes back.
- **Slight element shifts.** Because features manipulate Gemini's DOM, some elements can nudge a few pixels out of place, which may affect the aesthetics.
- **Chatbox doesn't fill the whole page in full-screen.** In maximize mode the windowed chatbox can't yet stretch to the full width of the page's text.
- **Other widgets may interfere.** Extensions that also look for the chat input can conflict — e.g. a *FastFolder*-style UI trying to locate the chatbox may make its own panel shift to follow it.
- **Mostly vibe-coded.** Much of the code was written fast and by feel, and hasn't had a thorough review yet — expect rough edges, and PRs are welcome.

---

## 📄 License

**MIT** — do whatever you want with it. KaTeX is bundled under its own MIT license, and pet sprites come from the [vscode-pets](https://github.com/tonybaloney/vscode-pets) project.

<div align="center">
<br>
<sub>Not affiliated with Google. "Gemini" is a trademark of Google LLC.</sub>
</div>
