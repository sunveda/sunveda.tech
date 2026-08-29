import assert from "node:assert/strict";
import { addDays, cleanPath, comparisonDates, normalizeSnapshot, renderMarkdown, targetDateFromArgs, utcRangeForTokyoDate, validIsoDate } from "./collect.mjs";
import { parseMarkdownReport } from "./import-reports.mjs";

assert.equal(addDays("2026-01-01", -1), "2025-12-31");
assert.deepEqual(utcRangeForTokyoDate("2026-08-09"), {
  start: "2026-08-08T15:00:00.000Z",
  end: "2026-08-09T15:00:00.000Z",
});
assert.equal(validIsoDate("2026-08-24"), true);
assert.equal(validIsoDate("2026-02-30"), false);
assert.equal(targetDateFromArgs(["--date", "2026-08-24"]), "2026-08-24");
assert.deepEqual(comparisonDates("2026-08-24"), {
  yesterday: "2026-08-24",
  previousDay: "2026-08-23",
  previousWeek: "2026-08-17",
});
assert.equal(cleanPath("/?fbclid=secret#part"), "/");

const markdown = renderMarkdown({
  dates: { yesterday: "2026-08-08", previousDay: "2026-08-07", previousWeek: "2026-08-01" },
  sources: {
    cloudflare: { ok: false, error: "not configured" },
    ga4: { ok: false, error: "not configured" },
    goatcounter: { ok: false, error: "not configured" },
  },
});
assert.match(markdown, /SunVeda Daily Website Analytics/);
assert.match(markdown, /Cloudflare/);
assert.match(markdown, /Google Analytics 4/);
assert.match(markdown, /GoatCounter/);

const snapshot = normalizeSnapshot({
  generatedAt: "2026-08-09T00:00:00.000Z",
  timezone: "Asia/Tokyo",
  dates: { yesterday: "2026-08-08", previousDay: "2026-08-07", previousWeek: "2026-08-01" },
  sources: {
    cloudflare: { ok: true, data: { byDate: { "2026-08-08": { sum: { requests: 10, cachedRequests: 2, bytes: 1000, pageViews: 3, threats: 1 }, uniq: { uniques: 4 } } } } },
    ga4: { ok: true, data: { byDate: { "2026-08-08": { activeUsers: 2, sessions: 3 } }, landingPages: [{ landingPagePlusQueryString: "/?x=1", sessions: 3 }] } },
    goatcounter: { ok: false, error: "not found" },
  },
});
assert.equal(snapshot.sources.cloudflare.metrics.cacheHitRatio, 0.2);
assert.deepEqual(snapshot.sources.ga4.breakdowns.landingPages, [{ label: "/", value: 3 }]);
assert.equal(snapshot.sources.goatcounter.status, "unavailable");

const zeroDay = normalizeSnapshot({
  generatedAt: "2026-08-26T00:00:00.000Z",
  timezone: "Asia/Tokyo",
  dates: { yesterday: "2026-08-25", previousDay: "2026-08-24", previousWeek: "2026-08-18" },
  sources: {
    cloudflare: { ok: true, data: { byDate: {} } },
    ga4: { ok: true, data: { byDate: {} } },
    goatcounter: { ok: true, data: { totals: { yesterday: { total: 0 } } } },
  },
});
assert.equal(zeroDay.sources.cloudflare.status, "ok");
assert.equal(zeroDay.sources.cloudflare.metrics.requests, 0);
assert.equal(zeroDay.sources.ga4.status, "ok");
assert.equal(zeroDay.sources.ga4.metrics.sessions, 0);

const imported = parseMarkdownReport(`# SunVeda Daily Website Analytics — 2026-08-10

## Cloudflare HTTP Traffic

- Requests: 1,234 (+1.0% day/day; n/a week/week)
- Unique clients: 50
- Bandwidth: 2.5 MB
- Cache hit ratio: 10.0%
- Threats: 2

## Google Analytics 4

- Active users: 9 (n/a day/day; n/a week/week)
- Sessions: 19; engaged sessions: 4; engagement rate: 21.1%
- Views: 30; key events: 1
- Top landing pages: /?fbclid=secret (8), /contact (2)
- Channels: Direct (10)
- Countries: Japan (7)

## GoatCounter

Unavailable: 404 Not Found
`);
assert.equal(imported.sources.cloudflare.metrics.requests, 1234);
assert.equal(imported.sources.ga4.metrics.engagedSessions, 4);
assert.equal(imported.sources.ga4.breakdowns.landingPages[0].label, "/");
assert.equal(imported.sources.ga4.breakdowns.landingPages[0].value, 8);
assert.equal(imported.sources.goatcounter.status, "unavailable");

console.log("analytics tests passed");
