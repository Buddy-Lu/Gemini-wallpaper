# Gemini Wallpaper 專案完整解析文件

> 這份文件目標：讓你看得懂每一個檔案、每一個函式、每一行關鍵程式碼的意圖與原理。
>
> 適合對象：剛接觸 Chrome Extension（MV3）、想完整搞懂這個專案運作機制的人。

---

## 目錄

1. [專案總覽（What & Why）](#1-專案總覽)
2. [架構樹（Architecture Tree）](#2-架構樹)
3. [檔案總覽表](#3-檔案總覽表)
4. [執行流程（從點擊圖示到看見效果）](#4-執行流程)
5. [`manifest.json` 逐行解析](#5-manifestjson-逐行解析)
6. [`content.js` 逐段解析（壁紙主邏輯）](#6-contentjs-逐段解析)
7. [`content.css` 逐段解析（注入樣式）](#7-contentcss-逐段解析)
8. [`popup.html` 逐段解析（設定面板 UI）](#8-popuphtml-逐段解析)
9. [`popup.js` 逐段解析（設定面板邏輯）](#9-popupjs-逐段解析)
10. [`pet.js` 逐段解析（桌寵動畫）](#10-petjs-逐段解析)
11. [`annotations.js` 逐段解析（文字劃線標註）](#11-annotationsjs-逐段解析)
12. [`math.js` 逐段解析（數學公式重排）](#12-mathjs-逐段解析)
13. [`chatbox-drag.js` 逐段解析（聊天框果凍拖曳）](#13-chatbox-dragjs-逐段解析)
14. [模組間共用的設計慣例](#14-模組間共用的設計慣例)
15. [資料儲存 schema](#15-資料儲存-schema)
16. [常見問題排除](#16-常見問題排除)

---

## 1. 專案總覽

**這個專案是什麼？**
一個 Chrome 擴充功能（Manifest V3），會把自己「注入」到 `gemini.google.com`，在 Gemini 的網頁上做這些事：

| 功能 | 模組檔案 |
|------|---------|
| 設定自訂壁紙背景、調暗度、模糊、亮度 | `content.js` + `content.css` |
| 自訂字型（拉丁文 / 繁中） | `content.js`（`applyFont`） |
| 玻璃材質（毛玻璃側欄、輸入框）色調與透明度 | `content.js`（`applyGlass`） |
| 桌寵（鴨子 / 狗 / 狐狸）走來走去 | `pet.js` |
| 在 AI 回覆上拖曳文字 → 螢光筆 / 底線標註 | `annotations.js` |
| 在 AI 回覆右上加 `∑` 鈕，把 LaTeX 重新渲染成公式 | `math.js` |
| 拖動聊天輸入框 + 果凍/牆面壓扁效果 | `chatbox-drag.js` |
| 透過彈出視窗統一設定上述功能 | `popup.html` + `popup.js` |

**為什麼要這樣做？**
Chrome Extension 沒有任何方式可以直接「修改 Gemini 網頁原始程式碼」，所以只能用 **content script** 把自己的 JavaScript / CSS 注入到 Gemini 頁面，再用 DOM 操作覆寫原本的樣式。

**所有設定** 都儲存在 `chrome.storage.local`（Chrome 提供的擴充功能本地儲存），這樣換頁、重開 Chrome 都不會遺失。

---

## 2. 架構樹

```
Gemini-wallpaper/                          ← 專案根目錄（也是要載入到 Chrome 的資料夾）
│
├── manifest.json                          ← 擴充功能的「身分證」，宣告所有能力
│
├── icons/                                 ← 工具列、擴充功能管理頁的圖示
│   ├── icon16.png                         ←  16×16  工具列旁
│   ├── icon48.png                         ←  48×48  擴充功能管理頁
│   └── icon128.png                        ← 128×128 Chrome Web Store / 安裝畫面
│
├── popup.html                             ← 點 toolbar 圖示後跳出來的「設定面板」UI
│                                              ↑ 320px 寬，深紫底配色，含開關 / 滑桿 / 字型按鈕
│
├── popup.js                               ← 設定面板的所有互動邏輯
│                                              ↑ 拖放圖片、貼上圖片、壓縮、寫入 chrome.storage
│
├── content.js                ┐
├── content.css               │
├── pet.js                    │ ← 五個檔案會被 manifest 一起注入到 gemini.google.com
├── annotations.js            │   每個檔案各自是一個 IIFE，獨立運作但共用 chrome.storage
├── math.js                   │   去傳遞設定值（live update：popup 寫入 → content 立即收到）
├── chatbox-drag.js           ┘
│
├── README.md                              ← 給使用者看的安裝說明
├── .gitignore                             ← Git 忽略檔
├── SMILE-1182023.jpg                      ← 一張範例壁紙（測試用，可刪）
└── PROJECT_DOCS.md                        ← 你正在讀的這份文件
```

### 模組之間的關係（執行期）

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Chrome 瀏覽器                                       │
│                                                                      │
│  ┌──────────────────────┐         ┌──────────────────────────────┐ │
│  │ Toolbar icon (點擊)   │ ──open─►│  popup.html / popup.js       │ │
│  └──────────────────────┘         │  ┌────────────────────────┐  │ │
│                                    │  │ 使用者拉滑桿、丟圖片    │  │ │
│                                    │  └─────────┬──────────────┘  │ │
│                                    │            ▼ write           │ │
│                                    │  chrome.storage.local        │ │
│                                    └──────────┬───────────────────┘ │
│                                               │                      │
│                                               │ onChanged event     │
│                                               ▼                      │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │   gemini.google.com 分頁                                         ││
│  │                                                                  ││
│  │   ┌──────────┐  ┌─────────┐  ┌──────────┐  ┌────────┐  ┌─────┐││
│  │   │content.js│  │ pet.js  │  │annotations│  │math.js │  │drag.││
│  │   │ 壁紙/字型 │  │ 桌寵    │  │ 螢光筆    │  │∑公式   │  │果凍 ││
│  │   └────┬─────┘  └────┬────┘  └────┬─────┘  └───┬────┘  └──┬──┘││
│  │        │             │            │            │           │   ││
│  │        ▼             ▼            ▼            ▼           ▼   ││
│  │   ┌────────────────────────────────────────────────────────┐  ││
│  │   │           DOM of Gemini (Angular SPA)                   │  ││
│  │   │   ＜被 MutationObserver 監看，內容變動就重貼樣式＞       │  ││
│  │   └────────────────────────────────────────────────────────┘  ││
│  └────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### 設定資料的流向

```
        使用者拖滑桿
              │
              ▼
        popup.js
              │
              ▼
   chrome.storage.local.set({...})
              │
              ▼ (Chrome 觸發 onChanged 事件)
   ┌──────────┼──────────┬──────────┬──────────┐
   ▼          ▼          ▼          ▼          ▼
content.js  pet.js  annotations.js math.js  drag.js
   │          │
   ▼          ▼
applySettings() applyEnabled()
applyFont()
applyGlass()
   │
   ▼
DOM 立即套用，使用者立刻看到變化
```

---

## 3. 檔案總覽表

| 檔案 | 角色 | 注入時機 | 核心責任 |
|------|------|----------|----------|
| `manifest.json` | 設定檔 | — | 宣告權限、注入清單、彈出視窗 |
| `popup.html` | UI | 點圖示時 | 設定面板長相 |
| `popup.js` | UI 邏輯 | popup 開啟時 | 處理使用者操作、寫入 storage |
| `content.js` | 內容腳本 | gemini 頁載入 idle 後 | 壁紙、字型、毛玻璃 |
| `content.css` | 樣式表 | gemini 頁載入時 | 壁紙層、玻璃層基礎樣式 |
| `pet.js` | 內容腳本 | 同上 | 桌寵狀態機 |
| `annotations.js` | 內容腳本 | 同上 | 文字標註與還原 |
| `math.js` | 內容腳本 | 同上 | KaTeX 重新渲染 |
| `chatbox-drag.js` | 內容腳本 | 同上 | 拖曳 + 果凍/牆面變形 |

---

## 4. 執行流程

**從 0 到看到壁紙效果，到底發生什麼？**

1. 使用者把整個 `Gemini-wallpaper/` 資料夾拖進 `chrome://extensions/`（開了 Developer Mode）。
2. Chrome 讀 `manifest.json` → 知道這是 MV3 擴充、要哪些權限、要把什麼東西注入到哪個網站。
3. 使用者打開 `https://gemini.google.com`。
4. Gemini 頁面 DOM 載入完成（`document_idle`）後，Chrome 依 `manifest.json` 順序把 `content.js → pet.js → annotations.js → math.js → chatbox-drag.js` 五個 JS 注入到頁面。同時 `content.css` 也被插入到 `<head>`。
5. 每個 JS 都是一個 IIFE（立即執行函式），各自做：
   - 從 `chrome.storage.local` 讀現有設定
   - 套用到 DOM
   - 註冊 `chrome.storage.onChanged` listener（之後 popup 改設定立即生效）
   - 註冊 `MutationObserver`（Gemini 是 SPA，內容會 re-render，要重新套用樣式）
6. 使用者點工具列圖示 → Chrome 開啟 `popup.html`（在工具列下方的小視窗）。
7. 使用者拖一張圖到上傳區 → `popup.js` 用 Canvas 把圖壓縮成 JPEG base64 → 寫入 `chrome.storage`。
8. `content.js` 的 `onChanged` listener 觸發 → 立刻把 `#gemini-wallpaper-bg` 這個 div 的 `background-image` 換掉 → 使用者看到壁紙更新。

---

## 5. `manifest.json` 逐行解析

```json
{
  "manifest_version": 3,
```
**第 1 行**：Manifest V3，這是 2024 之後 Chrome 唯一支援的擴充功能格式。MV2 已停用。

```json
  "name": "Gemini Wallpaper",
  "version": "1.0.0",
  "description": "Customize Google Gemini's background with your own wallpaper",
```
**第 2–4 行**：擴充功能的名稱、版本、描述。這些會顯示在 `chrome://extensions/` 和 Chrome Web Store。

```json
  "permissions": ["storage", "unlimitedStorage", "activeTab"],
```
**第 5 行**：要求三個權限：
- `storage` — 用 `chrome.storage.local` 存設定。
- `unlimitedStorage` — 預設 `chrome.storage.local` 上限是 10 MB，加這個就無上限。壁紙圖片轉成 base64 可能很大，所以需要。
- `activeTab` — 對目前作用中的分頁有臨時操作權（這個專案實際上靠下面的 `host_permissions` 就夠，但留著無妨）。

```json
  "host_permissions": ["https://gemini.google.com/*"],
```
**第 6 行**：限定這個擴充只對 `gemini.google.com` 任何路徑有效。其他網站完全摸不到。

```json
  "content_scripts": [
    {
      "matches": ["https://gemini.google.com/*"],
      "js": ["content.js", "pet.js", "annotations.js", "math.js", "chatbox-drag.js"],
      "css": ["content.css"],
      "run_at": "document_idle"
    }
  ],
```
**第 7–14 行**：內容腳本的注入規則。
- `matches` — 在這些網址才注入。
- `js` — 依「陣列順序」注入這五個 JS。順序重要嗎？這專案因為每個都是獨立 IIFE，所以順序不太敏感，但 `content.js` 最先讓壁紙最早渲染。
- `css` — 同樣方式注入 CSS。
- `run_at: "document_idle"` — 等 DOM 載完、空閒時才注入。比 `document_end` 晚一點，比 `document_start` 安全很多，適合等 Gemini 自己的 Angular 組件渲染完。

```json
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "...", "48": "...", "128": "..." }
  },
```
**第 15–21 行**：工具列按鈕（`chrome.action` API）。點下去開 `popup.html`。三種尺寸圖示給不同 DPI 螢幕。

```json
  "icons": { "16": "...", "48": "...", "128": "..." }
}
```
**第 22–25 行**：擴充功能本身在管理介面顯示用的圖示（和上面 `action` 圖示是不同欄位，但通常設一樣）。

---

## 6. `content.js` 逐段解析

> 壁紙、字型、毛玻璃的核心。注入到 Gemini 頁面。

### 開頭註解（第 1–13 行）
解釋這支腳本的策略：
1. 在 Gemini UI 後面塞一個固定的背景 div 和半透明遮罩。
2. 讓 Gemini 自己的背景層變透明（這樣我們的壁紙才看得到）。
3. 監聽 `chrome.storage` 變更 → popup 改設定立即生效。
4. 用 `MutationObserver` 監聽 SPA 重渲染 → 重新套用透明化。

### IIFE 包裝（第 15–17 行 + 第 256 行）
```js
(function () {
  "use strict";
  ...
})();
```
**為什麼用 IIFE？** 避免把變數污染到 Gemini 頁面的全域 scope，也避免和其他擴充打架。`"use strict"` 讓錯誤更明顯。

### 預設值 `DEFAULTS`（第 19–29 行）
所有設定的預設值。注意關鍵：
- `imageData: ""` — base64 data URL 的壁紙影像。空字串代表沒有壁紙。
- `overlayOpacity: 0.5` — 黑色遮罩 50% 透明（用來壓暗壁紙讓文字可讀）。
- `chatFont` / `cjkFont` — 拉丁字型與中文字型，空字串代表用 Gemini 預設。
- `glassColor` / `glassOpacity` — 玻璃色調 hex + 0~100 透明度。

```js
let settings = { ...DEFAULTS };
```
**第 31 行**：在記憶體中複製一份預設值。後面從 storage 讀真正的值會覆蓋上去。

### 建立壁紙 DOM 元素（第 34–45 行）
```js
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
```
建立兩個 div：壁紙層 + 遮罩層。**用 `prepend` 而不是 `appendChild`** 是因為 z-index 在 `content.css` 設成 0 / 1，但放在 body 最前面更穩，不會被後面動態插入的元素蓋掉時遇到 stacking context 問題。
`if (!getElementById(...))` 防止重複插入（萬一被叫兩次）。

### `applySettings()` 把設定套用到 DOM（第 48–75 行）
```js
if (!settings.enabled || !settings.imageData) {
  bgEl.style.display = "none";
  overlayEl.style.display = "none";
  restoreOriginalBg();
  return;
}
```
**沒啟用或沒圖** → 隱藏壁紙 + 復原 Gemini 原本背景。

```js
bgEl.style.backgroundImage = `url(${settings.imageData})`;
bgEl.style.filter = `brightness(${settings.brightness}%)`;
overlayEl.style.background = `rgba(0, 0, 0, ${settings.overlayOpacity})`;
```
**有圖** → 套上去。亮度用 CSS `filter: brightness()`，遮罩用 rgba 黑色。

```js
if (settings.blur > 0) {
  overlayEl.style.backdropFilter = `blur(${settings.blur}px)`;
  overlayEl.style.webkitBackdropFilter = `blur(${settings.blur}px)`;
}
```
**模糊** → 用 `backdrop-filter`，這會模糊「遮罩底下看到的東西」（也就是壁紙）。`-webkit-` 前綴給 Safari / 舊版 Chrome。

最後呼叫 `makeGeminiTransparent()`（重點）。

### `TRANSPARENT_TARGETS` 名單（第 82–92 行）
```js
const TRANSPARENT_TARGETS = [
  "body", "bard-app", "gemini-app", "main", "[role='main']",
  ".main-content", ".chat-container", ".conversation-container",
];
```
這些是 Gemini 用的「外層容器」，會有純色背景。要把它們的背景清掉壁紙才看得到。為什麼選這些選擇器？
- **`body` / `main`** — 標準 HTML，最穩。
- **`bard-app` / `gemini-app`** — Gemini 的 Angular 自訂元素標籤（`bard-app` 是 Bard 時代留下的；`gemini-app` 是預備未來改名）。
- **`.main-content` 等 class** — 中等寬度的選擇器。

註解特別提到「Only the page background layers — NOT UI chrome (sidebar, input bar)」。**重要！** 不能把側欄、輸入列一起變透明，不然介面元素的玻璃感就壞掉了。

### `makeGeminiTransparent()`（第 95–107 行）
```js
TRANSPARENT_TARGETS.forEach((sel) => {
  document.querySelectorAll(sel).forEach((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      el.style.setProperty("background-color", "transparent", "important");
      el.style.setProperty("background-image", "none", "important");
      el.dataset.geminiWallpaperOverride = "true";
    }
  });
});
```
- 逐一找到名單裡的元素。
- 讀「電腦算出來」的背景色（`getComputedStyle`）。
- **只有不透明才覆蓋** — 避免重複動作。
- 用 `setProperty(..., 'important')` 灌 `!important` 強過 Gemini 自己的樣式。
- 在元素上打個 `data-gemini-wallpaper-override="true"` 標記 → 之後關閉壁紙時方便復原。

### `restoreOriginalBg()`（第 109–115 行）
靠剛剛打的 data 標記找到所有被改的元素，移除我們加的 inline 樣式，恢復原樣。

### MutationObserver（第 122–134 行）
```js
let _observerTimer = null;
const observer = new MutationObserver(() => {
  if (!settings.enabled || !settings.imageData) return;
  clearTimeout(_observerTimer);
  _observerTimer = setTimeout(makeGeminiTransparent, 150);
});
```
**為什麼需要？** Gemini 是 SPA，切換對話、開新視窗時會大量重組 DOM，新生的元素又有預設背景色。我們要監聽變動 → 重新套用透明化。

**為什麼 debounce 150ms？** Angular re-render 一次可能觸發上百次 mutation，連續呼叫 `querySelectorAll` 會卡。等 150 ms 沒新變動才執行一次。

```js
observer.observe(document.body, { childList: true, subtree: true });
```
監聽 body 底下「整棵樹」的子節點變動（新增 / 移除）。

### `loadSettings()`（第 137–143 行）
```js
chrome.storage.local.get(DEFAULTS, (stored) => {
  settings = { ...DEFAULTS, ...stored };
  applySettings(); applyFont(); applyGlass();
});
```
從 storage 拿設定。把 `DEFAULTS` 當第一個參數的意思是：「如果 storage 沒這個 key，就用預設值」。Chrome 會自動補齊。

### 字型相關（第 149–205 行）

```js
const FONT_TARGETS = [
  "model-response", "user-query", "message-content",
  ".model-response-text", "response-container",
].join(", ");
```
要套字型的目標元素：AI 回覆、使用者問題、訊息內容等。

```js
const GOOGLE_FONTS = {
  "Inter": "Inter:wght@400;500;600",
  ...
};
```
字型 → Google Fonts URL 片段的對照表。`wght@400;500;600` 是請求這幾個粗細變化。

#### `applyFont()`：
```js
document.getElementById("gwp-font-link")?.remove();
document.getElementById("gwp-font-style")?.remove();
```
先移掉舊的 `<link>` 和 `<style>`，避免疊加。

```js
const families = [latin, cjk]
  .filter(f => f && GOOGLE_FONTS[f])
  .map(f => "family=" + GOOGLE_FONTS[f])
  .join("&");
```
把拉丁 + 中文兩個字型組成 Google Fonts CSS2 API 的 URL：
`https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Sans+TC:wght@400;500;700&display=swap`

```js
const stack = [latin, cjk].filter(Boolean).map(f => `'${f}'`).join(", ");
```
組合 CSS `font-family` 的字型堆疊。瀏覽器會優先用第一個能渲染該字元的字型 — 拉丁字用拉丁字型、中文字 fallback 到 CJK 字型。

```js
const notIcon = ":not(mat-icon):not([class*='mat-ligature'])";
```
**重要踩坑點**：Gemini 用 Material Symbols（icon font），那些 `<mat-icon>` 裡面其實是「字」靠特殊字型變成圖示。如果連這些都覆蓋 font-family，圖示會變成原始的英文字（像 "send"、"menu"），所以排除掉。

```js
${FONT_TARGETS}, ${FONT_TARGETS.split(", ").map(s => `${s} *${notIcon}`).join(", ")}
```
組出兩段選擇器：對 `FONT_TARGETS` 本身、以及它們底下所有非 icon 的後代。

### 玻璃材質 `applyGlass()`（第 208–235 行）

把 hex 顏色拆成 r / g / b，加上 opacity → rgba：
```js
const r = parseInt(hex.slice(1, 3), 16);
const g = parseInt(hex.slice(3, 5), 16);
const b = parseInt(hex.slice(5, 7), 16);
const rgba = `rgba(${r}, ${g}, ${b}, ${opacity})`;
```

```js
bard-sidenav, gemini-sidenav, input-area-v2, input-area-v3, input-area-v4,
.user-query-bubble-with-background {
  background-color: ${rgba} !important;
}
```
**為什麼用這些 tag？** 註解寫得很清楚：用 class 像 `.input-area` 太廣，會把整個對話包起來的外層 wrapper 也吃進去 → 半個畫面變成色塊。所以只挑 Gemini 自己的 custom element 標籤。

### 監聽 storage 變動（第 238–248 行）
```js
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (key in settings) settings[key] = newValue;
  }
  applySettings(); applyFont(); applyGlass();
});
```
Popup 一改設定，content script 立刻收到 → 不用 reload Gemini 頁面。

### 初始化（第 251–255 行）
```js
injectElements(); loadSettings(); startObserver();
console.log("[Gemini Wallpaper] Extension loaded.");
```
插入 DOM → 讀設定 → 開觀察者 → 在 console 印一行確認載入成功。

---

## 7. `content.css` 逐段解析

```css
#gemini-wallpaper-bg {
  position: fixed;
  top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 0;
  pointer-events: none;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  transition: opacity 0.4s ease;
}
```
**壁紙層**：
- `fixed` 全螢幕 → 跟著 viewport 而不是頁面捲動。
- `z-index: 0` 在最底層。
- `pointer-events: none` → **絕對不能擋滑鼠**，不然會點不到 Gemini。
- `background-size: cover` → 圖片自動填滿不變形。
- 0.4 秒 opacity 漸變 → 換壁紙時順滑。

```css
input-container,
input-container::before {
  background-color: transparent !important;
  background-image: none !important;
}
```
**註解寫的故事**：2026 Gemini 改版後，輸入列下方 113px 黑條怎麼擋都擋不掉。原來他們把 `#0f0f0f` 背景塞到 `input-container` 自己上面，連 `::before` 偽元素也要清掉。

```css
bard-sidenav, gemini-sidenav, input-area-v2, input-area-v3, input-area-v4,
.user-query-bubble-with-background {
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  transition: background-color 0.3s ease !important;
}
```
**玻璃材質的「毛玻璃模糊」是固定的 12 px**。顏色和透明度才從 `content.js` 動態設定。

```css
.blur-bg, .autosuggest-scrim {
  background-color: transparent !important;
}
```
這兩個是「鎖頻自動建議」遮罩用的暗層，直接讓它們透明。

```css
#gemini-wallpaper-overlay {
  position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 1;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.5);
}
```
**遮罩層**：z-index 1 在壁紙上面、UI 下面。預設 50% 透明黑色。

---

## 8. `popup.html` 逐段解析

> 設定面板。寬 320 px，深紫 (`#1a1a2e`) 配色，藍色強調 (`#4a7cff`)。

### 結構（簡化）
```
<body>
  <h1>🖼️ Gemini Wallpaper</h1>

  <!-- Enable / Pet / Drag 三個 toggle -->
  <div class="toggle-row">...</div> x3

  <!-- Chatbox Scale 滑桿 -->
  <!-- Pet Type 按鈕：🦆/🐶/🦊 -->
  <!-- 上傳區（drag-and-drop / 貼上）-->
  <!-- Image Quality 按鈕：Low/Medium/High/Original -->
  <!-- Latin Font 按鈕 -->
  <!-- 中文字體 按鈕 -->
  <!-- Glass Tint 取色器 + 透明度滑桿 -->
  <!-- Dim Overlay / Background Blur / Brightness 三個滑桿 -->

  <div class="btn-row">
    <button id="resetBtn">Reset</button>
    <button id="saveBtn">Apply</button>
  </div>
  <div class="status"></div>
  <script src="popup.js"></script>
</body>
```

### 關鍵 CSS 點

```css
body { width: 320px; ... }
```
**Chrome popup 寬度由 body 寬度決定**，沒這行會超寬或太窄。

```css
.switch input { display: none; }
.slider { ... border-radius: 22px; }
.slider::before { content: ''; ... border-radius: 50%; }
.switch input:checked + .slider { background: #4a7cff; }
.switch input:checked + .slider::before { transform: translateX(18px); }
```
**自製的 toggle switch**：藏住原生 checkbox，用 CSS 畫出膠囊 + 圓點，靠 `:checked` 偽類切換顏色和位置。

```css
input[type="file"] { display: none; }
```
沒用到原生檔案選擇器，全靠拖放和貼上（註解在 `popup.js` 有解釋為什麼）。

---

## 9. `popup.js` 逐段解析

### 開頭工具與 DOM 引用（第 1–48 行）
```js
const $ = (sel) => document.querySelector(sel);
```
jQuery 風格短手 — `$("#enableToggle")` 比 `document.querySelector(...)` 短。

接下來用 `$()` 抓所有控制元素，並設定四個品質預設：
```js
const QUALITY_PRESETS = {
  low:      { maxW: 1280, jpegQ: 0.75 },
  medium:   { maxW: 1920, jpegQ: 0.85 },
  high:     { maxW: 2560, jpegQ: 0.92 },
  original: null,
};
```
`null` 意思是「不壓縮，保留原檔（支援透明 / 動圖）」。其他三個會：縮到最大寬度 → 壓 JPEG。

```js
const fontBtns = document.querySelectorAll(".font-btn[data-group]");
```
**重要踩坑點**（註解 41–42 行）：寵物按鈕和品質按鈕和字型按鈕共用 `.font-btn` class（為了沿用樣式），但**只有字型按鈕有 `data-group`**。如果不限制 `[data-group]`，按寵物按鈕會把 `chatFont` 清掉。

### 載入設定（第 53–103 行）
```js
chrome.storage.local.get({ ...defaults }, (s) => {
  enableToggle.checked = s.enabled;
  ...
  if (s.imageData) {
    previewImg.src = s.imageData;
    previewImg.style.display = "block";
    uploadPlaceholder.style.display = "none";
    uploadArea.classList.add("has-image");
  }
  setActiveFont("latin", s.chatFont);
  setActiveFont("cjk", s.cjkFont);
  setActivePet(s.petType);
  setActiveQuality(s.imageQuality);
});
```
打開 popup 時把所有控制項調回上次設定的狀態。

### 寵物 / 拖曳 / 縮放（第 106–139 行）
這幾個都是即時生效（不用按 Apply）：
```js
petToggle.addEventListener("change", () => {
  chrome.storage.local.set({ petEnabled: petToggle.checked });
});
```
寫進 storage → `pet.js` 的 `onChanged` 立刻收到。

`setActivePet()` 同時負責「視覺選中態」與「上方標籤」：
```js
function setActivePet(type) {
  let matched = null;
  petBtns.forEach(btn => {
    const isMatch = btn.dataset.pet === type;
    btn.classList.toggle("selected", isMatch);
    if (isMatch) matched = btn;
  });
  if (petTypeVal) petTypeVal.textContent = matched?.textContent.trim() || "Duck";
}
```

### 圖片品質（第 142–161 行）
按下品質鈕**只是改 storage 內 `imageQuality`**，並提示「重新上傳才生效」（因為壓縮在上傳時做）。

### 上傳處理（第 163–246 行）

**重要設計選擇**（註解 165 行）：不用原生檔案選擇器，因為 Linux 上從擴充 popup 開 GTK 對話框會讓 Chrome 直接 crash。所以只支援拖放和 Ctrl+V。

`processFile()` 流程：
1. 不是圖片 → 提示退出。
2. > 15 MB → 拒絕（避免 base64 太肥塞爆 storage）。
3. 看品質設定：
   - `original` → 直接讀成 base64 data URL（保留原 byte，含透明 / GIF 動畫）。
   - 其他 → 用 `createImageBitmap()` + Canvas 縮圖 + `toDataURL("image/jpeg", q)` 壓縮。

```js
const scale = img.naturalWidth > preset.maxW ? preset.maxW / img.naturalWidth : 1;
```
只縮不放大。

```js
const bitmap = await createImageBitmap(file, {
  resizeWidth: w, resizeHeight: h, resizeQuality: "high"
});
```
`createImageBitmap` 是現代瀏覽器的高效解碼 API，比 `<img>` + Canvas drawImage 快很多。

```js
bitmap.close(); URL.revokeObjectURL(objectUrl);
```
釋放暫存資源 — 不釋放會記憶體洩漏。

#### 貼上事件
```js
document.addEventListener("paste", (e) => {
  const file = [...e.clipboardData.items]
    .find(item => item.type.startsWith("image/"))
    ?.asFile();
  if (file) processFile(file);
});
```
任何貼上事件都檢查 clipboard 是否含圖。`?.asFile()` 是 Safe optional chaining — 沒找到圖就 undefined。

### 滑桿即時更新 vs Apply（第 249–278 行）
```js
overlaySlider.addEventListener("input", () => {
  overlayVal.textContent = overlaySlider.value + "%";
});
```
這只更新「顯示文字」，**沒有寫入 storage**。所以拉滑桿不會即時改 Gemini，必須按 Apply。

```js
saveBtn.addEventListener("click", () => {
  const data = {
    enabled: enableToggle.checked,
    imageData: currentImageData,
    overlayOpacity: parseInt(overlaySlider.value) / 100,
    blur: parseInt(blurSlider.value),
    brightness: parseInt(brightnessSlider.value),
  };
  chrome.storage.local.set(data, () => {
    if (chrome.runtime.lastError) {
      showStatus("Save failed: " + chrome.runtime.lastError.message);
    } else {
      showStatus("Applied! Refresh Gemini if needed.");
    }
  });
});
```
按 Apply 才真正寫進 storage。檢查 `chrome.runtime.lastError`（Chrome API 失敗的通用錯誤位置）。

### Reset（第 281–302 行）
```js
chrome.storage.local.clear(() => { ... });
```
直接清空整個 storage（包含註解、書籤之類其他模組的資料），再把 UI 控制項都回到預設。

### 玻璃（第 305–312 行）
```js
glassOpacityEl.addEventListener("input", () => {
  glassOpacityVal.textContent = glassOpacityEl.value + "%";
  chrome.storage.local.set({ glassOpacity: parseInt(glassOpacityEl.value) });
});
```
**這個是即時的**（和 dim overlay 等不同）— 拉就生效，因為註解和玻璃顏色屬於探索性的視覺，需要即時預覽。

### 字型切換（第 315–331 行）
```js
function setActiveFont(group, font) {
  document.querySelectorAll(`.font-btn[data-group="${group}"]`).forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.font === font);
  });
  ...
}

fontBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const { font, group } = btn.dataset;
    setActiveFont(group, font);
    const key = group === "cjk" ? "cjkFont" : "chatFont";
    chrome.storage.local.set({ [key]: font });
  });
});
```
按下後馬上寫 storage → `content.js` 立即重抓 Google Fonts 並套用。

### `showStatus()`（第 334–340 行）
彈出底部訊息，2.5 秒淡出。

---

## 10. `pet.js` 逐段解析

### 圖片來源（第 9 行）
```js
const RAW = "https://raw.githubusercontent.com/tonybaloney/vscode-pets/master/media/";
```
用 vscode-pets 開源專案的 sprite GIF（8 fps 像素動畫）。直接從 GitHub raw 抓。

### 寵物資料表（第 12–28 行）
```js
const PETS = {
  duck: { folder: "rubber-duck", prefix: "yellow", hasLie: false },
  dog:  { folder: "dog",         prefix: "akita",  hasLie: true  },
  fox:  { folder: "fox",         prefix: "red",    hasLie: true  },
};
```
鴨子沒有「躺下」動畫 → fallback 到 idle。

```js
function gifsFor(type) {
  ...
  return {
    idle:  b + "idle_8fps.gif",
    walk:  b + "walk_8fps.gif",
    run:   b + "run_8fps.gif",
    swipe: b + "swipe_8fps.gif",
    lie:   p.hasLie ? b + "lie_8fps.gif" : b + "idle_8fps.gif",
  };
}
```
動態組 URL。

### 狀態定義（第 30–50 行）
```js
function statesFor(gifs) {
  return {
    idle:      { gif: ..., vx:  0,    flip: false, minMs: 1800, maxMs: 5000 },
    walkRight: { gif: ..., vx:  1.4,  flip: false, minMs: 2000, maxMs: 4500 },
    walkLeft:  { gif: ..., vx: -1.4,  flip: true,  ... },
    runRight:  { gif: ..., vx:  3.2,  flip: false, ... },
    runLeft:   { gif: ..., vx: -3.2,  flip: true,  ... },
    swipe:     { gif: ..., vx:  0, ... minMs: 1400, maxMs: 1400 },
    lie:       { gif: ..., vx:  0, ... },
  };
}
```
每個狀態定義：用哪張圖、水平速度（px/frame）、要不要鏡像（向左走的時候 flip）、持續時間範圍。

```js
const TRANSITIONS = {
  idle: [["idle", 2], ["walkRight", 3], ["walkLeft", 3], ...],
  ...
};
```
**狀態轉移的「加權機率」**：例如 idle 轉到 walkRight 的權重 3，轉到 swipe 的權重 0.5。`pick()` 依權重隨機選下一個。

### 運行時狀態（第 55–67 行）
全域變數記錄：是否啟用、當前寵物、當前狀態、座標、計時器等。

### `bottomOffset()`（第 79–92 行）
```js
const selectors = [
  "input-container", "input-area-v2", "input-area-v3", "input-area-v4",
  ".input-area", ".input-area-container",
];
for (const sel of selectors) {
  for (const el of document.querySelectorAll(sel)) {
    const rect = el.getBoundingClientRect();
    if (rect.height > 0 && rect.top > window.innerHeight * 0.7)
      return window.innerHeight - rect.top + 10;
  }
}
return 120;
```
**目的**：寵物要走在輸入列上方 10 px。
**邏輯**：找畫面下方 70% 以下、可見的輸入框元素，計算它的 top → 寵物的 `bottom` 距離。找不到就退回 120 px。

### `enterState()`（第 95–106 行）
```js
if ((name === "walkRight" || name === "runRight") && posX >= maxX() * 0.95)
  name = name.replace("Right", "Left");
if ((name === "walkLeft" || name === "runLeft") && posX <= 4)
  name = name.replace("Left", "Right");
```
**到牆了就轉向**。
然後設定狀態 + 隨機持續時間 + 換 GIF + 翻轉。

### `tick()`（第 109–130 行）— 動畫主循環
```js
animId = requestAnimationFrame(tick);
const dt = lastNow ? Math.min(now - lastNow, 100) : 16;
```
時間差最多 100 ms（避免分頁背景化後跳回來爆衝）。

```js
bottomRefreshTimer += dt;
if (bottomRefreshTimer >= 2000) {
  bottomRefreshTimer = 0;
  petEl.style.bottom = bottomOffset() + "px";
}
```
**每 2 秒重算一次底部** — Gemini 輸入框會展開縮回，但每 frame 重算太貴。

```js
stateMs -= dt;
if (stateMs <= 0) enterState(pick(TRANSITIONS[state] || TRANSITIONS.idle));
```
時間到 → 換狀態。

```js
posX += STATES[state].vx * (dt / 16);
if (posX < 0)      { posX = 0;      enterState(...); }
if (posX > maxX()) { posX = maxX(); enterState(...); }
petEl.style.left = Math.round(posX) + "px";
```
位置更新 + 撞牆處理 + 寫回 DOM（用 `left`，因為已經是 `position: fixed`）。

### `createPet()`（第 133–163 行）
動態建一個 `<div><img/></div>`，套上 inline styles（80×80、`fixed`、`zIndex: 9998`、`pointer-events: none`）。`image-rendering: pixelated` 保持像素風不模糊。

### `start/stop/applyEnabled/applyType`（第 165–193 行）
標準的「初始化 / 清除 / 換寵物時重啟」流程。

### 初始化 + listener（第 196–205 行）
讀儲存 → 套用。監聽 `petType` 和 `petEnabled` 變動。

---

## 11. `annotations.js` 逐段解析

> 在 AI 回覆上拖文字 → 跳浮動工具列 → 上色/底線/移除。

### 顏色列表（第 18–25 行）
6 色：黃、綠、紅、藍、紫、橘。Tailwind 風格的柔和色。

### `save()`（第 29 行）
所有標註存到 `chrome.storage.local` 的 `gwpAnnotations` key。

### `applyStyle()`（第 32–49 行）
螢光筆 → 淺色底色 + 深字 + 圓角 + 小 padding。
底線 → 透明底 + 藍色雙底線。

### `modelAncestor()`（第 52–62 行）
往上找最近的「AI 回覆容器」（限定在這些 tag 才能標註，避免使用者選自己問題也被標）。

### `charOffset()` 與 `rangeFromOffset()`（第 65–92 行）
**關鍵核心**：把 DOM Range 與「字元偏移量」互轉。
- `charOffset(root, node, offset)` → 在 `root.textContent` 裡的第幾個字。
- `rangeFromOffset(root, start, len)` → 從第 start 字長 len 字，重建 Range。

為什麼要這樣？DOM 節點隨 SPA 重組會失效，但「文字內容中的字元偏移」相對穩定，再加上前後文比對就能還原標註。

### `wrapRangeInSpans()`（第 100–132 行）— 全檔最關鍵
**註解寫了完整故事**：跨多個元素的選取（例如選了兩段段落），用 `range.surroundContents()` 會丟 `HierarchyRequestError`，用 `extractContents` 又會搞爛 DOM。

策略：把選取範圍**拆成每個 text node 一段**，每段各用一個 span 包起來（同一個 annId 共用）。
```js
while ((node = walker.nextNode())) {
  if (!inRange) {
    if (node === range.startContainer) inRange = true;
    else continue;
  }
  const start = (node === range.startContainer) ? range.startOffset : 0;
  const end   = (node === range.endContainer)   ? range.endOffset   : node.textContent.length;
  if (start < end) segments.push({ node, start, end });
  if (node === range.endContainer) break;
}
```
**先收集所有片段再動 DOM** — 因為 surroundContents 會分裂 text node，後面的引用會失效。

```js
for (const { node, start, end } of segments) {
  const nr = document.createRange();
  nr.setStart(node, start);
  nr.setEnd(node, end);
  const span = makeSpan();
  nr.surroundContents(span); // 單一 text node 一定安全
  spans.push(span);
}
```
單一 text node 範圍內 surroundContents 一定成功。

### 工具列（第 144–211 行）
建立一個浮動 toolbar（fixed、高 z-index、毛玻璃背景）：
- 6 個彩色圓圈鈕 → 螢光筆
- 一個 "U" 鈕 → 底線
- 一個 "✕" 鈕 → 移除

```js
bar.addEventListener("mousedown", e => e.preventDefault());
```
**踩坑點**：滑鼠按下 toolbar 會讓 selection 消失。`preventDefault` 阻止。

### `showToolbar(x, y)`（第 213–224 行）
顯示在滑鼠位置上方 52 px，但會 clamp 到視窗內。

### `applyAnnotation()`（第 234–277 行）
1. 找回 AI 回覆容器。
2. **重要**：用 `container.textContent` 算偏移，**不是用 `range.toString()`**。理由（註解 240–242）：`range.toString()` 在跨區塊元素時會加 `\n`，導致比對失敗。
3. 算偏移、切出 selectedText。
4. 生成 UUID。
5. 用 `wrapRangeInSpans` 包起來。
6. 清掉選取。
7. 存到 `annotations` 陣列：包含 URL、選取的文字、**前 30 字 / 後 30 字 context**（用來重新定位）、類型、顏色。

### `removeAnnotation()`（第 279–295 行）
找出所有同 annId 的 span（多行標註會有多個），把內容 unwrap 出來，移除 span。

### `restoreOne()` 還原（第 298–326 行）
- 只還原同一個 URL 的。
- 防重：已經有同 id 就跳過。
- 在容器內搜 `contextBefore + selectedText + contextAfter` 的完整 pattern。**用 pattern 而不是只搜 selectedText**：因為同樣字串可能出現多次，加上下文唯一性才高。
- 找到位置 → 用 `rangeFromOffset` 建 Range → 重新 wrap。

### 事件處理（第 333–365 行）
- `mouseup`：有選文字 → 顯 toolbar；沒選但點到 annotation → 顯 toolbar（移除模式）。
- `mousedown` 在 toolbar 外 → 收掉。

### SPA 偵測（第 368–381 行）
- MutationObserver debounce 350 ms 重跑 `restoreAll`。
- 每 500 ms 比對 `location.href`（SPA 路由變化沒有 popstate）→ 換頁延遲 700 ms 再 restore（等 Gemini 渲染完）。

---

## 12. `math.js` 逐段解析

### `MATH_RE`（第 15 行）
```js
const MATH_RE = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\s][^$\n]*?)\$/g;
```
四種 LaTeX 寫法：
- `\[...\]` 區塊
- `\(...\)` 行內
- `$$...$$` 區塊
- `$...$` 行內（要求第一個字不是 `$` 或空白，避免誤抓 `$50`）

捕獲群組 1/2/3/4 對應四種，後面用 `m[1] ?? m[2] ?? m[3] ?? m[4]` 取出實際 LaTeX。

### `fixMath()`（第 21–75 行）
```js
const katex = window.katex;
if (!katex) return -1;
```
**重要**：KaTeX 是 Gemini 自己已經載入的全域物件。我們不自己載，省流量也避免版本衝突。

```js
const filter = {
  acceptNode(node) {
    if (node.parentElement?.closest(".katex, code, pre, script, style, [data-gwp-math]"))
      return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  },
};
```
**跳過已渲染的數學、程式碼區、自己渲染過的**。
特別注意 `[data-gwp-math]`：我們渲染後的 span 會加這個屬性，防止重複處理。

```js
const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, filter);
const nodes = [];
while ((n = walker.nextNode())) nodes.push(n);
```
**先收集，再處理** — 邊走邊改會破壞 walker。

```js
while ((m = MATH_RE.exec(text)) !== null) {
  if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
  const latex = m[1] ?? m[2] ?? m[3] ?? m[4];
  const displayMode = m[0].startsWith("\\[") || m[0].startsWith("$$");
  ...
  katex.render(latex, wrap, { throwOnError: false, displayMode });
  ...
}
```
用 documentFragment 拼接「未匹配文字 + 渲染後的 span」，最後一次 `replaceChild` 取代原 text node。

### `addButton()`（第 78–127 行）
- 看到 `position: static` 改成 `relative`（因為按鈕要絕對定位）。
- 26×26 半透明深色圓角按鈕，符號 `∑`。
- hover 才顯示（`opacity: 0` → `1`）。
- 點下去呼叫 `fixMath`：
  - 回 -1 → 顯示 ✕ + 紅色 + "KaTeX not ready"
  - 回 0 → 顯示 ✓ + 藍色 + "No unrendered math"
  - 回 >0 → 顯示 ✓N + 綠色 + "Fixed N formula(s)"
- 2.2 秒後恢復原樣。

### `addKatexCopy()`（第 130–146 行）
為「已渲染的」KaTeX 元素加上「點擊複製原始 LaTeX」功能：
```js
const ann = el.querySelector('annotation[encoding="application/x-tex"]');
navigator.clipboard.writeText(ann.textContent.trim()).then(...);
```
KaTeX 在 MathML 模式下會在 `.katex` 內塞一個 `<annotation>` 標籤包原始 LaTeX → 直接抓來複製。
複製成功 → 短暫綠色邊框閃爍。

### 週期掃描（第 149–164 行）
MutationObserver debounce 450 ms，新對話訊息出現就掛上 `∑` 鈕。

---

## 13. `chatbox-drag.js` 逐段解析

> 最複雜的模組。詳細註解在檔案最前面。

### 設計概念（檔頭註解）
1. **拖曳** 用 CSS `transform: translate()` — 不會 reflow。
2. **果凍變形**：速度驅動 `skewX` + `scale` 變形，停下會彈回。
3. **撞牆 morph**：聊天框中心碰到視窗左右邊界後，「鎖在牆上」並依滑鼠超出量縮放。
4. **體積守恆的擠壓**：scale 寬度 → `H/W`，scale 高度 → `W/H`。原本扁長膠囊 → 細長垂直條。
5. **變形時的子元素淡出**：因為子元素被 scale 拉得很醜，就直接 `opacity: 0`。
6. **放開不彈回**：morphT 在 mouseup 時「鎖住」當下值。要解鎖再抓一次往反方向拉。
7. **雙擊 handle 重置**。
8. **任何空白處都能拖**（除了 input、按鈕等互動元素）。

### 物理參數（第 79–86 行）
```js
const STIFFNESS = 0.20;     // 彈簧強度
const DAMPING   = 0.65;     // 阻尼
const K_SKEW    = 14;       // skew 對速度的響應
const K_STRETCH = 0.18;     // 拉伸對速度的響應
const VEL_CLAMP = 1.5;      // 速度上限
const MORPH_FULL_PX   = 140;  // 滑鼠超出牆 140 px → morphT = 1
const MORPH_CORNER_PX = 26;   // morph 時可見的圓角半徑
const CONTENT_FADE_K  = 3.5;  // 內容淡出速度（morphT * 3.5 = 隱藏程度）
```

### `setChildOpacity()` 快取（第 95–102 行）
```js
let lastChildOpacity = -1;
function setChildOpacity(o) {
  if (Math.abs(o - lastChildOpacity) < 0.01) return;
  lastChildOpacity = o;
  ...
}
```
**60 fps 下不可以每 frame 都動 DOM**。差異小於 0.01 就跳過。

### `findChatbox()`（第 105–112 行）
按優先順序找選擇器，回第一個「可見」（高度 > 0）的。Gemini 在零狀態頁面上會有空的 `input-container` 不能拿。

### `captureRest()`（第 114–128 行）
```js
if (!chatbox || dragging) return;
const saved = chatbox.style.transform;
chatbox.style.transform = "";
void chatbox.offsetHeight; // force reflow
const r = chatbox.getBoundingClientRect();
```
**為什麼這樣？** 要量「沒套 transform 的原始位置與大小」：
1. 把 transform 清空。
2. 強制 reflow（`void chatbox.offsetHeight` 是常見技巧 — 讀任何 layout 屬性都會觸發 reflow）。
3. `getBoundingClientRect()` 取真實位置。
4. 還原 transform。

`if (dragging) return` 是必要的鎖 — 拖到一半重新測量會把計算基準弄壞。

### Handle（第 131–189 行）
頂部 52×12 的藍色小條，dblclick 重置。位置邏輯（`positionHandle`）特別處理 morph：
```js
const halfRestW = (restWidth / 2) * userScale;
const halfRestH = (restHeight / 2) * userScale;
const halfVisibleW = halfRestW + morphT * (halfRestH - halfRestW);
const halfVisibleH = halfRestH + morphT * (halfRestW - halfRestH);

if (morphSide === "right" && morphT > 0) cx = window.innerWidth - halfVisibleW;
else if (morphSide === "left" && morphT > 0) cx = halfVisibleW;
else cx = restCenterX + translateX;
```
變形時可見尺寸從 `halfRestW` 線性插值到 `halfRestH`（高度反之）。Handle 跟著「視覺中心」。

### `applyTransform()`（第 201–253 行） — 視覺核心

#### Identity 路徑
若沒任何變形 → 完全清空 inline style 還給瀏覽器（避免一直留著 `transform: ...` 干擾 Angular）。

#### Morph 路徑
```js
const aspect = restHeight / restWidth;   // 扁長膠囊：aspect << 1
const sx = userScale * (1 + morphT * (aspect    - 1));   // morphT=1 → sx = userScale*aspect
const sy = userScale * (1 + morphT * (1/aspect  - 1));   // morphT=1 → sy = userScale/aspect
```
**體積守恆的擠壓**：sx × sy 在所有 morphT 下乘起來 ≈ userScale²。

```js
const originX = morphSide === "right" ? "100%" : "0%";
```
變形原點 = 撞到的牆那邊 → 視覺上膠囊朝牆「擠進去」。

```js
const rx = MORPH_CORNER_PX / Math.max(sx, 0.001);
const ry = MORPH_CORNER_PX / Math.max(sy, 0.001);
chatbox.style.borderRadius = `${rx}px / ${ry}px`;
```
**圓角補償**：scale 會把圓角也拉變形。先把 border-radius 設成「被 scale 拉完後剛好 = 26 px」的值。瀏覽器會自動 clamp 到邊長一半，所以巨大 radius 就變成完美藥丸狀。

```js
setChildOpacity(clamp(1 - morphT * CONTENT_FADE_K, 0, 1));
```
0.29 約等於 fully faded。

#### Free drag 路徑
```js
chatbox.style.transform = 
  `translate(${tx}px, ${ty}px) scale(${sx}, ${sy}) skewX(${defSkewX}deg)`;
chatbox.style.transformOrigin = "center center";
```
平移 + 拉伸 + skew，原點居中。

### `updateWallPressureAndClamp()`（第 265–297 行）— 撞牆邏輯

```js
const desiredCx = restCenterX + desiredTX;
const overflowLeft  = (halfRestW) - desiredCx;
const overflowRight = desiredCx - (window.innerWidth - halfRestW);

if (overflowRight > 0 && overflowRight >= overflowLeft) {
  morphSide = "right";
  morphT    = clamp(overflowRight / MORPH_FULL_PX, 0, 1);
  translateX = (window.innerWidth - halfRestW) - restCenterX;
} else if (overflowLeft > 0) {
  morphSide = "left";
  morphT    = clamp(overflowLeft / MORPH_FULL_PX, 0, 1);
  translateX = halfRestW - restCenterX;
} else {
  morphSide = "none";
  morphT    = 0;
  translateX = clamp(desiredTX, ...);
}
```

**邏輯**：
- 計算「中心想去的位置」是否超出牆。
- 超出右牆 → 鎖中心到「貼右牆」位置，morphT 依超出多少漸增。
- 超出左牆 → 鎖左牆。
- 都沒超 → 自由拖曳，morphT 立刻歸 0。

Y 軸沒 morph，只 clamp 在視窗內。

### `startDrag()`（第 300–332 行）
```js
const morphOvershoot = morphT * MORPH_FULL_PX *
  (morphSide === "right" ? 1 : morphSide === "left" ? -1 : 0);
dragStartTX = translateX + morphOvershoot;
```
**重要踩坑**：如果是「已經 morph 黏在牆上」再抓，translateX 已鎖在牆位置；沒有這個 offset，第一個 mousemove 會讓 desiredCx 算出在牆位置 → morphT 瞬間歸零（看起來像 morph 突然消失）。加上虛擬 overshoot → 第一動是「從目前 morphT」開始 scrub。

### `onMouseMove()`（第 334–350 行）
```js
velX = velX * 0.5 + (dx / dt) * 0.5;
```
EMA（指數平均）平滑速度 — 不平滑的話 skew/stretch 會抖。

```js
const desiredTX = dragStartTX + (e.clientX - dragStartX);
updateWallPressureAndClamp(desiredTX, desiredTY);
```
標準「拖動位移」算法 + 撞牆。

### `endDrag()`（第 352–360 行）
不重設 morphT（讓它「鎖住」），等下次拖才解開。

### `isInteractiveTarget()`（第 373–379 行）
列出所有「互動元素」的 selector → 點到這些就讓 Gemini 自己處理（不劫持輸入和按鈕）。

### `tick()`（第 388–440 行）
動畫主循環：
```js
let targetSkewX = 0, targetStretchX = 0, targetStretchY = 0;
if (dragging && morphT === 0) {
  ...
  targetSkewX = vx * K_SKEW;
  targetStretchX = Math.abs(vx) * K_STRETCH - Math.abs(vy) * (K_STRETCH * 0.5);
  ...
}
```
**只在自由拖曳時算速度變形**。Morph 中不疊加（不然會雙重變形看起來髒）。

```js
defSkewVX += (targetSkewX - defSkewX) * STIFFNESS;
defSkewVX *= DAMPING;
defSkewX  += defSkewVX;
```
標準 Hooke's law 阻尼彈簧。彈簧朝 target 推進，每幀加阻尼。

```js
const stillMoving = dragging || ...;
if (stillMoving) animId = requestAnimationFrame(tick);
else { ...; animId = null; }
```
**動畫結束才停 RAF** 省 CPU。

### `rebind()` / `ensureChatbox()`（第 443–482 行）
Gemini SPA 換頁/重組 → 重新綁定。`if (dragging) return` 避免拖到一半被 rebind 干擾。

### `enable() / disable()`（第 489–526 行）
標準「掛事件 / 拆事件 / 還原 transform」流程。

### 初始化（第 535–557 行）
讀儲存 → 套用。監聽 `chatboxDraggable` 與 `chatboxScale`。

---

## 14. 模組間共用的設計慣例

逐檔比較會發現幾個一致的模式：

| 模式 | 用在哪 | 原因 |
|------|-------|------|
| IIFE `(function(){...})()` | 全部 content scripts | 不污染全域、不互撞 |
| `"use strict"` | 全部 | 嚴格模式，錯誤明顯 |
| `MutationObserver` + `setTimeout` debounce | content / pet / annotations / math | Gemini SPA 一震動就一堆 mutation |
| 讀 `chrome.storage.local.get(defaults, cb)` | 全部 | 把預設值當第一個參數 = 缺 key 用 default |
| `chrome.storage.onChanged` listener | 全部 | popup 寫入 → 即時生效 |
| `console.log("[Gemini Wallpaper] xxx loaded.")` | 全部 | 在 console 看哪個模組成功載入 |
| 用 custom element tag 作 selector | content / drag | Gemini class 名稱會變、tag 較穩 |

---

## 15. 資料儲存 schema

存在 `chrome.storage.local` 的 key：

| Key | 型別 | 預設 | 由誰寫 | 由誰讀 |
|------|------|------|--------|--------|
| `enabled` | boolean | true | popup | content |
| `imageData` | string (base64 dataURL) | "" | popup | content |
| `imageQuality` | "low"\|"medium"\|"high"\|"original" | "medium" | popup | popup（只在上傳時用） |
| `overlayOpacity` | number 0–1 | 0.5 | popup | content |
| `blur` | number 0–20 | 0 | popup | content |
| `brightness` | number 20–150 | 100 | popup | content |
| `chatFont` | string | "" | popup | content |
| `cjkFont` | string | "" | popup | content |
| `glassColor` | hex string | "#000000" | popup | content |
| `glassOpacity` | number 0–100 | 45 | popup | content |
| `petEnabled` | boolean | false | popup | pet |
| `petType` | "duck"\|"dog"\|"fox" | "duck" | popup | pet |
| `chatboxDraggable` | boolean | false | popup | chatbox-drag |
| `chatboxScale` | number 50–150 | 100 | popup | chatbox-drag |
| `gwpAnnotations` | Array of `{id, url, selectedText, contextBefore, contextAfter, type, color}` | [] | annotations | annotations |

---

## 16. 常見問題排除

### 壁紙看不見
1. F12 → 看 console 有沒有 `[Gemini Wallpaper] Extension loaded.`
2. 沒有 → manifest 或注入失敗，重新載入擴充。
3. 有 → 檢查 `#gemini-wallpaper-bg` 有沒有出現在 DOM。
4. 出現了但被擋 → 用 Inspect 看哪個元素 z-index 高、背景純色，加進 `TRANSPARENT_TARGETS`。

### 字型沒套用
- 看 `<head>` 有沒有 `<link id="gwp-font-link">` 和 `<style id="gwp-font-style">`。
- 沒有 → 字型沒選或選錯。
- 有 → 看選擇器是否還能命中 Gemini 的訊息元素。

### 圖示變成英文字（"send" / "menu"）
- 字型選擇器太廣，把 `<mat-icon>` 也吃進去。
- 確認 `applyFont()` 的 `notIcon` 選擇器還在。

### 標註消失
- Gemini 換頁時清空 DOM。`setInterval` 500 ms + 700 ms 延遲 restore，可能太短。延長重試。
- 對話內容變動（編輯訊息）→ context 比對失敗。目前無解，標註會孤立。

### 拖曳跳動
- `captureRest()` 被在拖曳中觸發了 → 看 `dragging` 變數是否正確管理。

---

## 結語

這個專案的核心難題不在每個個別功能（壁紙、字型、桌寵都不複雜），而在「**和 Gemini SPA 共存**」：
- Class 名稱會變 → 用 tag 和廣義選擇器。
- DOM 會重組 → MutationObserver + debounce。
- Style 會被 Angular 覆寫 → `!important`。
- 設定要即時生效 → `chrome.storage.onChanged` 串接每個模組。

每個註解後面都藏著一次踩坑的故事（例如 `input-container::before` 的黑條、跨段標註的 `surroundContents` 錯誤、字型蓋到 icon 字型）。讀懂這些註解，等於讀懂這個專案的歷史。
