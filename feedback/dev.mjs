import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function localWorker({ persist = false, port = 8788 } = {}) {
  const mf = new Miniflare({
    modules: true,
    scriptPath: resolve(root, "feedback/worker/src/index.mjs"),
    compatibilityDate: "2026-07-30",
    d1Databases: ["FEEDBACK_DB"],
    r2Buckets: ["FEEDBACK_VIDEOS"],
    ...(persist
      ? {
          d1Persist: resolve(root, ".feedback-local/d1"),
          r2Persist: resolve(root, ".feedback-local/r2"),
        }
      : {}),
    bindings: {
      PUBLIC_ORIGIN: `http://localhost:${port}`,
      DEV_MODE: "true",
      VIDEO_ENABLED: "true",
      SESSION_SECRET: "local-development-session-secret-do-not-deploy",
      ADMIN_PASSWORD: "local-development-host-password-do-not-deploy",
    },
  });
  const db = await mf.getD1Database("FEEDBACK_DB");
  const existing = await db
    .prepare("SELECT name FROM sqlite_master WHERE name='responses'")
    .first();
  if (!existing) {
    const sql = await readFile(
      resolve(root, "feedback/worker/migrations/0001_feedback.sql"),
      "utf8",
    );
    for (const statement of sql.split(";").filter((s) => s.trim()))
      await db.prepare(statement).run();
  }
  return mf;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8788),
    mf = await localWorker({ persist: true, port });
  const types = {
    ".html": "text/html",
    ".mjs": "text/javascript",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".png": "image/png",
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      if (url.pathname.startsWith("/api/feedback/")) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const response = await mf.dispatchFetch(url.href, {
          method: req.method,
          headers: req.headers,
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
        return;
      }
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith("/")) path += "index.html";
      const file = resolve(root, `.${path}`);
      if (
        !file.startsWith(root) ||
        path.split("/").some((segment) => segment.startsWith(".")) ||
        path.startsWith("/feedback/worker/")
      ) {
        res.writeHead(404);
        res.end();
        return;
      }
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": types[extname(file)] || "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }).listen(port, "127.0.0.1", () =>
    console.log(
      `Feedback preview: http://localhost:${port}/feedback/\nLocal host password: local-development-host-password-do-not-deploy`,
    ),
  );
  process.on("SIGINT", async () => {
    server.close();
    await mf.dispose();
    process.exit();
  });
}
