// Background service worker: powers the keyboard shortcut and right-click
// context menu. Extraction reuses the same Readability + Turndown pipeline as
// the popup (content.js); clipboard writes and downloads run in the page,
// where a DOM and the user gesture from the command/menu click are available.

// Chrome/Edge load this as a service worker (importScripts available); Firefox
// loads it as an event page with shared.js already injected via background.scripts.
if (typeof importScripts === "function") importScripts("shared.js");

const MENU = {
  download: "p2m-download",
  copy: "p2m-copy",
  copyAI: "p2m-copy-ai",
  obsidian: "p2m-obsidian",
  copySelection: "p2m-copy-selection",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "p2m", title: "Page to Markdown", contexts: ["page", "selection"] });
    chrome.contextMenus.create({ id: MENU.download, parentId: "p2m", title: "Download page as Markdown", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU.copy, parentId: "p2m", title: "Copy page as Markdown", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU.copyAI, parentId: "p2m", title: "Copy page for AI", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU.obsidian, parentId: "p2m", title: "Send page to Obsidian", contexts: ["page"] });
    chrome.contextMenus.create({ id: MENU.copySelection, parentId: "p2m", title: "Copy selection as Markdown", contexts: ["selection"] });
  });
});

// Run Readability + Turndown in the tab and return { body, title, meta }.
async function extractArticle(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    files: ["lib/defuddle.js", "lib/Readability.js", "lib/turndown.js", "content.js"],
  });
  const result = results?.[results.length - 1]?.result;
  if (!result?.success) {
    throw new Error(result?.error || "Extraction failed — page may not have article content.");
  }
  return result;
}

// --- Functions injected into the page (must be self-contained) ---

function copyTextInPage(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.top = "-9999px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {
    ok = false;
  }
  ta.remove();
  return ok;
}

function downloadInPage(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Turndown is injected before this runs, so TurndownService is in scope.
function convertSelectionInPage() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return { success: false, error: "No text selected." };
  }
  const container = document.createElement("div");
  for (let i = 0; i < sel.rangeCount; i++) {
    container.appendChild(sel.getRangeAt(i).cloneContents());
  }
  const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" });
  return { success: true, markdown: td.turndown(container.innerHTML).trim() };
}

async function runInPage(tabId, func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId }, func, args });
  return results?.[0]?.result;
}

// Brief toolbar-badge feedback, since there's no popup status line here.
function flashBadge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1500);
}

async function copySelection(tab) {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["lib/turndown.js"] });
  const result = await runInPage(tab.id, convertSelectionInPage);
  if (!result?.success) throw new Error(result?.error || "Couldn't convert the selection.");
  const ok = await runInPage(tab.id, copyTextInPage, [result.markdown]);
  if (!ok) throw new Error("Couldn't write to the clipboard.");
}

async function copyPage(tab, forAI) {
  const result = await extractArticle(tab.id);
  const text = forAI
    ? buildLeanMarkdown(result.body, result.title, tab.url)
    : await buildOutput(result);
  const ok = await runInPage(tab.id, copyTextInPage, [text]);
  if (!ok) throw new Error("Couldn't write to the clipboard.");
}

async function downloadPage(tab) {
  const result = await extractArticle(tab.id);
  const markdown = await buildOutput(result);
  await runInPage(tab.id, downloadInPage, [markdown, toFilename(result.title)]);
}

async function sendToObsidian(tab) {
  const result = await extractArticle(tab.id);
  const markdown = await buildOutput(result);
  const { vault, folder, daily } = await getObsidianSettings();
  const uri = daily
    ? buildObsidianDailyUri(markdown, vault)
    : buildObsidianUri(result.title, markdown, vault, folder);
  if (uri.length > OBSIDIAN_URI_LIMIT) {
    // Too large for the obsidian:// protocol handler — hand off via clipboard.
    const ok = await runInPage(tab.id, copyTextInPage, [markdown]);
    if (!ok) throw new Error("Too large to send; clipboard copy failed too.");
    return;
  }
  await chrome.tabs.create({ url: uri });
}

async function handle(action, tab) {
  if (!tab?.id) return;
  try {
    if (action === MENU.download) await downloadPage(tab);
    else if (action === MENU.copy) await copyPage(tab, false);
    else if (action === MENU.copyAI) await copyPage(tab, true);
    else if (action === MENU.obsidian) await sendToObsidian(tab);
    else if (action === MENU.copySelection) await copySelection(tab);
    flashBadge("✓", "#16a34a");
  } catch (err) {
    console.error("Page to Markdown:", err);
    flashBadge("!", "#dc2626");
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => handle(info.menuItemId, tab));

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "copy-page-markdown") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  handle(MENU.copy, tab);
});
