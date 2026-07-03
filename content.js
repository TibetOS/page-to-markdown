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

  // --- Math (KaTeX / MathJax / MathML) → LaTeX delimiters ---
  // KaTeX and MathML embed the original TeX as an <annotation> element;
  // recover it so formulas survive as $...$ / $$...$$ instead of collapsing
  // into rendered-glyph soup.

  const extractTex = (node) => {
    const annotation = node.querySelector?.('annotation[encoding="application/x-tex"]');
    if (annotation?.textContent) return annotation.textContent.trim();
    // MathJax v3 keeps no TeX; its assistive MathML text is the best we have.
    const assistive = node.querySelector?.("mjx-assistive-mml");
    if (assistive?.textContent) return assistive.textContent.trim();
    return null;
  };

  const isDisplayMath = (node) =>
    !!(
      node.classList?.contains("katex-display") ||
      node.getAttribute?.("display") === "block" ||
      node.getAttribute?.("display") === "true" ||
      node.closest?.(".katex-display")
    );

  turndownService.addRule("math", {
    filter: (node) =>
      node.nodeName === "MJX-CONTAINER" ||
      node.nodeName === "MATH" ||
      !!node.classList?.contains?.("katex-display") ||
      !!node.classList?.contains?.("katex"),
    replacement: (content, node) => {
      const tex = extractTex(node);
      if (!tex) return content; // nothing recoverable — keep Turndown's default
      const oneLine = tex.replace(/\s*\n\s*/g, " ");
      return isDisplayMath(node) ? `\n\n$$\n${tex}\n$$\n\n` : `$${oneLine}$`;
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

  // Return the body plus the raw metadata Readability surfaced. Front-matter
  // assembly (and which fields to include) is handled by the caller via
  // shared.js, so it can honour the user's field settings.
  const publishedMeta = document.querySelector(
    'meta[property="article:published_time"], meta[name="publish-date"], meta[itemprop="datePublished"]'
  )?.content;

  return {
    success: true,
    body: markdown,
    title: article.title || document.title || "page",
    meta: {
      title: article.title || document.title,
      author: article.byline,
      source: location.href,
      site: article.siteName,
      published: article.publishedTime || publishedMeta,
      lang: article.lang || document.documentElement?.lang,
      excerpt: article.excerpt,
      extracted: new Date().toISOString(),
    },
  };
})();
