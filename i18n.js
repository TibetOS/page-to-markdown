// Minimal i18n for extension pages. Static text is declared in the HTML via
// data-i18n attributes and resolved from _locales at load; dynamic strings go
// through t(). Loaded before shared.js/popup.js/options.js.

// Message lookup for dynamic strings. Falls back to the key itself so a
// missing entry is visible in the UI rather than silently blank.
function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

// Localize the page: set the document language and direction (Hebrew renders
// RTL), then fill in every element that declares a message key.
// data-i18n → textContent, data-i18n-placeholder → placeholder,
// data-i18n-aria → aria-label.
function applyI18n() {
  document.documentElement.lang = chrome.i18n.getMessage("@@ui_locale").replace(/_/g, "-");
  document.documentElement.dir = chrome.i18n.getMessage("@@bidi_dir");
  for (const el of document.querySelectorAll("[data-i18n]")) {
    const msg = chrome.i18n.getMessage(el.dataset.i18n);
    if (msg) el.textContent = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) {
    const msg = chrome.i18n.getMessage(el.dataset.i18nPlaceholder);
    if (msg) el.placeholder = msg;
  }
  for (const el of document.querySelectorAll("[data-i18n-aria]")) {
    const msg = chrome.i18n.getMessage(el.dataset.i18nAria);
    if (msg) el.setAttribute("aria-label", msg);
  }
}
