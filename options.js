// Options page: toggle which front-matter fields are emitted. Settings live in
// chrome.storage.sync and are read back by shared.js#getEnabledFields.

const DESCRIPTIONS = {
  title: "The article title.",
  author: "Byline / author, when detected.",
  source: "The page URL the content came from.",
  site: "Site or publication name.",
  published: "Original publish date, when available.",
  lang: "Content language (e.g. en, he).",
  excerpt: "A short summary/description of the page.",
  summary: "On-device AI TL;DR (only when enabled below and the model is installed).",
  tags: "On-device AI topic tags (only when enabled below and the model is installed).",
  extracted: "Timestamp of when you extracted it.",
};

const fieldsEl = document.getElementById("fields");
const savedEl = document.getElementById("saved");
const vaultEl = document.getElementById("vault");
const webhookEl = document.getElementById("webhook");
const saveWebhookBtn = document.getElementById("saveWebhook");
const webhookStatusEl = document.getElementById("webhookStatus");
const aiSummaryEl = document.getElementById("aiSummary");
const aiTagsEl = document.getElementById("aiTags");
const templatesEl = document.getElementById("templates");
const addTemplateBtn = document.getElementById("addTemplate");
const translateTargetEl = document.getElementById("translateTarget");
const aiStatusEl = document.getElementById("aiStatus");
const downloadModelBtn = document.getElementById("downloadModel");

function render(enabled) {
  fieldsEl.replaceChildren();
  for (const key of FRONT_MATTER_FIELDS) {
    const row = document.createElement("div");
    row.className = "field";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `f-${key}`;
    input.checked = enabled[key] !== false;
    input.addEventListener("change", save);

    const label = document.createElement("label");
    label.htmlFor = `f-${key}`;
    label.innerHTML = `<div class="name">${key}</div><div class="desc"></div>`;
    label.querySelector(".desc").textContent = DESCRIPTIONS[key] || "";

    row.append(input, label);
    fieldsEl.append(row);
  }
}

async function save() {
  const frontMatterFields = {};
  for (const key of FRONT_MATTER_FIELDS) {
    frontMatterFields[key] = document.getElementById(`f-${key}`).checked;
  }
  await chrome.storage.sync.set({ frontMatterFields, obsidianVault: vaultEl.value.trim() });
  savedEl.textContent = "Saved ✓";
  clearTimeout(save._t);
  save._t = setTimeout(() => (savedEl.textContent = ""), 1500);
}

vaultEl.addEventListener("change", save);

// Saving the webhook needs its own button: chrome.permissions.request must run
// inside a user gesture, and we only ask for the webhook's own origin.
saveWebhookBtn.addEventListener("click", async () => {
  const raw = webhookEl.value;
  if (!raw.trim()) {
    await chrome.storage.sync.set({ webhookUrl: "" });
    webhookStatusEl.textContent = "Webhook cleared.";
    return;
  }
  const normalized = normalizeWebhookUrl(raw);
  if (!normalized) {
    webhookStatusEl.textContent = "Invalid URL — must be https:// (or http://localhost).";
    return;
  }
  const origin = new URL(normalized).origin + "/*";
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      webhookStatusEl.textContent = "Permission declined — webhook not saved.";
      return;
    }
    await chrome.storage.sync.set({ webhookUrl: normalized });
    webhookEl.value = normalized;
    webhookStatusEl.textContent = "Saved ✓ — access granted for " + new URL(normalized).origin;
  } catch (err) {
    webhookStatusEl.textContent = "Couldn't save: " + err.message;
  }
});

// --- Per-site templates ---

