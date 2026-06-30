# Page to Markdown

One-click Chrome extension to extract any web page's content as a clean `.md` file.

## How It Works

1. Click the extension icon on any page
2. Choose an action:
   - **⬇ Extract .md** — download a Markdown file with YAML front matter (title, author, source URL, timestamp)
   - **📋 Copy Markdown** — copy the full Markdown to your clipboard
   - **✨ Copy for AI** — copy token-lean Markdown (no front matter, no images) plus a token estimate, ready to paste into ChatGPT/Claude

Or skip the popup entirely:
- **Keyboard shortcut** — `Ctrl+Shift+M` (`⌘+Shift+M` on Mac) opens the popup; customize at `chrome://extensions/shortcuts`
- **Right-click menu** — *Page to Markdown* → download / copy the page, or **Copy selection as Markdown** when text is highlighted

Under the hood: [Readability.js](https://github.com/mozilla/readability) strips ads/nav/junk, then [Turndown.js](https://github.com/mixmark-io/turndown) converts the clean HTML to Markdown.

## Install

### From source (Developer mode)
1. Clone this repo: `git clone https://github.com/TibetOS/page-to-markdown.git`
2. Open `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** → select the cloned folder

### From Chrome Web Store
Coming soon.

## Features

- **Smart extraction** — Mozilla Readability strips ads, nav, footers, cookie banners
- **Clean Markdown** — ATX headings, fenced code blocks, proper links
- **One-click clipboard** — copy full Markdown, or token-lean Markdown formatted for AI chats
- **Token estimate** — see roughly how much of your model's context a page will use
- **Keyboard shortcut & context menu** — extract or copy without opening the popup
- **Selection clipping** — highlight text, right-click, get just that part as Markdown
- **YAML front matter** — title, author, source URL, extraction timestamp
- **Image dedup** — handles lazy-loading markup that creates duplicate `<img>` tags
- **Hebrew/RTL support** — Unicode filenames and content
- **Zero cloud** — everything runs locally, no data leaves your browser

## Output Example

```markdown
---
title: "How AI Changes Everything"
author: "Jane Smith"
source: "https://example.com/article"
extracted: "2026-03-27T10:30:00.000Z"
---

The future of artificial intelligence is being shaped by...

## Key Findings

Researchers discovered that smaller, more efficient models...
```

## Permissions

`activeTab` + `scripting` + `contextMenus`. The extension only touches a page when *you* invoke it (icon click, keyboard shortcut, or right-click menu) — `activeTab` grants access for that one action, so there are no broad host permissions, no background tracking, and no analytics. `contextMenus` only adds the right-click entries.

## Roadmap

- **v1.0** — Readability + Turndown extraction
- **v1.1** — Copy to clipboard + "Copy for AI" (token-lean output, token estimate) ✅
- **v1.2** — Keyboard shortcut, right-click context menu, selection-only clipping ✅
- **Next** — Preview panel, configurable front matter, Firefox/Edge builds
- **Later** — Defuddle extraction engine, send-to-Obsidian/Notion, on-device Gemini Nano cleanup

See [`ROADMAP.md`](ROADMAP.md) for the full market & technology intelligence analysis and phased plan.

## License

MIT
