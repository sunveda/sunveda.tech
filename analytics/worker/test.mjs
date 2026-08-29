import assert from "node:assert/strict";
import worker, { validateSnapshot } from "./src/index.mjs";

const snapshot = {
  schemaVersion: 1,
  date: "2026-08-29",
  generatedAt: "2026-08-30T00:00:00.000Z",
  timezone: "Asia/Tokyo",
  sources: {
    cloudflare: { status: "ok", metrics: { requests: 20 }, breakdowns: {} },
    ga4: { status: "missing", metrics: { sessions: null }, breakdowns: {} },
    goatcounter: { status: "unavailable", metrics: { visits: null }, breakdowns: {} },
  },
};

assert.equal(validateSnapshot(snapshot), null);
assert.match(validateSnapshot({ ...snapshot, date: "yesterday" }), /ISO date/);
assert.match(validateSnapshot({ ...snapshot, sources: { ...snapshot.sources, ga4: { status: "ok", metrics: { sessions: Infinity } } } }), /finite numbers/);

const unauthorized = await worker.fetch(new Request("https://sunveda.tech/api/analytics/ingest", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(snapshot),
}), { ANALYTICS_DB: {}, INGEST_TOKEN: "secret" });
assert.equal(unauthorized.status, 401);

const notFound = await worker.fetch(new Request("https://sunveda.tech/api/unknown"), {});
assert.equal(notFound.status, 404);

const redirect = await worker.fetch(new Request("https://sunveda.tech/analyse/?days=7"), {});
assert.equal(redirect.status, 308);
assert.equal(redirect.headers.get("Location"), "https://sunveda.tech/a/?days=7");

const headRedirect = await worker.fetch(new Request("https://sunveda.tech/analyse/", { method: "HEAD" }), {});
assert.equal(headRedirect.status, 308);

console.log("worker tests passed");
