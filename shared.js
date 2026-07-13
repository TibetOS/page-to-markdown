// Shared Markdown post-processing helpers.
// Loaded by the popup (via <script>) and the background service worker
// (via importScripts) so both runtimes share one implementation.

// Sanitize a title into a safe .md filename (keeps Hebrew chars too).
function toFilename(title) {
  return (
    (title || "page")
      .replace(/[^a-zA-Z0-9֐-׿\s-]/g, "")
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

// Front-matter fields, in output order. Users can toggle each on/off.
// "summary" and "tags" are only populated when the opt-in on-device AI
// features are enabled.
const FRONT_MATTER_FIELDS = ["title", "author", "source", "site", "published", "lang", "excerpt", "summary", "tags", "extracted"];
const DEFAULT_FIELDS = FRONT_MATTER_FIELDS.reduce((acc, key) => ((acc[key] = true), acc), {});

// Strip C0 control characters (code < 32). Done via char codes rather than a
// regex so the source stays free of literal control bytes.
function stripControls(s) {
  return Array.from(s)
    .filter((ch) => ch.charCodeAt(0) >= 32)
    .join("");
}

// Serialize a value as a safe double-quoted YAML scalar: escape backslashes and
// quotes, turn CR/LF/TAB into escape sequences, drop remaining control chars —
// so titles with ":", quotes, or line breaks can't produce invalid YAML.
function yamlString(value) {
  const escaped = String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
  return `"${stripControls(escaped)}"`;
}

// Serialize a front-matter value: arrays become a flow-style YAML list of
// quoted scalars, everything else a single quoted scalar.
function yamlValue(value) {
  if (Array.isArray(value)) return `[${value.map(yamlString).join(", ")}]`;
  return yamlString(value);
}

// Build a YAML front-matter block from a metadata object, honouring which
// fields are enabled and skipping any that are absent. Returns "" if nothing
// would be emitted.
function buildFrontMatter(meta, enabled) {
  const on = enabled || DEFAULT_FIELDS;
  const lines = FRONT_MATTER_FIELDS.filter((key) => on[key] !== false)
    .map((key) => [key, meta?.[key]])
    .filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value != null && String(value).trim() !== ""
    )
    .map(([key, value]) => `${key}: ${yamlValue(value)}`);
  if (!lines.length) return "";
  return "---\n" + lines.join("\n") + "\n---\n\n";
}

// Assemble the full Markdown document (front matter + body) for a content.js
// result, honouring the user's enabled fields.
function assembleMarkdown(result, enabled) {
  return buildFrontMatter(result.meta, enabled) + result.body;
}

// Load the user's enabled-field settings, falling back to all-on.
async function getEnabledFields() {
  try {
    const stored = await chrome.storage.sync.get("frontMatterFields");
    return { ...DEFAULT_FIELDS, ...(stored.frontMatterFields || {}) };
  } catch {
    return { ...DEFAULT_FIELDS };
  }
}

// Build token-lean Markdown for pasting into an AI chat: no front matter,
// no images, with a title + source line so the model knows the provenance.
function buildLeanMarkdown(markdown, title, url) {
  const body = stripImages(stripFrontMatter(markdown)).trim();
  return `# ${title || "Untitled"}\nSource: ${url || ""}\n\n${body}`;
}

// --- On-device translation ---

// The user's target language for the preview Translate action ("" = off).
async function getTranslateTarget() {
  try {
    const stored = await chrome.storage.sync.get("translateTarget");
    return (stored.translateTarget || "").trim().toLowerCase();
  } catch {
    return "";
  }
}

// Translate a Markdown document's prose while preserving its structure.
// `translate` is an async (text) => text function (injected so this stays
// testable). Untouched: YAML front matter, fenced code blocks, blank lines,
// leading markdown syntax (headings/lists/blockquotes), inline code spans,
// and link/image URLs (protected with placeholder tokens during translation).
async function translateMarkdown(markdown, translate) {
  const lines = String(markdown).split("\n");
  const out = [];
  let inFence = false;
  let inFrontMatter = lines[0] === "---";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (inFrontMatter) {
      out.push(line);
      if (i > 0 && line === "---") inFrontMatter = false;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence || line.trim() === "") {
      out.push(line);
      continue;
    }

    const m = line.match(/^([ \t]*(?:(?:[>*+-]|\d+\.|#{1,6})\s+)*)(.*)$/);
    const prefix = m[1];
    const rest = m[2];
    if (!rest.trim()) {
      out.push(line);
      continue;
    }

    // Shield inline code spans and link/image URL parts behind ⟦n⟧ tokens so
    // the translator only ever sees prose. Each token maps 1:1 to its
    // original text, so restoring is a plain substitution.
    const shielded = [];
    const shield = (s) => {
      shielded.push(s);
      return `⟦${shielded.length - 1}⟧`;
    };
    const shieldedText = rest
      .replace(/`[^`]*`/g, shield)
      .replace(/\]\([^)]*\)/g, shield);

    let translated;
    try {
      translated = await translate(shieldedText);
    } catch {
      translated = shieldedText; // per-line best effort — keep the original
    }
    const restored = String(translated).replace(/⟦(\d+)⟧/g, (s, n) => shielded[Number(n)] ?? s);
    out.push(prefix + restored);
  }
  return out.join("\n");
}

// --- Per-site templates ---
// A template is { pattern, template }. pattern is a domain: "example.com"
// matches example.com and any subdomain; "*" matches every site. The first
// matching template replaces the default front-matter + body layout.

// Saved templates (empty array when unset or storage is unavailable).
async function getTemplates() {
  try {
    const stored = await chrome.storage.sync.get("templates");
    return Array.isArray(stored.templates) ? stored.templates : [];
  } catch {
    return [];
  }
}

// First template whose domain pattern matches the URL's host, or null.
function matchTemplate(templates, url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const t of templates || []) {
    if (!t?.pattern || !t?.template) continue;
    const p = t.pattern.trim().toLowerCase().replace(/^\*\./, "");
    if (p === "*" || host === p || host.endsWith("." + p)) return t;
  }
  return null;
}

// Fill {{variable}} placeholders; unknown variables render as "".
function renderTemplate(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (m, key) =>
    vars[key] != null ? String(vars[key]) : ""
  );
}

// Produce the final document for an extraction result: a matching per-site
// template wins; otherwise the standard front matter + body.
function applyTemplateOrDefault(result, enabled, templates) {
  // The popup sets result.url from the tab; the background worker doesn't,
  // so fall back to the page URL captured in meta.source.
  const tpl = matchTemplate(templates, result.url || result.meta?.source);
  if (!tpl) return assembleMarkdown(result, enabled);
  const meta = result.meta || {};
  const vars = {
    ...meta,
    tags: Array.isArray(meta.tags) ? meta.tags.join(", ") : meta.tags || "",
    content: result.body || "",
    frontmatter: buildFrontMatter(meta, enabled),
    date: String(meta.extracted || "").slice(0, 10),
  };
  return renderTemplate(tpl.template, vars);
}

// Load settings and build the output document for a result in one call.
async function buildOutput(result) {
  const [enabled, templates] = await Promise.all([getEnabledFields(), getTemplates()]);
  return applyTemplateOrDefault(result, enabled, templates);
}

// Above this encoded-URI length, sending via obsidian:// becomes unreliable
// (OS protocol-handler limits), so callers fall back to the clipboard.
const OBSIDIAN_URI_LIMIT = 30000;

// Build an obsidian://new URI that creates a note with the given content.
// vault is optional — Obsidian uses the last-focused vault when it's omitted.
function buildObsidianUri(title, content, vault) {
  const params = new URLSearchParams();
  if (vault) params.set("vault", vault);
  params.set("name", (title || "page").slice(0, 120));
  params.set("content", content);
  return `obsidian://new?${params.toString()}`;
}

// The user's optional default Obsidian vault name.
async function getObsidianVault() {
  try {
    const stored = await chrome.storage.sync.get("obsidianVault");
    return (stored.obsidianVault || "").trim();
  } catch {
    return "";
  }
}

// Whether the user opted in to on-device AI summaries (default off).
async function getAiSummaryEnabled() {
  try {
    const stored = await chrome.storage.sync.get("aiSummary");
    return stored.aiSummary === true;
  } catch {
    return false;
  }
}

// Whether the user opted in to on-device AI tags (default off).
async function getAiTagsEnabled() {
  try {
    const stored = await chrome.storage.sync.get("aiTags");
    return stored.aiTags === true;
  } catch {
    return false;
  }
}

// Parse a model's tag response into at most six clean, lowercase,
// hyphenated tags. Tolerates commas, newlines, bullets, and stray quotes.
function parseAiTags(text) {
  return String(text || "")
    .split(/[,\n]/)
    .map((t) =>
      t
        .replace(/^[\s\-*•#"'`\d.]+|[\s"'`.]+$/g, "")
        .toLowerCase()
        .replace(/\s+/g, "-")
    )
    .filter((t) => t.length >= 2 && t.length <= 40)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 6);
}

// Whether the user opted in to on-device AI boilerplate cleanup (default off).
async function getAiCleanupEnabled() {
  try {
    const stored = await chrome.storage.sync.get("aiCleanup");
    return stored.aiCleanup === true;
  } catch {
    return false;
  }
}

// --- On-device AI cleanup ---
// The model only ever *classifies* blocks as boilerplate; flagged blocks are
// dropped verbatim, never rewritten — so cleanup can't hallucinate or reword
// the user's content.

// Split a Markdown document into its front matter (kept opaque) and an array
// of blank-line-separated blocks. Fenced code blocks stay whole even when they
// contain blank lines.
function splitMarkdownBlocks(markdown) {
  const text = String(markdown);
  const fmMatch = text.match(/^---\n[\s\S]*?\n---\n+/);
  const frontMatter = fmMatch ? fmMatch[0] : "";
  const body = text.slice(frontMatter.length);

  const blocks = [];
  let current = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === "") {
      if (current.length) blocks.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return { frontMatter, blocks };
}

// Parse a model reply like "2, 5" / "none" / bulleted lines into unique,
// in-range block indexes. Tolerates prose around the numbers.
function parseBlockNumbers(text, count) {
  if (/^\s*none\b/i.test(String(text || ""))) return [];
  const seen = new Set();
  for (const m of String(text || "").match(/\d+/g) || []) {
    const n = Number(m);
    if (n >= 0 && n < count) seen.add(n);
  }
  return [...seen];
}

// Above this fraction of dropped characters, a cleanup verdict is judged
// over-aggressive (the model probably misread the page) and is discarded.
const CLEANUP_MAX_DROP_RATIO = 0.4;

// Remove the blocks the model flagged as boilerplate — conservatively.
// Fenced code blocks are never dropped, and if the flagged blocks add up to
// more than CLEANUP_MAX_DROP_RATIO of the document, the whole verdict is
// rejected. Returns { kept, dropped }.
function dropBoilerplateBlocks(blocks, dropIndexes) {
  const drop = new Set(
    (dropIndexes || []).filter(
      (i) => blocks[i] != null && !/^\s*(```|~~~)/.test(blocks[i])
    )
  );
  const totalChars = blocks.reduce((sum, b) => sum + b.length, 0);
  const droppedChars = [...drop].reduce((sum, i) => sum + blocks[i].length, 0);
  if (!drop.size || (totalChars && droppedChars / totalChars > CLEANUP_MAX_DROP_RATIO)) {
    return { kept: blocks, dropped: 0 };
  }
  return { kept: blocks.filter((_, i) => !drop.has(i)), dropped: drop.size };
}

// The user's optional webhook URL (empty string when unset).
async function getWebhookUrl() {
  try {
    const stored = await chrome.storage.sync.get("webhookUrl");
    return (stored.webhookUrl || "").trim();
  } catch {
    return "";
  }
}

// Validate a webhook URL: must parse and be https (localhost may be http).
// Returns the normalized href, or null if invalid.
function normalizeWebhookUrl(raw) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) return null;
  return url.href;
}

// POST the extracted document to the user's webhook as JSON. The caller must
// already hold host permission for the webhook's origin.
async function postToWebhook(webhookUrl, payload) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook responded ${res.status} ${res.statusText}`.trim());
}
