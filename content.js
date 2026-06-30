// Content script — injected into the active tab.
// Grabs the page HTML, runs Readability to extract the article,
// then converts the clean HTML to Markdown via Turndown.

(() => {
  // Readability needs a cloned document so it doesn't mutate the live page
  const docClone = document.cloneNode(true);
  const article = new Readability(docClone).parse();

  if (!article) {
    return { success: false, error: "Could not extract article content from this page." };
  }

  const turndownService = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // Keep code blocks intact
  turndownService.addRule("pre", {
    filter: "pre",
    replacement: (content, node) => {
      const lang = node.querySelector("code")?.className?.match(/language-(\w+)/)?.[1] || "";
      const code = node.textContent;
      return `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
    },
  });

  let markdown = turndownService.turndown(article.content);

  // Deduplicate images — keep only the first occurrence of each URL
  const seenImages = new Set();
  markdown = markdown.replace(/!\[[^\]]*\]\(([^)]+)\)/g, (match, url) => {
    if (seenImages.has(url)) return "";
    seenImages.add(url);
    return match;
  });

  // Remove UI artifacts that leak through Readability (e.g. "7 צפייה בגלריה", "live")
  markdown = markdown.replace(/^\d+\s+צפייה בגלריה\s*$/gm, "");
  markdown = markdown.replace(/^live\s*$/gm, "");

  // Clean up excessive blank lines left after removals
  markdown = markdown.replace(/\n{3,}/g, "\n\n");

  // Serialize a value as a safe double-quoted YAML scalar. Escapes
  // backslashes/quotes, turns newlines & tabs into escape sequences, and
  // drops other control characters — so titles with ":", quotes, or line
  // breaks can't produce invalid YAML front matter.
  const yamlString = (value) =>
    `"${String(value ?? "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/[\u0000-\u001F]/g, "")}"`;

  // Build the front matter from whatever metadata Readability surfaced,
  // emitting only fields that are actually present.
  const fields = [
    ["title", article.title || document.title],
    ["author", article.byline],
    ["source", location.href],
    ["site", article.siteName],
    ["published", article.publishedTime],
    ["lang", article.lang || document.documentElement.lang],
    ["excerpt", article.excerpt],
    ["extracted", new Date().toISOString()],
  ];

  const frontMatter =
    "---\n" +
    fields
      .filter(([, value]) => value != null && String(value).trim() !== "")
      .map(([key, value]) => `${key}: ${yamlString(value)}`)
      .join("\n") +
    "\n---\n\n";

  return {
    success: true,
    markdown: frontMatter + markdown,
    title: article.title || document.title || "page",
  };
})();
