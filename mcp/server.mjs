#!/usr/bin/env node
// Page to Markdown — MCP bridge.
//
// A zero-dependency Model Context Protocol server (stdio transport) that
// exposes your clipped .md files to local AI tools — Claude Desktop, Claude
// Code, Cursor, or any MCP client — so an agent can list, read, and search
// the pages you've extracted.
//
// Usage:
//   node mcp/server.mjs [--dir <clips-directory>]
//
// The clips directory defaults to $P2M_CLIPS_DIR, then ~/Downloads. Only
// files that look like Page to Markdown clips are exposed: *.md starting
// with a YAML front-matter block that contains a `source:` field. Everything
// runs locally; nothing is sent anywhere.
//
// Example Claude Code registration:
//   claude mcp add page-to-markdown -- node /path/to/repo/mcp/server.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "page-to-markdown", version: "1.0.0" };
const MAX_LIST = 50;
const MAX_SEARCH_SNIPPET = 200;

function clipsDir() {
  const argIndex = process.argv.indexOf("--dir");
  if (argIndex !== -1 && process.argv[argIndex + 1]) {
    return path.resolve(process.argv[argIndex + 1]);
  }
  if (process.env.P2M_CLIPS_DIR) return path.resolve(process.env.P2M_CLIPS_DIR);
  return path.join(os.homedir(), "Downloads");
}

const DIR = clipsDir();

// Parse the leading YAML front-matter block into a flat {key: value} object
// (our clips only emit quoted scalars and flow lists, so a line regex is
// enough — no YAML library needed).
function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  const block = text.slice(4, end);
  const meta = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^(\w+):\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (m) meta[m[1]] = m[2].replace(/\\(.)/g, "$1");
  }
  return meta;
}

// A file counts as a clip when it has front matter with a source field.
function loadClip(file) {
  try {
    const full = path.join(DIR, file);
    const stat = fs.statSync(full);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return null;
    const text = fs.readFileSync(full, "utf8");
    const meta = parseFrontMatter(text);
    if (!meta || !meta.source) return null;
    return { file, meta, text, mtime: stat.mtimeMs };
  } catch {
    return null;
  }
}

function scanClips() {
  let entries;
  try {
    entries = fs.readdirSync(DIR);
  } catch {
    return [];
  }
  return entries
    .filter((f) => f.endsWith(".md"))
    .map(loadClip)
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

// --- Tools ---

const TOOLS = [
  {
    name: "list_clips",
    description:
      "List pages clipped with Page to Markdown (most recent first). Returns filename, title, source URL, and timestamps.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: `Max results (default 20, max ${MAX_LIST})` },
      },
    },
  },
  {
    name: "read_clip",
    description: "Read the full Markdown of one clip by its filename (as returned by list_clips).",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Clip filename, e.g. my-article.md" } },
      required: ["name"],
    },
  },
  {
    name: "search_clips",
    description: "Case-insensitive text search across all clips' titles and contents. Returns matching files with snippets.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for" },
        limit: { type: "number", description: `Max results (default 10, max ${MAX_LIST})` },
      },
      required: ["query"],
    },
  },
];

function listClips(args) {
  const limit = Math.min(Math.max(1, args?.limit || 20), MAX_LIST);
  const clips = scanClips().slice(0, limit);
  if (!clips.length) return `No clips found in ${DIR}. Extract a page with the extension first.`;
  return clips
    .map((c) =>
      [
        `file: ${c.file}`,
        `title: ${c.meta.title || "(untitled)"}`,
        `source: ${c.meta.source}`,
        c.meta.published ? `published: ${c.meta.published}` : null,
        `extracted: ${c.meta.extracted || new Date(c.mtime).toISOString()}`,
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

function readClip(args) {
  const name = String(args?.name || "");
  // Basename-only: no path traversal out of the clips directory.
  if (!name || name !== path.basename(name) || !name.endsWith(".md")) {
    throw new Error("Invalid clip name — pass a filename returned by list_clips.");
  }
  const clip = loadClip(name);
  if (!clip) throw new Error(`No clip named "${name}" in ${DIR}.`);
  return clip.text;
}

function searchClips(args) {
  const query = String(args?.query || "").toLowerCase();
  if (!query) throw new Error("query is required.");
  const limit = Math.min(Math.max(1, args?.limit || 10), MAX_LIST);
  const hits = [];
  for (const clip of scanClips()) {
    const haystack = clip.text.toLowerCase();
    const at = haystack.indexOf(query);
    if (at === -1) continue;
    const start = Math.max(0, at - 60);
    const snippet = clip.text
      .slice(start, start + MAX_SEARCH_SNIPPET)
      .replace(/\s+/g, " ")
      .trim();
    hits.push(`file: ${clip.file}\ntitle: ${clip.meta.title || "(untitled)"}\nsnippet: …${snippet}…`);
    if (hits.length >= limit) break;
  }
  return hits.length ? hits.join("\n\n") : `No clips matching "${args.query}".`;
}

function callTool(name, args) {
  if (name === "list_clips") return listClips(args);
  if (name === "read_clip") return readClip(args);
  if (name === "search_clips") return searchClips(args);
  throw new Error(`Unknown tool: ${name}`);
}

// --- JSON-RPC 2.0 over newline-delimited stdio (MCP stdio transport) ---

function send(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

function handle(request) {
  const { id, method, params } = request;
  const isNotification = id === undefined || id === null;

  try {
    if (method === "initialize") {
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
    } else if (method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (method === "tools/call") {
      try {
        const text = callTool(params?.name, params?.arguments || {});
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
      } catch (err) {
        send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true },
        });
      }
    } else if (!isNotification) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
    }
    // Notifications (e.g. notifications/initialized) need no response.
  } catch (err) {
    if (!isNotification) {
      send({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } });
    }
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let request;
  try {
    request = JSON.parse(trimmed);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }
  handle(request);
});
rl.on("close", () => process.exit(0));
