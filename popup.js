/**
 * Gemini Wallpaper - Popup Script
 * 
 * Handles the settings UI: image upload, slider controls,
 * and persisting settings to chrome.storage.local.
 */

const $ = (sel) => document.querySelector(sel);

// DOM refs
const enableToggle    = $("#enableToggle");
const uploadArea      = $("#uploadArea");
const uploadPlaceholder = $("#uploadPlaceholder");
const previewImg      = $("#previewImg");
const overlaySlider   = $("#overlaySlider");
const overlayVal      = $("#overlayVal");
const blurSlider      = $("#blurSlider");
const blurVal         = $("#blurVal");
const brightnessSlider = $("#brightnessSlider");
const brightnessVal   = $("#brightnessVal");
const petToggle       = $("#petToggle");
const saveBtn         = $("#saveBtn");
const resetBtn        = $("#resetBtn");
const statusEl        = $("#status");
const fontBtns        = document.querySelectorAll(".font-btn");
const fontVal         = $("#fontVal");
const cjkFontVal      = $("#cjkFontVal");
const glassColorEl    = $("#glassColor");
const glassOpacityEl  = $("#glassOpacity");
const glassOpacityVal = $("#glassOpacityVal");

let currentImageData = "";

// ── Load saved settings ─────────────────────────────────────
chrome.storage.local.get(
  {
    enabled: true,
    petEnabled: false,
    imageData: "",
    overlayOpacity: 0.5,
    blur: 0,
    brightness: 100,
    chatFont: "",
    cjkFont: "",
    glassColor: "#000000",
    glassOpacity: 45,
  },
  (s) => {
    enableToggle.checked = s.enabled;
    petToggle.checked = s.petEnabled;
    currentImageData = s.imageData;

    overlaySlider.value = Math.round(s.overlayOpacity * 100);
    overlayVal.textContent = overlaySlider.value + "%";

    blurSlider.value = s.blur;
    blurVal.textContent = s.blur + "px";

    brightnessSlider.value = s.brightness;
    brightnessVal.textContent = s.brightness + "%";

    glassColorEl.value = s.glassColor;
    glassOpacityEl.value = s.glassOpacity;
    glassOpacityVal.textContent = s.glassOpacity + "%";

    if (s.imageData) {
      previewImg.src = s.imageData;
      previewImg.style.display = "block";
      uploadPlaceholder.style.display = "none";
      uploadArea.classList.add("has-image");
    }

    setActiveFont("latin", s.chatFont);
    setActiveFont("cjk", s.cjkFont);
  }
);

// ── Pet toggle ───────────────────────────────────────────────
petToggle.addEventListener("change", () => {
  chrome.storage.local.set({ petEnabled: petToggle.checked });
});

// ── Image upload (drag & drop + clipboard paste) ────────────
// Avoids any native file picker dialog — on Linux, opening GTK file
// dialogs from an extension popup crashes Chrome regardless of the API used.

async function processFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showStatus("Not an image file.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showStatus("File too large — please use an image under 15 MB.");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objectUrl; });

    const MAX_W = 1280;
    const scale = img.naturalWidth > MAX_W ? MAX_W / img.naturalWidth : 1;
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    const bitmap = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: "medium" });
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    bitmap.close();

    currentImageData = canvas.toDataURL("image/jpeg", 0.75);

    previewImg.src = currentImageData;
    previewImg.style.display = "block";
    uploadPlaceholder.style.display = "none";
    uploadArea.classList.add("has-image");
    showStatus("Image loaded — click Apply");
  } catch {
    showStatus("Error loading image — try a smaller file.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// Drag and drop
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("drag-over");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("drag-over");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

// Clipboard paste (Ctrl+V anywhere in the popup)
document.addEventListener("paste", (e) => {
  const file = [...e.clipboardData.items]
    .find(item => item.type.startsWith("image/"))
    ?.asFile();
  if (file) processFile(file);
});

// ── Slider live updates ─────────────────────────────────────
overlaySlider.addEventListener("input", () => {
  overlayVal.textContent = overlaySlider.value + "%";
});

blurSlider.addEventListener("input", () => {
  blurVal.textContent = blurSlider.value + "px";
});

brightnessSlider.addEventListener("input", () => {
  brightnessVal.textContent = brightnessSlider.value + "%";
});

// ── Save / Apply ────────────────────────────────────────────
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

// ── Reset ───────────────────────────────────────────────────
resetBtn.addEventListener("click", () => {
  chrome.storage.local.clear(() => {
    currentImageData = "";
    enableToggle.checked = true;
    petToggle.checked = false;
    previewImg.style.display = "none";
    uploadPlaceholder.style.display = "block";
    uploadArea.classList.remove("has-image");
    overlaySlider.value = 50;
    overlayVal.textContent = "50%";
    blurSlider.value = 0;
    blurVal.textContent = "0px";
    brightnessSlider.value = 100;
    brightnessVal.textContent = "100%";
    showStatus("Reset to defaults.");
  });
});

// ── Glass tint ───────────────────────────────────────────────
glassOpacityEl.addEventListener("input", () => {
  glassOpacityVal.textContent = glassOpacityEl.value + "%";
  chrome.storage.local.set({ glassOpacity: parseInt(glassOpacityEl.value) });
});

glassColorEl.addEventListener("input", () => {
  chrome.storage.local.set({ glassColor: glassColorEl.value });
});

// ── Font picker ─────────────────────────────────────────────
function setActiveFont(group, font) {
  document.querySelectorAll(`.font-btn[data-group="${group}"]`).forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.font === font);
  });
  const label = document.querySelector(`.font-btn[data-group="${group}"][data-font="${font}"]`)?.textContent;
  if (group === "latin") fontVal.textContent = label || "Default";
  if (group === "cjk")   cjkFontVal.textContent = label || "預設";
}

fontBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const { font, group } = btn.dataset;
    setActiveFont(group, font);
    const key = group === "cjk" ? "cjkFont" : "chatFont";
    chrome.storage.local.set({ [key]: font });
  });
});

// ── Status flash ────────────────────────────────────────────
function showStatus(msg) {
  statusEl.textContent = msg;
  statusEl.style.opacity = "1";
  setTimeout(() => {
    statusEl.style.opacity = "0";
  }, 2500);
}
