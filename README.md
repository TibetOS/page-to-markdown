# Page to Markdown

One-click Chrome extension to extract any web page's content as a clean `.md` file.

## How It Works

1. Click the extension icon on any page
2. Click **"Extract .md"**
3. Get a Markdown file with YAML front matter (title, author, source URL, timestamp)

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

Only `activeTab` + `scripting` — the extension can only access the page you're viewing, and only when you click the icon. No background tracking, no analytics.

## Roadmap

- **v1.0** — Readability + Turndown extraction (current)
- **v1.1** — Preview panel, settings, export format options
- **v2.0** — Optional in-browser LLM (chrome.ai / WebLLM) for smarter cleanup on edge cases

## License

MIT
