# CLAUDE.md

## Communication style — READ FIRST
Gal wants **short, concise chat replies**. Always.
- Lead with the answer: 1–3 sentences, TL;DR first.
- At most ~5 short bullets of supporting detail. No long prose, no restating context.
- Skip methodology/background; end with "want details?" instead of dumping them.
- Applies to everything: status reports, explanations, reviews, plans.

## Project
Page to Markdown — privacy-first Chrome MV3 extension: any page → clean Markdown
(Defuddle, Readability fallback, Turndown). v1.17.0; ROADMAP.md fully delivered.
Not yet on the Chrome Web Store; landing page live at ptm.traffko.com.

- Build: `node scripts/build.mjs` → `dist/` zips (Chrome/Edge + Firefox). No npm deps.
- No test suite; test manually via `chrome://extensions` → Load unpacked.
- Key files: `popup.js`, `content.js`, `background.js`, `shared.js`, `options.js`,
  MCP server `mcp/server.mjs`, landing page `site/` (Cloudflare Workers).