function templateRow(tpl = { pattern: "", template: "" }) {
  const row = document.createElement("div");
  row.className = "tpl-row";
  row.style.cssText = "margin-bottom: 12px; padding: 10px; border: 1px solid #262640; border-radius: 8px;";

  const pattern = document.createElement("input");
  pattern.type = "text";
  pattern.className = "tpl-pattern";
  pattern.placeholder = "example.com or *";
  pattern.value = tpl.pattern || "";
  pattern.style.cssText =
    "width: 60%; padding: 6px 10px; border: 1px solid #333; border-radius: 6px; background: #0f0f1e; color: #e0e0e0; font-size: 13px;";

  const remove = document.createElement("button");
  remove.textContent = "Remove";
  remove.style.cssText =
    "float: right; padding: 6px 10px; border: none; border-radius: 6px; background: #7f1d1d; color: #fff; font-size: 12px; cursor: pointer;";
  remove.addEventListener("click", () => {
    row.remove();
    saveTemplates();
  });

  const template = document.createElement("textarea");
  template.className = "tpl-body";
  template.placeholder = "{{frontmatter}}{{content}}";
  template.value = tpl.template || "";
  template.spellcheck = false;
  template.style.cssText =
    "width: 100%; height: 90px; margin-top: 8px; padding: 8px 10px; border: 1px solid #333; border-radius: 6px; background: #0f0f1e; color: #e0e0e0; font-size: 12px; font-family: ui-monospace, Menlo, Consolas, monospace; resize: vertical;";

  pattern.addEventListener("change", saveTemplates);
  template.addEventListener("change", saveTemplates);

  row.append(pattern, remove, template);
  return row;
}

async function saveTemplates() {
  const templates = [...templatesEl.querySelectorAll(".tpl-row")]
    .map((row) => ({
      pattern: row.querySelector(".tpl-pattern").value.trim(),
      template: row.querySelector(".tpl-body").value,
    }))
    .filter((t) => t.pattern && t.template.trim());
  await chrome.storage.sync.set({ templates });
  flashSaved();
}

addTemplateBtn.addEventListener("click", () => {
  templatesEl.append(templateRow());
});

// --- On-device AI (Gemini Nano) ---

function flashSaved() {
  savedEl.textContent = "Saved ✓";
  // Share save._t so rapid toggles across settings don't race the indicator.
  clearTimeout(save._t);
  save._t = setTimeout(() => (savedEl.textContent = ""), 1500);
}

aiSummaryEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ aiSummary: aiSummaryEl.checked });
  flashSaved();
});

aiTagsEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ aiTags: aiTagsEl.checked });
  flashSaved();
});

translateTargetEl.addEventListener("change", async () => {
  const value = translateTargetEl.value.trim().toLowerCase();
  translateTargetEl.value = value;
  await chrome.storage.sync.set({ translateTarget: value });
  flashSaved();
});

async function refreshAiStatus() {
  downloadModelBtn.hidden = true;
  if (typeof Summarizer === "undefined") {
    aiStatusEl.textContent = "Not supported by this browser (needs Chrome 138+ with built-in AI).";
    return;
  }
  try {
    const availability = await Summarizer.availability();
    if (availability === "available") {
      aiStatusEl.textContent = "Model installed — summaries are ready. ✓";
    } else if (availability === "downloading") {
      aiStatusEl.textContent = "Model is downloading in the background…";
    } else if (availability === "downloadable") {
      aiStatusEl.textContent = "Model not installed (~a few GB, one-time).";
      downloadModelBtn.hidden = false;
    } else {
      aiStatusEl.textContent = "Unavailable on this device (insufficient storage/GPU).";
    }
  } catch (err) {
    aiStatusEl.textContent = "Couldn't check availability: " + err.message;
  }
}

// Explicit user-gesture download — we never fetch the model implicitly.
downloadModelBtn.addEventListener("click", async () => {
  downloadModelBtn.disabled = true;
  aiStatusEl.textContent = "Downloading model… 0%";
  try {
    const summarizer = await Summarizer.create({
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          // e.loaded is a 0–1 fraction in some Chrome versions and raw bytes
          // (with e.total set) in others — handle both.
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round((e.loaded || 0) * 100);
          aiStatusEl.textContent = `Downloading model… ${percent}%`;
        });
      },
    });
    summarizer.destroy?.();
    await refreshAiStatus();
  } catch (err) {
    aiStatusEl.textContent = "Download failed: " + err.message;
  } finally {
    downloadModelBtn.disabled = false;
  }
});

(async () => {
  render(await getEnabledFields());
  vaultEl.value = await getObsidianVault();
  webhookEl.value = await getWebhookUrl();
  aiSummaryEl.checked = await getAiSummaryEnabled();
  aiTagsEl.checked = await getAiTagsEnabled();
  for (const tpl of await getTemplates()) templatesEl.append(templateRow(tpl));
  translateTargetEl.value = await getTranslateTarget();
  refreshAiStatus();
})();
