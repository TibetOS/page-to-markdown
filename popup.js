const downloadBtn = document.getElementById("download");
const copyBtn = document.getElementById("copy");
const copyAIBtn = document.getElementById("copyAI");
const status = document.getElementById("status");

const buttons = [downloadBtn, copyBtn, copyAIBtn];

// Run Readability + Turndown in the active tab and return { markdown, title }.
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
  return result;
}

// Sanitize a title into a safe .md filename (keeps Hebrew chars too).
function toFilename(title) {
  return (
    title
      .replace(/[^a-zA-Z0-9֐-׿\s-]/g, "") // keep Hebrew chars too
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 80) + ".md"
  );
}

// Strip the leading YAML front-matter block — LLMs don't need it.
function stripFrontMatter(md) {
  return md.replace(/^---\n[\s\S]*?\n---\n+/, "");
}

// Drop image markdown — images cost tokens and rarely help text models.
function stripImages(md) {
  return md.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\n{3,}/g, "\n\n");
}

// Rough token estimate (~4 chars/token) — good enough to gauge context budget.
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

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
  buttons.forEach((b) => (b.disabled = busy));
  if (busy) {
    status.textContent = "";
    status.className = "";
    activeBtn.textContent = label;
  } else {
    downloadBtn.textContent = "⬇ Extract .md";
    copyBtn.textContent = "📋 Copy Markdown";
    copyAIBtn.textContent = "✨ Copy for AI";
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

// ⬇ Download the full Markdown (with front matter) as a .md file.
downloadBtn.addEventListener("click", async () => {
  setBusy(true, downloadBtn, "Extracting...");
  try {
    const { markdown, title } = await extract();
    const filename = toFilename(title);

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    showSuccess(`Downloaded: ${filename}`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

// 📋 Copy the full Markdown (with front matter) to the clipboard.
copyBtn.addEventListener("click", async () => {
  setBusy(true, copyBtn, "Copying...");
  try {
    const { markdown } = await extract();
    await copyToClipboard(markdown);
    showSuccess(`Copied — ~${estimateTokens(markdown).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

// ✨ Copy token-lean Markdown (no front matter, no images) for pasting into an AI chat.
copyAIBtn.addEventListener("click", async () => {
  setBusy(true, copyAIBtn, "Copying...");
  try {
    const { markdown, title } = await extract();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const body = stripImages(stripFrontMatter(markdown)).trim();
    // Keep a single source line so the model knows the provenance.
    const lean = `# ${title}\nSource: ${tab?.url || ""}\n\n${body}`;

    await copyToClipboard(lean);
    showSuccess(`Copied for AI — ~${estimateTokens(lean).toLocaleString()} tokens`);
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});
