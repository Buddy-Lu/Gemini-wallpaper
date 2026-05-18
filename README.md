# Gemini Wallpaper — Chrome Extension

A Chrome extension that lets you set a custom background wallpaper on Google Gemini's web interface.

## Features
- Upload any image (JPG, PNG, WebP) as your Gemini background
- Adjustable dim overlay for text readability
- Background blur control
- Brightness adjustment
- Enable/disable toggle
- Settings persist across sessions

---

## Installation (Step-by-Step)

### 1. Download & unzip
Unzip `gemini-wallpaper-ext.zip` to a folder on your computer.

### 2. Open Chrome Extensions page
Navigate to `chrome://extensions/` in your Chrome browser.

### 3. Enable Developer Mode
Toggle the **Developer mode** switch in the top-right corner.

### 4. Load the extension
Click **"Load unpacked"** and select the `gemini-wallpaper-ext` folder.

### 5. Pin the extension
Click the puzzle-piece icon in Chrome's toolbar and pin **Gemini Wallpaper**.

### 6. Use it
1. Go to [gemini.google.com](https://gemini.google.com)
2. Click the Gemini Wallpaper icon in your toolbar
3. Upload a wallpaper image
4. Adjust overlay, blur, and brightness to your taste
5. Click **Apply**
6. If the background doesn't update immediately, refresh the Gemini tab

---

## How It Works

| File            | Purpose                                                     |
|-----------------|-------------------------------------------------------------|
| `manifest.json` | Declares the extension, permissions, and content scripts    |
| `content.js`    | Injected into Gemini — inserts wallpaper div, makes Gemini's own bg transparent |
| `content.css`   | Styles for the injected wallpaper and overlay elements      |
| `popup.html/js` | Settings popup — image upload, sliders, save to storage     |

The extension uses `chrome.storage.local` to persist your wallpaper (as a resized base64 JPEG) and settings between sessions.

---

## Customizing & Troubleshooting

### Wallpaper not showing?
Gemini's DOM structure may change. Open DevTools (`F12`), inspect the background elements, and update the `TRANSPARENT_TARGETS` array in `content.js` with the correct selectors.

### Class names changed?
Since Gemini uses obfuscated/hashed class names, they can change between deployments. The extension uses broad selectors (`main`, `[role='main']`, `mat-sidenav-*`) to be resilient, but you may need to update them.

### Want to add URL-based wallpapers?
Modify `popup.js` to accept a URL input instead of (or in addition to) file upload. Store the URL and set it as `backgroundImage` in `content.js`.

---

## License
MIT — do whatever you want with it.
