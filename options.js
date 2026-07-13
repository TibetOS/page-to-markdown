// Options page: toggle which front-matter fields are emitted. Settings live in
// chrome.storage.sync and are read back by shared.js#getEnabledFields.

// Localize static UI (dynamic strings below go through t()).
applyI18n();

const fieldsEl = document.getElementById("fields");
const savedEl = document.getElementById("saved");
const vaultEl = document.getElementById("vault");
const obsidianFolderEl = document.getElementById("obsidianFolder");
const obsidianDailyEl = document.getElementById("obsidianDaily");
const webhookEl = document.getElementById("webhook");
const saveWebhookBtn = document.getElementById("saveWebhook");
const webhookStatusEl = document.getElementById("webhookStatus");
const aiSummaryEl = document.getElementById("aiSummary");
const aiTagsEl = document.getElementById("aiTags");
const aiCleanupEl = document.getElementById("aiCleanup");
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
    // Field names are the literal YAML keys (never localized); only the
    // explanations are.
    label.querySelector(".desc").textContent = t(`fdesc_${key}`);

    row.append(input, label);
    fieldsEl.append(row);
  }
}

async function save() {
  const frontMatterFields = {};
  for (const key of FRONT_MATTER_FIELDS) {
    frontMatterFields[key] = document.getElementById(`f-${key}`).checked;
  }
  await chrome.storage.sync.set({
    frontMatterFields,
    obsidianVault: vaultEl.value.trim(),
    obsidianFolder: obsidianFolderEl.value.trim(),
    obsidianDaily: obsidianDailyEl.checked,
  });
  savedEl.textContent = t("savedFlash");
  clearTimeout(save._t);
  save._t = setTimeout(() => (savedEl.textContent = ""), 1500);
}

vaultEl.addEventListener("change", save);
obsidianFolderEl.addEventListener("change", save);
obsidianDailyEl.addEventListener("change", save);

// Saving the webhook needs its own button: chrome.permissions.request must run
// inside a user gesture, and we only ask for the webhook's own origin.
saveWebhookBtn.addEventListener("click", async () => {
  const raw = webhookEl.value;
  if (!raw.trim()) {
    await chrome.storage.sync.set({ webhookUrl: "" });
    webhookStatusEl.textContent = t("whCleared");
    return;
  }
  const normalized = normalizeWebhookUrl(raw);
  if (!normalized) {
    webhookStatusEl.textContent = t("whInvalid");
    return;
  }
  const origin = new URL(normalized).origin + "/*";
  try {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      webhookStatusEl.textContent = t("whDenied");
      return;
    }
    await chrome.storage.sync.set({ webhookUrl: normalized });
    webhookEl.value = normalized;
    webhookStatusEl.textContent = t("whSaved", new URL(normalized).origin);
  } catch (err) {
    webhookStatusEl.textContent = t("whFailed", err.message);
  }
});

// --- Per-site templates ---

function templateRow(tpl = { pattern: "", template: "" }) {
  const row = document.createElement("div");
  row.className = "tpl-row";

  const pattern = document.createElement("input");
  pattern.type = "text";
  pattern.className = "tpl-pattern";
  pattern.placeholder = t("phPattern");
  pattern.value = tpl.pattern || "";

  const remove = document.createElement("button");
  remove.className = "tpl-remove";
  remove.textContent = t("btnRemove");
  remove.addEventListener("click", () => {
    row.remove();
    saveTemplates();
  });

  const template = document.createElement("textarea");
  template.className = "tpl-body";
  template.placeholder = "{{frontmatter}}{{content}}";
  template.value = tpl.template || "";
  template.spellcheck = false;

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
  savedEl.textContent = t("savedFlash");
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

aiCleanupEl.addEventListener("change", async () => {
  await chrome.storage.sync.set({ aiCleanup: aiCleanupEl.checked });
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
    aiStatusEl.textContent = t("aiNotSupported");
    return;
  }
  try {
    const availability = await Summarizer.availability();
    if (availability === "available") {
      aiStatusEl.textContent = t("aiReady");
    } else if (availability === "downloading") {
      aiStatusEl.textContent = t("aiDownloading");
    } else if (availability === "downloadable") {
      aiStatusEl.textContent = t("aiNotInstalled");
      downloadModelBtn.hidden = false;
    } else {
      aiStatusEl.textContent = t("aiUnavailable");
    }
  } catch (err) {
    aiStatusEl.textContent = t("aiCheckFailed", err.message);
  }
}

// Explicit user-gesture download — we never fetch the model implicitly.
downloadModelBtn.addEventListener("click", async () => {
  downloadModelBtn.disabled = true;
  aiStatusEl.textContent = t("aiDlProgress", "0");
  try {
    const summarizer = await Summarizer.create({
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          // e.loaded is a 0–1 fraction in some Chrome versions and raw bytes
          // (with e.total set) in others — handle both.
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round((e.loaded || 0) * 100);
          aiStatusEl.textContent = t("aiDlProgress", String(percent));
        });
      },
    });
    summarizer.destroy?.();
    await refreshAiStatus();
  } catch (err) {
    aiStatusEl.textContent = t("aiDlFailed", err.message);
  } finally {
    downloadModelBtn.disabled = false;
  }
});

(async () => {
  render(await getEnabledFields());
  const obsidian = await getObsidianSettings();
  vaultEl.value = obsidian.vault;
  obsidianFolderEl.value = obsidian.folder;
  obsidianDailyEl.checked = obsidian.daily;
  webhookEl.value = await getWebhookUrl();
  aiSummaryEl.checked = await getAiSummaryEnabled();
  aiTagsEl.checked = await getAiTagsEnabled();
  aiCleanupEl.checked = await getAiCleanupEnabled();
  for (const tpl of await getTemplates()) templatesEl.append(templateRow(tpl));
  translateTargetEl.value = await getTranslateTarget();
  refreshAiStatus();
})();
