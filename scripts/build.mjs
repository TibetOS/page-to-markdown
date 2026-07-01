#!/usr/bin/env node
// Build per-browser extension packages into dist/.
//
//   node scripts/build.mjs
//
// Produces:
//   dist/chrome/   + dist/page-to-markdown-chrome-v<version>.zip   (also loads on Edge)
//   dist/firefox/  + dist/page-to-markdown-firefox-v<version>.zip
//
// Chrome/Edge use the repo manifest as-is (MV3 service worker). Firefox gets a
// generated manifest: an event-page background (background.scripts) plus the
// browser_specific_settings block it requires.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

// Runtime files the extension needs (everything else — site/, store/, docs — is excluded).
const ASSETS = [
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "options.html",
  "options.js",
  "shared.js",
  "lib",
  "icons",
];

const GECKO_ID = "page-to-markdown@tibetos.github.io";
const GECKO_MIN_VERSION = "121.0";

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const { version } = manifest;

function copyAssets(targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const asset of ASSETS) {
    const src = path.join(root, asset);
    if (!fs.existsSync(src)) throw new Error(`Missing asset: ${asset}`);
    fs.cpSync(src, path.join(targetDir, asset), { recursive: true });
  }
}

// Firefox: MV3 background is an event page (scripts), not a service worker, so
// shared.js must be listed before background.js. Also add the gecko settings.
function toFirefoxManifest(base) {
  const ff = structuredClone(base);
  ff.background = { scripts: ["shared.js", "background.js"] };
  ff.browser_specific_settings = {
    gecko: { id: GECKO_ID, strict_min_version: GECKO_MIN_VERSION },
  };
  return ff;
}

function zipDir(dir, zipPath) {
  fs.rmSync(zipPath, { force: true });
  // Zip the *contents* of dir (so the manifest sits at the archive root).
  execSync(`cd "${dir}" && zip -qr -X "${zipPath}" .`);
}

function build(name, manifestObj) {
  const targetDir = path.join(dist, name);
  fs.rmSync(targetDir, { recursive: true, force: true });
  copyAssets(targetDir);
  fs.writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifestObj, null, 2) + "\n");
  const zipPath = path.join(dist, `page-to-markdown-${name}-v${version}.zip`);
  zipDir(targetDir, zipPath);
  console.log(`✓ ${name}: ${path.relative(root, zipPath)}`);
}

fs.mkdirSync(dist, { recursive: true });
build("chrome", manifest);
build("firefox", toFirefoxManifest(manifest));
console.log(`\nBuilt v${version} for chrome (+ Edge) and firefox.`);
