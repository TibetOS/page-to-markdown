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
  extracted: "Timestamp of when you extracted it.",
};

const fieldsEl = document.getElementById("fields");
const savedEl = document.getElementById("saved");
const vaultEl = document.getElementById("vault");
const webhookEl = document.getElementById("webhook");
const saveWebhookBtn = document.getElementById("saveWebhook");
const webhookStatusEl = document.getElementById("webhookStatus");

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

(async () => {
  render(await getEnabledFields());
  vaultEl.value = await getObsidianVault();
  webhookEl.value = await getWebhookUrl();
})();
