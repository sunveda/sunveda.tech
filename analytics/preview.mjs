#!/usr/bin/env node

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const port = Number(process.env.PORT || 8765);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json" };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/analytics") {
      const upstream = await fetch(`https://sunveda.tech/api/analytics${url.search}`);
      response.writeHead(upstream.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(Buffer.from(await upstream.arrayBuffer()));
      return;
    }
    const pathname = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const filename = resolve(root, `.${pathname}`);
    if (!filename.startsWith(`${root}${sep}`)) throw new Error("Invalid path");
    const content = await readFile(filename);
    response.writeHead(200, { "Content-Type": types[extname(filename)] || "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`SunVeda analytics preview: http://127.0.0.1:${port}/a/\n`);
});
