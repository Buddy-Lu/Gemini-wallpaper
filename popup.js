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
const dragToggle      = $("#dragToggle");
const chatboxScaleSlider = $("#chatboxScaleSlider");
const chatboxScaleVal    = $("#chatboxScaleVal");
const petTypeVal      = $("#petTypeVal");
const petBtns         = document.querySelectorAll(".font-btn[data-pet]");
const qualityVal      = $("#qualityVal");
const qualityBtns     = document.querySelectorAll(".font-btn[data-quality]");

// Image quality presets — applied at upload time
const QUALITY_PRESETS = {
  low:      { maxW: 1280, jpegQ: 0.75 },
  medium:   { maxW: 1920, jpegQ: 0.85 },
  high:     { maxW: 2560, jpegQ: 0.92 },
  original: null, // raw file bytes, no re-encode
};
let currentQuality = "medium";
const saveBtn         = $("#saveBtn");
const resetBtn        = $("#resetBtn");
const statusEl        = $("#status");
// Scoped to font buttons only — pet/quality buttons share the .font-btn class
// for styling but must NOT trigger the font handler (would clobber chatFont).
const fontBtns        = document.querySelectorAll(".font-btn[data-group]");
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
    petType: "duck",
    chatboxDraggable: false,
    chatboxScale: 100,
    imageQuality: "medium",
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
    dragToggle.checked = s.chatboxDraggable;
    chatboxScaleSlider.value = s.chatboxScale;
    chatboxScaleVal.textContent = s.chatboxScale + "%";
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
    setActivePet(s.petType);
    setActiveQuality(s.imageQuality);
  }
);

// ── Pet toggle ───────────────────────────────────────────────
petToggle.addEventListener("change", () => {
  chrome.storage.local.set({ petEnabled: petToggle.checked });
});

// ── Draggable chatbox toggle ────────────────────────────────
dragToggle.addEventListener("change", () => {
  chrome.storage.local.set({ chatboxDraggable: dragToggle.checked });
});

// ── Chatbox scale slider ────────────────────────────────────
chatboxScaleSlider.addEventListener("input", () => {
  const v = parseInt(chatboxScaleSlider.value);
  chatboxScaleVal.textContent = v + "%";
  chrome.storage.local.set({ chatboxScale: v });
});

// ── Pet type picker ─────────────────────────────────────────
function setActivePet(type) {
  let matched = null;
  petBtns.forEach(btn => {
    const isMatch = btn.dataset.pet === type;
    btn.classList.toggle("selected", isMatch);
    if (isMatch) matched = btn;
  });
  if (petTypeVal) petTypeVal.textContent = matched?.textContent.trim() || "Duck";
}

petBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const type = btn.dataset.pet;
    setActivePet(type);
    chrome.storage.local.set({ petType: type });
  });
});

// ── Image quality picker ────────────────────────────────────
function setActiveQuality(q) {
  if (!QUALITY_PRESETS.hasOwnProperty(q)) q = "medium";
  currentQuality = q;
  let matched = null;
  qualityBtns.forEach(btn => {
    const isMatch = btn.dataset.quality === q;
    btn.classList.toggle("selected", isMatch);
    if (isMatch) matched = btn;
  });
  if (qualityVal) qualityVal.textContent = matched?.textContent.trim() || "Medium";
}

qualityBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    const q = btn.dataset.quality;
    setActiveQuality(q);
    chrome.storage.local.set({ imageQuality: q });
    showStatus("Quality set — re-upload to apply");
  });
});

// ── Image upload (drag & drop + clipboard paste) ────────────
// Avoids any native file picker dialog — on Linux, opening GTK file
// dialogs from an extension popup crashes Chrome regardless of the API used.

function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(file);
  });
}

async function processFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    showStatus("Not an image file.");
    return;
  }
  if (file.size > 15 * 1024 * 1024) {
    showStatus("File too large — please use an image under 15 MB.");
    return;
  }

  const preset = QUALITY_PRESETS[currentQuality] ?? QUALITY_PRESETS.medium;

  try {
    if (preset === null) {
      // Original: store raw file bytes, preserves transparency / animation
      currentImageData = await readFileAsDataURL(file);
    } else {
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = objectUrl; });

        const scale = img.naturalWidth > preset.maxW ? preset.maxW / img.naturalWidth : 1;
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);

        const bitmap = await createImageBitmap(file, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        bitmap.close();

        currentImageData = canvas.toDataURL("image/jpeg", preset.jpegQ);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    previewImg.src = currentImageData;
    previewImg.style.display = "block";
    uploadPlaceholder.style.display = "none";
    uploadArea.classList.add("has-image");
    showStatus("Image loaded — click Apply");
  } catch {
    showStatus("Error loading image — try a smaller file.");
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
    dragToggle.checked = false;
    chatboxScaleSlider.value = 100;
    chatboxScaleVal.textContent = "100%";
    previewImg.style.display = "none";
    uploadPlaceholder.style.display = "block";
    uploadArea.classList.remove("has-image");
    overlaySlider.value = 50;
    overlayVal.textContent = "50%";
    blurSlider.value = 0;
    blurVal.textContent = "0px";
    brightnessSlider.value = 100;
    brightnessVal.textContent = "100%";
    setActivePet("duck");
    setActiveQuality("medium");
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
