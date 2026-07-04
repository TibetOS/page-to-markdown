# Chrome Web Store — Form Fields to Fill In

Copy-paste each field below into the corresponding spot on the CWS developer dashboard.
(Current as of v1.11 — clipboard/AI copy, shortcuts & context menu, selection clipping,
configurable front matter, preview/edit, Obsidian & webhook destinations, opt-in on-device AI.)

---

## Store Listing Tab

**Language:** English

**Category:** Productivity

**Detailed description:** *(already in description.txt — paste it in if not already there)*

---

## Privacy Practices Tab

### Single purpose description
```
Extract the current page's content as clean Markdown — download it, copy it, or send it to the user's own tools (Obsidian, a user-configured webhook).
```

### Justification for activeTab
```
activeTab is used to access the content of the page the user is currently viewing when they explicitly invoke the extension (toolbar icon, keyboard shortcut, or right-click menu item). This is required to extract the page's HTML for Markdown conversion. The extension only accesses the tab the user acted on, only at that moment, and never accesses any other tabs.
```

### Justification for scripting
```
The scripting permission injects the bundled content script into the active tab to run Readability.js for article extraction and Turndown.js for HTML-to-Markdown conversion. Scripts run only in direct response to a user action (icon click, keyboard shortcut, or context-menu click) and only on the current tab.
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
Declared as OPTIONAL and requested only if the user configures a webhook destination in settings. At save time the extension requests access to the single origin of the user's own webhook URL (e.g. their n8n/Zapier/self-hosted endpoint) so it can POST the extracted Markdown there on demand. Nothing is requested at install; no origin other than the user's chosen endpoint is ever requested; declining the prompt leaves the webhook unset.
```

### Justification for remote code use
```
This extension does not use any remote code. All libraries (Readability.js, Turndown.js) are bundled locally within the extension package. No external scripts are loaded at runtime. Optional AI features use Chrome's built-in on-device APIs (Summarizer / Prompt) — no cloud AI services are called.
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
