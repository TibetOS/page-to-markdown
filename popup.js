const mainView = document.getElementById("main");
const previewView = document.getElementById("preview");
const status = document.getElementById("status");

const downloadBtn = document.getElementById("download");
const copyBtn = document.getElementById("copy");
const copyAIBtn = document.getElementById("copyAI");
const obsidianBtn = document.getElementById("obsidian");
const webhookBtn = document.getElementById("webhook");
const batchBtn = document.getElementById("batch");
const previewBtn = document.getElementById("preview-btn");
const settingsBtn = document.getElementById("settings");

const editor = document.getElementById("editor");
const meta = document.getElementById("meta");
const downloadEditedBtn = document.getElementById("downloadEdited");
const copyEditedBtn = document.getElementById("copyEdited");
const copyAIEditedBtn = document.getElementById("copyAIEdited");
const translateBtn = document.getElementById("translate");
const cleanupBtn = document.getElementById("cleanup");
const ragBtn = document.getElementById("rag");
const csvBtn = document.getElementById("csv");
const reportBtn = document.getElementById("report");
const backBtn = document.getElementById("back");

// Original labels, so we can restore them after a busy state.
const labels = new Map([
  [downloadBtn, "⬇ Extract .md"],
  [copyBtn, "📋 Copy Markdown"],
  [copyAIBtn, "✨ Copy for AI"],
  [obsidianBtn, "🟣 Send to Obsidian"],
  [webhookBtn, "📤 Send to webhook"],
  [batchBtn, "🗂 Clip all tabs"],
  [previewBtn, "👁 Preview & edit"],
  [downloadEditedBtn, "⬇ Download"],
  [copyEditedBtn, "📋 Copy"],
  [copyAIEditedBtn, "✨ Copy for AI"],
  [translateBtn, "🌐 Translate"],
  [cleanupBtn, "🧹 Clean up"],
  [ragBtn, "🧩 RAG chunks"],
  [csvBtn, "📊 Tables → CSV"],
]);
const allButtons = [...labels.keys(), reportBtn, backBtn];

// Metadata from the most recent extraction, used by the preview actions.
let current = { title: "page", url: "" };

// The extraction pipeline injected into a tab, in dependency order.
const EXTRACT_FILES = ["lib/defuddle.js", "lib/Readability.js", "lib/turndown.js", "content.js"];

// Run the extraction pipeline in one tab; throws when nothing extractable.
async function extractFromTab(tab) {
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: EXTRACT_FILES,
  });
  const result = results?.[results.length - 1]?.result;
  if (!result?.success) {
    throw new Error(result?.error || "Extraction failed — page may not have article content.");
  }
  return { ...result, url: tab.url };
}

// Run Readability + Turndown in the active tab and return { markdown, title, url }.
async function extract() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return extractFromTab(tab);
}

// toFilename / stripFrontMatter / stripImages / estimateTokens / buildLeanMarkdown
// live in shared.js (loaded before this script), shared with the service worker.

