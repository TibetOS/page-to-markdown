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
const FRONT_MATTER_FIELDS = ["title", "author", "source", "site", "published", "lang", "excerpt", "extracted"];
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

// Build a YAML front-matter block from a metadata object, honouring which
// fields are enabled and skipping any that are absent. Returns "" if nothing
// would be emitted.
function buildFrontMatter(meta, enabled) {
  const on = enabled || DEFAULT_FIELDS;
  const lines = FRONT_MATTER_FIELDS.filter((key) => on[key] !== false)
    .map((key) => [key, meta?.[key]])
    .filter(([, value]) => value != null && String(value).trim() !== "")
    .map(([key, value]) => `${key}: ${yamlString(value)}`);
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
