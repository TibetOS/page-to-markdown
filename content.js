// Content script — injected into the active tab.
// Extracts the article with Defuddle (multi-pass pipeline + site-specific
// extractors), falling back to Mozilla Readability when Defuddle is
// unavailable or returns something too thin, then converts the clean HTML
// to Markdown via Turndown.

(() => {
  // Below this many words, treat a Defuddle result as a miss and let
  // Readability have a go — guards against extractor edge cases returning
  // just a caption or a nav fragment.
  const MIN_DEFUDDLE_WORDS = 40;

  // Both engines need a cloned document so they don't mutate the live page.
  let article = null;
  let engine = null;

  try {
    if (typeof Defuddle !== "undefined") {
      const d = new Defuddle(document.cloneNode(true), { url: location.href }).parse();
      if (d?.content && (d.wordCount || 0) >= MIN_DEFUDDLE_WORDS) {
        engine = "defuddle";
        article = {
          content: d.content,
          title: d.title,
          byline: d.author,
          siteName: d.site,
          publishedTime: d.published,
          lang: d.language,
          excerpt: d.description,
        };
      }
    }
  } catch (e) {
    // Fall through to Readability.
  }

  if (!article) {
    const parsed = new Readability(document.cloneNode(true)).parse();
    if (parsed) {
      engine = "readability";
      article = parsed;
    }
  }

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
    // Defuddle's standardized math carries the TeX in a data-latex attribute.
    const dataLatex = node.getAttribute?.("data-latex");
    if (dataLatex) return dataLatex.trim();
    // KaTeX (and annotated MathML) embed it in an annotation element; after
    // Defuddle's cleanup the encoding attribute may be stripped, so accept
    // any annotation.
    const annotation =
      node.querySelector?.('annotation[encoding="application/x-tex"]') ||
      node.querySelector?.("annotation");
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
    // MathML is a foreign namespace, so <math> keeps a lowercase nodeName —
    // compare case-insensitively.
    filter: (node) => {
      const name = String(node.nodeName || "").toUpperCase();
      return (
        name === "MJX-CONTAINER" ||
        name === "MATH" ||
        !!node.classList?.contains?.("katex-display") ||
        !!node.classList?.contains?.("katex")
      );
    },
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

  // Return the body plus the raw metadata the engine surfaced. Front-matter
  // assembly (and which fields to include) is handled by the caller via
  // shared.js, so it can honour the user's field settings.
  const publishedMeta = document.querySelector(
    'meta[property="article:published_time"], meta[name="publish-date"], meta[itemprop="datePublished"]'
  )?.content;

  return {
    success: true,
    engine,
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
