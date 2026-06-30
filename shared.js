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

// Build token-lean Markdown for pasting into an AI chat: no front matter,
// no images, with a title + source line so the model knows the provenance.
function buildLeanMarkdown(markdown, title, url) {
  const body = stripImages(stripFrontMatter(markdown)).trim();
  return `# ${title || "Untitled"}\nSource: ${url || ""}\n\n${body}`;
}
