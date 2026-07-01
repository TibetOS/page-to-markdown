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

(async () => {
  render(await getEnabledFields());
  vaultEl.value = await getObsidianVault();
})();
