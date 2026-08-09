import assert from "node:assert/strict";
import { addDays, renderMarkdown, utcRangeForTokyoDate } from "./collect.mjs";

assert.equal(addDays("2026-01-01", -1), "2025-12-31");
assert.deepEqual(utcRangeForTokyoDate("2026-08-09"), {
  start: "2026-08-08T15:00:00.000Z",
  end: "2026-08-09T15:00:00.000Z",
});

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

console.log("analytics tests passed");
