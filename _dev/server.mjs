// Local preview server: serves the dashboard and swaps the Firebase SDK for _dev/firebase-stub.js (a fake
// signed-in admin with canned callable data). Nothing reaches Firebase. Not published by GitHub Pages (Jekyll
// skips underscore folders).
// Usage (from the repo root): node _dev/server.mjs [port]   → http://localhost:4311/?scenario=default
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const harness = fileURLToPath(new URL(".", import.meta.url));
const root = fileURLToPath(new URL("..", import.meta.url));
const port = Number(process.argv[2] || 4311);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const SDK = /https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/firebase-(app|auth|functions)\.js/g;

createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let path = decodeURIComponent(url.pathname);
  const base = path.startsWith("/__harness/") ? harness : root;
  if (path.startsWith("/__harness/")) path = path.slice("/__harness".length);
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(base, path));
  if (!file.startsWith(normalize(base))) {
    response.writeHead(403).end();
    return;
  }
  try {
    let body = await readFile(file);
    const type = types[extname(file)] || "application/octet-stream";
    if (type === "text/javascript" && base === root) body = Buffer.from(body.toString("utf8").replace(SDK, "/__harness/firebase-stub.js"));
    response.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
  }
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
