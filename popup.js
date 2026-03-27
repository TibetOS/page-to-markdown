const btn = document.getElementById("btn");
const status = document.getElementById("status");

btn.addEventListener("click", async () => {
  btn.disabled = true;
  btn.textContent = "Extracting...";
  status.textContent = "";
  status.className = "";

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) throw new Error("No active tab found.");

    // Inject Readability + Turndown + our content script into the page
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["lib/Readability.js", "lib/turndown.js", "content.js"],
    });

    const result = results?.[results.length - 1]?.result;

    if (!result?.success) {
      throw new Error(result?.error || "Extraction failed — page may not have article content.");
    }

    // Sanitize the title for a filename
    const filename =
      result.title
        .replace(/[^a-zA-Z0-9\u0590-\u05FF\s-]/g, "") // keep Hebrew chars too
        .replace(/\s+/g, "-")
        .toLowerCase()
        .slice(0, 80) + ".md";

    // Trigger download via a Blob URL
    const blob = new Blob([result.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);

    status.textContent = `Downloaded: ${filename}`;
    status.className = "success";
  } catch (err) {
    status.textContent = err.message;
    status.className = "error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Extract .md";
  }
});