// If the user opted in and Chrome's on-device Summarizer (Gemini Nano) is
// ready, add a short TL;DR to result.meta.summary. Strictly feature-detected:
// no setting → no-op; API missing or model not downloaded → no-op (the model
// is only ever downloaded from the explicit button in settings). Any failure
// degrades silently — extraction must never break because of AI.
async function maybeAddAiSummary(result) {
  try {
    if (!(await getAiSummaryEnabled())) return;
    if (typeof Summarizer === "undefined") return;
    if ((await Summarizer.availability()) !== "available") return;

    const summarizer = await Summarizer.create({
      type: "tldr",
      format: "plain-text",
      length: "short",
    });
    try {
      // Plain text in, capped — keeps us well inside the model's input quota.
      const text = stripImages(result?.body || "").replace(/[#*_>`\[\]()!-]/g, " ").slice(0, 8000);
      const summary = (await summarizer.summarize(text))?.trim();
      if (summary) {
        if (!result.meta) result.meta = {};
        result.meta.summary = summary.replace(/\s+/g, " ");
      }
    } finally {
      // Always release the session — a leak here pins the multi-GB model.
      summarizer.destroy?.();
    }
  } catch {
    // On-device AI is best-effort; never surface its errors.
  }
}

// If the user opted in and the on-device Prompt API (Gemini Nano) is ready,
// add topic tags to result.meta.tags. Same gating and best-effort rules as
// maybeAddAiSummary.
async function maybeAddAiTags(result) {
  try {
    if (!(await getAiTagsEnabled())) return;
    if (typeof LanguageModel === "undefined") return;
    if ((await LanguageModel.availability()) !== "available") return;

    const session = await LanguageModel.create({
      initialPrompts: [
        {
          role: "system",
          content:
            "You label articles. Reply with 3 to 6 short topic tags for the given text, lowercase, comma-separated, no other output.",
        },
      ],
    });
    try {
      const text = stripImages(result?.body || "").replace(/[#*_>`\[\]()!-]/g, " ").slice(0, 6000);
      const tags = parseAiTags(await session.prompt(`Text:\n${text}\n\nTags:`));
      if (tags.length) {
        if (!result.meta) result.meta = {};
        result.meta.tags = tags;
      }
    } finally {
      session.destroy?.();
    }
  } catch {
    // On-device AI is best-effort; never surface its errors.
  }
}

// Extraction plus optional enrichments for outputs that carry front matter.
// AI steps run sequentially — one Gemini Nano session at a time.
async function extractWithExtras() {
  const result = await extract();
  await maybeAddAiSummary(result);
  await maybeAddAiTags(result);
  return result;
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

function downloadFile(content, filename, type = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type });
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
    const result = await extractWithExtras();
    const markdown = await buildOutput(result);
    const filename = toFilename(result.title);
    downloadFile(markdown, filename);
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
    const result = await extractWithExtras();
    const markdown = await buildOutput(result);
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

obsidianBtn.addEventListener("click", async () => {
  setBusy(true, obsidianBtn, "Sending...");
  try {
    const result = await extractWithExtras();
    const markdown = await buildOutput(result);
    const uri = buildObsidianUri(result.title, markdown, await getObsidianVault());
    if (uri.length > OBSIDIAN_URI_LIMIT) {
      // Too large for the obsidian:// protocol handler — hand off via clipboard.
      await copyToClipboard(markdown);
      showSuccess("Too large to send directly — copied to clipboard; paste into Obsidian.");
    } else {
      await chrome.tabs.create({ url: uri });
      showSuccess("Sent to Obsidian.");
    }
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

// Only offer the webhook action once a URL has been configured in settings.
(async () => {
  webhookBtn.hidden = !(await getWebhookUrl());
})();

webhookBtn.addEventListener("click", async () => {
  setBusy(true, webhookBtn, "Sending...");
  try {
    const webhookUrl = await getWebhookUrl();
    if (!webhookUrl) throw new Error("No webhook configured — set one in settings.");
    const result = await extractWithExtras();
    const markdown = await buildOutput(result);
    await postToWebhook(webhookUrl, {
      title: result.title,
      url: result.url,
      markdown,
      meta: result.meta,
    });
    showSuccess("Sent to webhook.");
  } catch (err) {
    showError(err);
  } finally {
    setBusy(false);
  }
});

// 🗂 Clip every clippable tab in the current window into one combined file.
// Needs "tabs" (to enumerate tabs) plus broad https host access (to inject
// the extraction pipeline into background tabs, where activeTab can't reach) —
// both declared optional in the manifest and requested only here, inside the
// click gesture, so the default install keeps its minimal-permission story.
batchBtn.addEventListener("click", async () => {
  setBusy(true, batchBtn, "Clipping tabs...");
  try {
    const granted = await chrome.permissions.request({
      permissions: ["tabs"],
      origins: ["https://*/*"],
    });
    if (!granted) throw new Error("Permission declined — can't read the window's tabs without it.");

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const clippable = tabs.filter((t) => /^https:/i.test(t.url || ""));
    if (!clippable.length) throw new Error("No clippable tabs — only regular https pages can be clipped.");

    // Sequential on purpose: one extraction at a time keeps memory sane on
    // big windows, and lets the status line show real progress.
    const docs = [];
    const skipped = [];
    for (let i = 0; i < clippable.length; i++) {
      status.textContent = `Clipping tab ${i + 1} of ${clippable.length}…`;
      try {
        const result = await extractFromTab(clippable[i]);
        docs.push(await buildOutput(result));
      } catch {
        // Discarded/unloaded tabs and pages with no article land here.
        skipped.push(clippable[i].title || clippable[i].url);
      }
    }
    if (!docs.length) throw new Error("Couldn't extract an article from any open tab.");

    let combined = docs.join("\n\n---\n\n");
    if (skipped.length) {
      combined += `\n\n---\n\n> Skipped ${skipped.length} tab${skipped.length === 1 ? "" : "s"}: ${skipped.join("; ")}\n`;
    }
    const filename = toFilename(`tabs ${new Date().toISOString().slice(0, 10)}`);
    downloadFile(combined, filename);
    showSuccess(
      skipped.length
        ? `Downloaded ${docs.length} tabs (${skipped.length} skipped): ${filename}`
        : `Downloaded ${docs.length} tabs: ${filename}`
    );
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
    const result = await extractWithExtras();
    current = {
      title: result.title || "page",
      url: result.url || "",
      lang: result.meta?.lang || "",
      engine: result.engine || "",
    };
    editor.value = await buildOutput(result);
    translateBtn.hidden = !(await getTranslateTarget()) || typeof Translator === "undefined";
    cleanupBtn.hidden = !(await getAiCleanupEnabled()) || typeof LanguageModel === "undefined";
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

// 🌐 Translate the preview in place using Chrome's on-device Translator.
// Explicit user action: creating the translator inside this click may fetch
// the (small) language pack, with progress shown in the status line.
translateBtn.addEventListener("click", async () => {
  setBusy(true, translateBtn, "Translating...");
  // Freeze the editor: edits typed mid-translation would be overwritten below.
  editor.disabled = true;
  try {
    const target = await getTranslateTarget();
    if (!target) throw new Error("Set a target language in settings first.");
    if (typeof Translator === "undefined") throw new Error("Translation isn't supported by this browser.");

    const source = (current.lang || "en").split("-")[0].toLowerCase();
    if (source === target) throw new Error(`Page already appears to be "${target}".`);

    const translator = await Translator.create({
      sourceLanguage: source,
      targetLanguage: target,
      monitor(m) {
        m.addEventListener("downloadprogress", (e) => {
          const percent = e.total ? Math.round((e.loaded / e.total) * 100) : Math.round((e.loaded || 0) * 100);
          status.textContent = `Downloading language pack… ${percent}%`;
        });
      },
    });
    try {
      editor.value = await translateMarkdown(editor.value, (text) => translator.translate(text));
      updateMeta();
      showSuccess(`Translated ${source} → ${target}.`);
    } finally {
      translator.destroy?.();
    }
  } catch (err) {
    showError(err);
  } finally {
    editor.disabled = false;
    setBusy(false);
  }
});

// 🧹 Remove leftover boilerplate from the preview using the on-device Prompt
// API. The model only flags blocks (nav menus, cookie banners, footer junk);
// flagged blocks are dropped verbatim — content is never rewritten. Requires
// the model to already be installed (download lives in settings, like the
// other AI features).
cleanupBtn.addEventListener("click", async () => {
  setBusy(true, cleanupBtn, "Cleaning...");
  // Freeze the editor: edits typed mid-cleanup would be overwritten below.
  editor.disabled = true;
  try {
    if (typeof LanguageModel === "undefined") throw new Error("On-device AI isn't supported by this browser.");
    if ((await LanguageModel.availability()) !== "available") {
      throw new Error("Model not installed — use the Download model button in settings.");
    }

    const { frontMatter, blocks } = splitMarkdownBlocks(editor.value);
    if (blocks.length < 2) throw new Error("Nothing to clean — the page has too little content.");

    const session = await LanguageModel.create({
      initialPrompts: [
        {
          role: "system",
          content:
            "You spot boilerplate in web articles converted to Markdown. Given numbered blocks from one article, reply with only the numbers of blocks that are navigation menus, cookie or consent notices, ads, newsletter/subscription prompts, share or social buttons, related-article lists, comment-section chrome, or footer junk — comma-separated. Reply with the word none if every block is real content. Never flag the article's own text, headings, quotes, or data.",
        },
      ],
    });
    const dropIndexes = [];
    try {
      // Classify in batches of numbered snippets so the prompt stays small.
      const BATCH = 24;
      for (let start = 0; start < blocks.length; start += BATCH) {
        const batch = blocks.slice(start, start + BATCH);
        const listing = batch
          .map((b, i) => `[${i}] ${b.replace(/\s+/g, " ").trim().slice(0, 200)}`)
          .join("\n");
        const reply = await session.prompt(`Blocks:\n${listing}\n\nBoilerplate block numbers:`);
        for (const n of parseBlockNumbers(reply, batch.length)) dropIndexes.push(start + n);
      }
    } finally {
      session.destroy?.();
    }

    const { kept, dropped, rejected } = dropBoilerplateBlocks(blocks, dropIndexes);
    if (rejected) {
      showError(new Error("Cleanup skipped — the model flagged too much of the page to be trusted."));
    } else if (!dropped) {
      showSuccess("No boilerplate found — the page already looks clean.");
    } else {
      editor.value = frontMatter + kept.join("\n\n") + "\n";
      updateMeta();
      showSuccess(`Removed ${dropped} boilerplate block${dropped === 1 ? "" : "s"}.`);
    }
  } catch (err) {
    showError(err);
  } finally {
    editor.disabled = false;
    setBusy(false);
  }
});

// Preview actions operate on the (possibly edited) editor content.

downloadEditedBtn.addEventListener("click", () => {
  const filename = toFilename(current.title);
  downloadFile(editor.value, filename);
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

// 🧩 Download the preview as heading-scoped JSONL chunks for RAG pipelines:
// one object per line with title, source, heading trail, and token estimate.
ragBtn.addEventListener("click", () => {
  try {
    const chunks = chunkMarkdown(editor.value);
    if (!chunks.length) throw new Error("Nothing to chunk — the preview is empty.");
    const jsonl = buildRagJsonl(chunks, { title: current.title, source: current.url });
    const filename = toFilename(current.title).replace(/\.md$/, ".jsonl");
    downloadFile(jsonl, filename, "application/jsonl;charset=utf-8");
    showSuccess(`Downloaded ${chunks.length} chunk${chunks.length === 1 ? "" : "s"}: ${filename}`);
  } catch (err) {
    showError(err);
  }
});

// 📊 Download every Markdown table in the preview as its own CSV file.
csvBtn.addEventListener("click", () => {
  try {
    const tables = markdownTablesToCsv(editor.value);
    if (!tables.length) throw new Error("No Markdown tables found in the preview.");
    const base = toFilename(current.title).replace(/\.md$/, "");
    tables.forEach((csv, i) => {
      const suffix = tables.length === 1 ? "" : `-${i + 1}`;
      downloadFile(csv, `${base}-table${suffix}.csv`, "text/csv;charset=utf-8");
    });
    showSuccess(`Downloaded ${tables.length} CSV table${tables.length === 1 ? "" : "s"}.`);
  } catch (err) {
    showError(err);
  }
});

// 🐞 Open a pre-filled GitHub issue about this page's extraction. Only the
// page URL, engine, and version numbers are included — never page content.
reportBtn.addEventListener("click", () => {
  const params = new URLSearchParams({
    title: `Bad extraction: ${current.url || current.title}`,
    body: [
      `**Page:** ${current.url || "(unknown)"}`,
      `**Engine used:** ${current.engine || "unknown"}`,
      `**Extension version:** ${chrome.runtime.getManifest().version}`,
      `**Browser:** ${navigator.userAgent}`,
      "",
      "**What looked wrong?**",
      "",
      "<!-- e.g. missing content, leftover junk, broken table/math/code. Nothing from the page is included automatically — paste a snippet only if you're comfortable sharing it. -->",
    ].join("\n"),
    labels: "extraction",
  });
  chrome.tabs.create({ url: `https://github.com/TibetOS/page-to-markdown/issues/new?${params.toString()}` });
});
