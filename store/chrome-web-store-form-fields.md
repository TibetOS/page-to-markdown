# Chrome Web Store — Form Fields to Fill In

Copy-paste each field below into the corresponding spot on the CWS developer dashboard.

---

## Store Listing Tab

**Language:** English

**Category:** Productivity

**Detailed description:** *(already in description.txt — paste it in if not already there)*

---

## Privacy Practices Tab

### Single purpose description
```
Extract the current page's content and download it as a clean Markdown (.md) file.
```

### Justification for activeTab
```
activeTab is used to access the content of the page the user is currently viewing when they click the extension icon. This is required to extract the page's HTML for Markdown conversion. The extension only accesses the active tab on user action (clicking the icon) and never accesses any other tabs.
```

### Justification for scripting
```
The scripting permission is used to inject content.js into the active tab to run Readability.js for article extraction and Turndown.js for HTML-to-Markdown conversion. These scripts run only when the user clicks "Extract .md" and only on the current tab.
```

### Justification for remote code use
```
This extension does not use any remote code. All libraries (Readability.js, Turndown.js) are bundled locally within the extension package. No external scripts are loaded at runtime.
```

### Data usage certification
Check the box confirming compliance with Developer Program Policies.
This is safe — you collect zero data, no analytics, no cloud APIs.

---

## Assets (upload these files)

| What                | File                          |
|---------------------|-------------------------------|
| Icon (128×128)      | `icons/icon128.png`           |
| Screenshot          | `store/screenshot_1280x800.png` |
| Promo tile (440×280)| `store/tile_440x280.png`      |
