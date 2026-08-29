const SOURCE_NAMES = ["cloudflare", "ga4", "goatcounter"];
const VALID_STATUSES = new Set(["ok", "missing", "unavailable"]);

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== 1 || !validDate(snapshot.date)) {
    return "Expected a schemaVersion 1 snapshot with an ISO date";
  }
  if (!snapshot.generatedAt || Number.isNaN(Date.parse(snapshot.generatedAt))) {
    return "generatedAt must be an ISO timestamp";
  }
  if (snapshot.timezone !== "Asia/Tokyo") return "timezone must be Asia/Tokyo";
  for (const name of SOURCE_NAMES) {
    const source = snapshot.sources?.[name];
    if (!source || !VALID_STATUSES.has(source.status)) return `Invalid ${name} status`;
    if (!source.metrics || typeof source.metrics !== "object" || Array.isArray(source.metrics)) {
      return `Invalid ${name} metrics`;
    }
    for (const value of Object.values(source.metrics)) {
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        return `${name} metrics must contain finite numbers or null`;
      }
    }
  }
  return null;
}

async function listSnapshots(request, env) {
  const url = new URL(request.url);
  const requestedDays = Number.parseInt(url.searchParams.get("days") || "30", 10);
  const days = [7, 14, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const result = await env.ANALYTICS_DB.prepare(
    "SELECT payload, ingested_at FROM daily_snapshots ORDER BY date DESC LIMIT ?",
  ).bind(days).all();
  const rows = (result.results || []).map((row) => ({
    ...JSON.parse(row.payload),
    ingestedAt: row.ingested_at,
  })).reverse();
  return json({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Tokyo",
    requestedDays: days,
    snapshots: rows,
  }, 200, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
  });
}

async function ingestSnapshot(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  if (!env.INGEST_TOKEN || authorization !== `Bearer ${env.INGEST_TOKEN}`) return unauthorized();
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 100_000) return json({ error: "Payload too large" }, 413);
  let snapshot;
  try {
    snapshot = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const validationError = validateSnapshot(snapshot);
  if (validationError) return json({ error: validationError }, 400);
  await env.ANALYTICS_DB.prepare(`
    INSERT INTO daily_snapshots (
      date, generated_at, payload, cloudflare_status, ga4_status, goatcounter_status, ingested_at
    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(date) DO UPDATE SET
      generated_at = excluded.generated_at,
      payload = excluded.payload,
      cloudflare_status = excluded.cloudflare_status,
      ga4_status = excluded.ga4_status,
      goatcounter_status = excluded.goatcounter_status,
      ingested_at = CURRENT_TIMESTAMP
  `).bind(
    snapshot.date,
    snapshot.generatedAt,
    JSON.stringify(snapshot),
    snapshot.sources.cloudflare.status,
    snapshot.sources.ga4.status,
    snapshot.sources.goatcounter.status,
  ).run();
  return json({ ok: true, date: snapshot.date }, 202, { "Cache-Control": "no-store" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((url.pathname === "/analyse" || url.pathname.startsWith("/analyse/")) && ["GET", "HEAD"].includes(request.method)) {
      return Response.redirect(new URL(`/a/${url.search}`, url), 308);
    }
    if (url.pathname === "/api/analytics" && request.method === "GET") {
      return listSnapshots(request, env);
    }
    if (url.pathname === "/api/analytics/ingest" && request.method === "POST") {
      return ingestSnapshot(request, env);
    }
    return json({ error: "Not found" }, 404);
  },
};

export { validateSnapshot };
