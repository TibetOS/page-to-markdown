# Chrome Web Store — Form Fields to Fill In

Copy-paste each field below into the corresponding spot on the CWS developer dashboard.
(Current as of v1.17 — adds Defuddle engine, batch tab capture, RAG/CSV export,
Obsidian folders & daily note, Hebrew UI, MCP bridge.)

---

## Store Listing Tab

**Language:** English

**Category:** Productivity

**Detailed description:** *(already in description.txt — paste it in if not already there)*

---

## Privacy Practices Tab

### Single purpose description
```
Extract web page content as clean Markdown — download it, copy it, or send it to the user's own tools (Obsidian, a user-configured webhook), one page at a time or for all open tabs at once.
```

### Justification for activeTab
```
activeTab is used to access the content of the page the user is currently viewing when they explicitly invoke the extension (toolbar icon, keyboard shortcut, or right-click menu item). This is required to extract the page's HTML for Markdown conversion. The extension only accesses the tab the user acted on, only at that moment, and never accesses any other tabs.
```

### Justification for scripting
```
The scripting permission injects the bundled content script into the active tab to run Defuddle (with Readability.js fallback) for article extraction and Turndown.js for HTML-to-Markdown conversion. Scripts run only in direct response to a user action (icon click, keyboard shortcut, or context-menu click) and only on the current tab — or, if the user explicitly runs "Clip all tabs" and grants the optional permissions, on the window's https tabs for that one operation.
```

### Justification for tabs (optional)
```
Declared OPTIONAL and requested only when the user first clicks "Clip all tabs". It is needed to enumerate the window's open https tabs so each can be extracted into one combined Markdown file. If the user declines, nothing changes and the rest of the extension keeps working; tab URLs/titles are used only during that user-initiated batch operation and are never stored or transmitted.
```

### Justification for contextMenus
```
contextMenus adds "Page to Markdown" entries to the right-click menu (download/copy the page as Markdown, copy a highlighted selection as Markdown, send the page to Obsidian). The menu items only trigger the same user-initiated extraction as the toolbar button.
```

### Justification for storage
```
storage (chrome.storage.sync) saves the user's preferences: which YAML front-matter fields to include, an optional default Obsidian vault name, an optional webhook URL, and the opt-in toggles for on-device AI summary/tags. No browsing data or page content is ever stored; preferences sync only through the user's own browser account.
```

### Justification for optional host permissions (https://*/*, http://localhost/*, http://127.0.0.1/*)
```
Declared as OPTIONAL; nothing is requested at install. Two user-initiated flows request host access: (1) configuring a webhook destination requests access to the single origin of the user's own endpoint (e.g. their n8n/Zapier/self-hosted URL) so extractions can be POSTed there on demand; (2) the first use of "Clip all tabs" requests https access so the bundled extractor can run in the window's open tabs for that batch operation. Declining either prompt simply leaves that feature off.
```

### Justification for remote code use
```
This extension does not use any remote code. All libraries (Defuddle, Readability.js, Turndown.js) are bundled locally within the extension package. No external scripts are loaded at runtime. Optional AI features use Chrome's built-in on-device APIs (Summarizer / Prompt / Translator) — no cloud AI services are called.
```

### Privacy policy URL
```
https://ptm.traffko.com/privacy
```

### Data usage certification
Check the box confirming compliance with Developer Program Policies.
This is safe — the extension collects zero data, has no analytics, and calls no
cloud APIs. Page content goes only where the user explicitly sends it
(their download folder, clipboard, Obsidian vault, or their own webhook).

---

## Assets (upload these files)

| What                | File                          |
|---------------------|-------------------------------|
| Icon (128×128)      | `icons/icon128.png`           |
| Screenshot          | `store/screenshot_1280x800.png` *(re-capture — popup now has 6 actions)* |
| Promo tile (440×280)| `store/tile_440x280.png`      |

## Package to upload

Run `node scripts/build.mjs` and upload `dist/page-to-markdown-chrome-v<version>.zip`
(built packages are not checked into git — the build is deterministic from source).

## Automated publishing

`.github/workflows/publish-cws.yml` uploads and publishes automatically — run it from the
Actions tab or publish a GitHub release. One-time setup: add the four `CWS_*` repository
secrets (extension ID + OAuth client id/secret/refresh token; see
https://github.com/fregante/chrome-webstore-upload-keys for how to generate them).
