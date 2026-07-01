const mainView = document.getElementById("main");
const previewView = document.getElementById("preview");
const status = document.getElementById("status");

const downloadBtn = document.getElementById("download");
const copyBtn = document.getElementById("copy");
const copyAIBtn = document.getElementById("copyAI");
const previewBtn = document.getElementById("preview-btn");
const settingsBtn = document.getElementById("settings");

const editor = document.getElementById("editor");
const meta = document.getElementById("meta");
const downloadEditedBtn = document.getElementById("downloadEdited");
const copyEditedBtn = document.getElementById("copyEdited");
const copyAIEditedBtn = document.getElementById("copyAIEdited");
const backBtn = document.getElementById("back");

// Original labels, so we can restore them after a busy state.
const labels = new Map([
  [downloadBtn, "⬇ Extract .md"],
  [copyBtn, "📋 Copy Markdown"],
  [copyAIBtn, "✨ Copy for AI"],
  [previewBtn, "👁 Preview & edit"],
  [downloadEditedBtn, "⬇ Download"],
  [copyEditedBtn, "📋 Copy"],
  [copyAIEditedBtn, "✨ Copy for AI"],
]);
const allButtons = [...labels.keys(), backBtn];

// Metadata from the most recent extraction, used by the preview actions.
let current = { title: "page", url: "" };

// Run Readability + Turndown in the active tab and return { markdown, title, url }.
async function extract() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["lib/Readability.js", "lib/turndown.js", "content.js"],
  });

  const result = results?.[results.length - 1]?.result;
  if (!result?.success) {
    throw new Error(result?.error || "Extraction failed — page may not have article content.");
  }
  return { ...result, url: tab.url };
}

// toFilename / stripFrontMatter / stripImages / estimateTokens / buildLeanMarkdown
// live in shared.js (loaded before this script), shared with the service worker.

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for contexts where the async Clipboard API is unavailable.
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("Couldn't write to the clipboard.");
  }
}

function setBusy(busy, activeBtn, label) {
  allButtons.forEach((b) => (b.disabled = busy));
  if (busy) {
    status.textContent = "";
    status.className = "";
    if (activeBtn) activeBtn.textContent = label;
  } else {
    labels.forEach((text, btn) => (btn.textContent = text));
  }
}

function showError(err) {
  status.textContent = err.message;
  status.className = "error";
}

function showSuccess(msg) {
  status.textContent = msg;
  status.className = "success";
}

function downloadMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Direct one-click actions (main view) ---

downloadBtn.addEventListener("click", async () => {
  setBusy(true, downloadBtn, "Extracting...");
  try {
    const result = await extract();
    const markdown = assembleMarkdown(result, await getEnabledFields());
    const filename = toFilename(result.title);
    downloadMarkdown(markdown, filename);
    showSuccess(`Downloaded: ${filename}`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

copyBtn.addEventListener("click", async () => {
  setBusy(true, copyBtn, "Copying...");
  try {
    const result = await extract();
    const markdown = assembleMarkdown(result, await getEnabledFields());
    await copyToClipboard(markdown);
    showSuccess(`Copied — ~${estimateTokens(markdown).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

copyAIBtn.addEventListener("click", async () => {
  setBusy(true, copyAIBtn, "Copying...");
  try {
    const { body, title, url } = await extract();
    const lean = buildLeanMarkdown(body, title, url);
    await copyToClipboard(lean);
    showSuccess(`Copied for AI — ~${estimateTokens(lean).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

// --- Preview & edit ---

function updateMeta() {
  const text = editor.value;
  const words = (text.match(/\S+/g) || []).length;
  meta.textContent = `${words.toLocaleString()} words · ~${estimateTokens(text).toLocaleString()} tokens`;
}

// Debounce so the word/token count doesn't recompute on every keystroke
// (avoids typing jank on large articles).
function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function showPreview() {
  mainView.hidden = true;
  previewView.hidden = false;
  updateMeta();
  editor.focus();
}

previewBtn.addEventListener("click", async () => {
  setBusy(true, previewBtn, "Extracting...");
  try {
    const result = await extract();
    current = { title: result.title || "page", url: result.url || "" };
    editor.value = assembleMarkdown(result, await getEnabledFields());
    showPreview();
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

editor.addEventListener("input", debounce(updateMeta, 150));

backBtn.addEventListener("click", () => {
  previewView.hidden = true;
  mainView.hidden = false;
  status.textContent = "";
  status.className = "";
});

// Open the options page to choose which front-matter fields are included.
settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

// Preview actions operate on the (possibly edited) editor content.

downloadEditedBtn.addEventListener("click", () => {
  const filename = toFilename(current.title);
  downloadMarkdown(editor.value, filename);
  showSuccess(`Downloaded: ${filename}`);
});

copyEditedBtn.addEventListener("click", async () => {
  setBusy(true, copyEditedBtn, "Copying...");
  try {
    await copyToClipboard(editor.value);
    showSuccess(`Copied — ~${estimateTokens(editor.value).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

copyAIEditedBtn.addEventListener("click", async () => {
  setBusy(true, copyAIEditedBtn, "Copying...");
  try {
    const lean = buildLeanMarkdown(editor.value, current.title, current.url);
    await copyToClipboard(lean);
    showSuccess(`Copied for AI — ~${estimateTokens(lean).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});
