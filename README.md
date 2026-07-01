# Page to Markdown

One-click Chrome extension to extract any web page's content as a clean `.md` file.

## How It Works

1. Click the extension icon on any page
2. Choose an action:
   - **⬇ Extract .md** — download a Markdown file with YAML front matter (title, author, source URL, timestamp)
   - **📋 Copy Markdown** — copy the full Markdown to your clipboard
   - **✨ Copy for AI** — copy token-lean Markdown (no front matter, no images) plus a token estimate, ready to paste into ChatGPT/Claude
   - **👁 Preview & edit** — review the Markdown in an editable pane (with live word/token counts), tweak it, then download or copy the result

Or skip the popup entirely:
- **Keyboard shortcut** — `Ctrl+Shift+M` (`⌘+Shift+M` on Mac) opens the popup; customize at `chrome://extensions/shortcuts`
- **Right-click menu** — *Page to Markdown* → download / copy the page, or **Copy selection as Markdown** when text is highlighted

Under the hood: [Readability.js](https://github.com/mozilla/readability) strips ads/nav/junk, then [Turndown.js](https://github.com/mixmark-io/turndown) converts the clean HTML to Markdown.

## Install

### Chrome / Edge (from source)
1. Clone this repo: `git clone https://github.com/TibetOS/page-to-markdown.git`
2. Open `chrome://extensions/` (or `edge://extensions/`)
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the cloned folder

Edge is Chromium-based, so the same folder loads unmodified.

### Firefox (from source)
1. Run `node scripts/build.mjs` to generate `dist/firefox/`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** → pick `dist/firefox/manifest.json`

Firefox uses a slightly different manifest (event-page background + `browser_specific_settings`); the build script generates it for you. Requires Firefox 121+.

### From the stores
Coming soon.

## Building

`node scripts/build.mjs` packages the extension into `dist/`:
- `page-to-markdown-chrome-v<version>.zip` (also loads on Edge)
- `page-to-markdown-firefox-v<version>.zip`

No dependencies — just Node and the `zip` CLI.

## Features

- **Smart extraction** — Mozilla Readability strips ads, nav, footers, cookie banners
- **Clean Markdown** — ATX headings, fenced code blocks, proper links
- **One-click clipboard** — copy full Markdown, or token-lean Markdown formatted for AI chats
- **Preview & edit** — review and tweak the Markdown before saving, with live word/token counts
- **Token estimate** — see roughly how much of your model's context a page will use
- **Keyboard shortcut & context menu** — extract or copy without opening the popup
- **Selection clipping** — highlight text, right-click, get just that part as Markdown
- **Rich, valid YAML front matter** — title, author, source, site, publish date, language, excerpt, timestamp — safely escaped so titles with `:`, quotes, or line breaks can't break the YAML
- **Configurable fields** — toggle which front-matter fields are included from the settings page
- **Image dedup** — handles lazy-loading markup that creates duplicate `<img>` tags
- **Hebrew/RTL support** — Unicode filenames and content
- **Zero cloud** — everything runs locally, no data leaves your browser

## Output Example

```markdown
---
title: "How AI Changes Everything: A \"Deep\" Dive"
author: "Jane Smith"
source: "https://example.com/article"
site: "Example News"
published: "2026-03-25T08:00:00.000Z"
lang: "en"
excerpt: "Why smaller, more efficient models are reshaping the field."
extracted: "2026-03-27T10:30:00.000Z"
---

The future of artificial intelligence is being shaped by...

## Key Findings

Researchers discovered that smaller, more efficient models...
```

## Permissions

`activeTab` + `scripting` + `contextMenus` + `storage`. The extension only touches a page when *you* invoke it (icon click, keyboard shortcut, or right-click menu) — `activeTab` grants access for that one action, so there are no broad host permissions, no background tracking, and no analytics. `contextMenus` adds the right-click entries; `storage` saves your front-matter field preferences (locally / via your browser account — nothing leaves for our servers, because we have none).

## Roadmap

- **v1.0** — Readability + Turndown extraction
- **v1.1** — Copy to clipboard + "Copy for AI" (token-lean output, token estimate) ✅
- **v1.2** — Keyboard shortcut, right-click context menu, selection-only clipping ✅
- **v1.3** — Rich, YAML-safe front matter (escaped values + site/date/lang/excerpt) ✅
- **v1.4** — Preview & edit panel with live word/token counts ✅
- **v1.5** — Configurable front-matter fields (settings page) ✅
- **v1.6** — Firefox & Edge builds (cross-browser packaging) ✅
- **Next** — Defuddle extraction engine, send-to-Obsidian/Notion, on-device Gemini Nano cleanup

See [`ROADMAP.md`](ROADMAP.md) for the full market & technology intelligence analysis and phased plan.

## License

MIT
