#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KEYCHAIN_PREFIX = "sunveda.analytics.";
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || "549196538";
const GOATCOUNTER_BASE_URL = "https://sunveda.goatcounter.com";

function keychainSecret(name) {
  if (process.env[name]) return process.env[name];
  try {
    const value = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", `${KEYCHAIN_PREFIX}${name}`, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    // The macOS security CLI hex-encodes multiline passwords such as JSON keys.
    if (value.length % 2 === 0 && /^7b[0-9a-f]+$/i.test(value)) {
      return Buffer.from(value, "hex").toString("utf8");
    }
    return value;
  } catch {
    throw new Error(`Missing ${name}; add it to environment variables or macOS Keychain`);
  }
}

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function tokyoDate(offsetDays = 0) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

function comparisonDates() {
  const yesterday = tokyoDate(-1);
  return {
    yesterday,
    previousDay: addDays(yesterday, -1),
    previousWeek: addDays(yesterday, -7),
  };
}

function utcRangeForTokyoDate(date) {
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${addDays(date, 1)}T00:00:00+09:00`).toISOString(),
  };
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.text();
  let data;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    data = body;
  }
  if (!response.ok) {
    const detail = typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data).slice(0, 300);
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return data;
}

async function cloudflareReport(dates) {
  const token = keychainSecret("CF_API_TOKEN");
  const zoneTag = keychainSecret("CF_ZONE_TAG");
  const query = `query DailyTraffic($zoneTag: string, $start: Date, $end: Date) {
    viewer {
      zones(filter: { zoneTag: $zoneTag }) {
        httpRequests1dGroups(
          limit: 10
          filter: { date_geq: $start, date_leq: $end }
          orderBy: [date_ASC]
        ) {
          dimensions { date }
          sum { requests cachedRequests bytes cachedBytes pageViews threats }
          uniq { uniques }
        }
      }
    }
  }`;
  const data = await fetchJson("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: { zoneTag, start: dates.previousWeek, end: dates.yesterday },
    }),
  });
  if (data.errors?.length) throw new Error(data.errors.map((item) => item.message).join("; "));
  const rows = data.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const byDate = Object.fromEntries(rows.map((row) => [row.dimensions.date, row]));
  return { byDate };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(unsigned), createPrivateKey(serviceAccount.private_key)).toString("base64url");
  const token = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  return token.access_token;
}

async function ga4RunReport(accessToken, body) {
  return fetchJson(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
}

function parseGaRows(response) {
  const dimensions = response.dimensionHeaders?.map((item) => item.name) || [];
  const metrics = response.metricHeaders?.map((item) => item.name) || [];
  return (response.rows || []).map((row) => ({
    ...Object.fromEntries(dimensions.map((name, index) => [name, row.dimensionValues?.[index]?.value])),
    ...Object.fromEntries(metrics.map((name, index) => [name, Number(row.metricValues?.[index]?.value || 0)])),
  }));
}

async function ga4Report(dates) {
  const serviceAccount = JSON.parse(keychainSecret("GA_SERVICE_ACCOUNT_JSON"));
  const accessToken = await googleAccessToken(serviceAccount);
  const metrics = [
    "activeUsers",
    "newUsers",
    "sessions",
    "engagedSessions",
    "engagementRate",
    "userEngagementDuration",
    "screenPageViews",
    "keyEvents",
  ].map((name) => ({ name }));
  const daily = await ga4RunReport(accessToken, {
    dateRanges: [{ startDate: dates.previousWeek, endDate: dates.yesterday }],
    dimensions: [{ name: "date" }],
    metrics,
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });
  const detailRequests = [
    ["landingPages", "landingPagePlusQueryString", "sessions"],
    ["channels", "sessionDefaultChannelGroup", "sessions"],
    ["countries", "country", "activeUsers"],
    ["devices", "deviceCategory", "activeUsers"],
    ["pages", "pagePath", "screenPageViews"],
  ];
  const detailEntries = await Promise.all(detailRequests.map(async ([key, dimension, metric]) => {
    const response = await ga4RunReport(accessToken, {
      dateRanges: [{ startDate: dates.yesterday, endDate: dates.yesterday }],
      dimensions: [{ name: dimension }],
      metrics: [{ name: metric }],
      orderBys: [{ metric: { metricName: metric }, desc: true }],
      limit: 8,
    });
    return [key, parseGaRows(response)];
  }));
  const dailyRows = parseGaRows(daily);
  return {
    byDate: Object.fromEntries(dailyRows.map((row) => {
      const date = `${row.date.slice(0, 4)}-${row.date.slice(4, 6)}-${row.date.slice(6, 8)}`;
      return [date, row];
    })),
    ...Object.fromEntries(detailEntries),
  };
}

async function goatcounterGet(token, path, params) {
  const url = new URL(`${GOATCOUNTER_BASE_URL}/api/v0/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

async function goatcounterReport(dates) {
  const token = keychainSecret("GOATCOUNTER_API_TOKEN");
  const totals = [];
  for (const [key, date] of Object.entries(dates)) {
    const range = utcRangeForTokyoDate(date);
    const data = await goatcounterGet(token, "stats/total", range);
    totals.push([key, data]);
    await delay(250);
  }
  const range = utcRangeForTokyoDate(dates.yesterday);
  const details = [];
  for (const [key, path, limit] of [
    ["pages", "stats/hits", 8],
    ["referrers", "stats/toprefs", 8],
    ["campaigns", "stats/campaigns", 8],
    ["browsers", "stats/browsers", 6],
    ["systems", "stats/systems", 6],
    ["locations", "stats/locations", 8],
    ["sizes", "stats/sizes", 6],
  ]) {
    details.push([key, await goatcounterGet(token, path, { ...range, limit })]);
    await delay(250);
  }
  return { totals: Object.fromEntries(totals), ...Object.fromEntries(details) };
}

function safeError(error) {
  return String(error?.message || error).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

async function capture(source, operation) {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    return { ok: false, error: safeError(error), source };
  }
}

function delta(current, baseline) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null;
  return ((current - baseline) / baseline) * 100;
}

function fmt(value, digits = 0) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function fmtDelta(value) {
  if (!Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function listRows(rows, labelKey, valueKey) {
  if (!rows?.length) return "No data";
  return rows.slice(0, 5).map((row) => `${row[labelKey] || "(unknown)"} (${fmt(row[valueKey])})`).join(", ");
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanPath(value) {
  if (!value || value === "(unknown)") return "(unknown)";
  try {
    const url = new URL(value, "https://sunveda.tech");
    return url.origin === "https://sunveda.tech" ? url.pathname : url.hostname;
  } catch {
    return String(value).split(/[?#]/, 1)[0] || "/";
  }
}

function normalizedRows(rows, labelKey, valueKey, { path = false } = {}) {
  if (!Array.isArray(rows)) return [];
  const totals = new Map();
  for (const row of rows) {
    const rawLabel = row?.[labelKey] || "(unknown)";
    const label = path ? cleanPath(rawLabel) : String(rawLabel);
    const value = finiteOrNull(row?.[valueKey]);
    if (value === null) continue;
    totals.set(label, (totals.get(label) || 0) + value);
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function sourceSnapshot(source, metrics, breakdowns = {}) {
  if (!source.ok) return { status: "unavailable", metrics, breakdowns };
  const available = Object.values(metrics).some((value) => value !== null);
  return { status: available ? "ok" : "missing", metrics, breakdowns };
}

function normalizeSnapshot(report) {
  const { dates, sources } = report;
  const cloudflareRow = sources.cloudflare.ok
    ? sources.cloudflare.data.byDate[dates.yesterday]
    : null;
  const cloudflareSum = cloudflareRow?.sum || {};
  const requests = finiteOrNull(cloudflareSum.requests);
  const cachedRequests = finiteOrNull(cloudflareSum.cachedRequests);
  const cloudflareMetrics = {
    requests,
    uniqueClients: finiteOrNull(cloudflareRow?.uniq?.uniques),
    bandwidthBytes: finiteOrNull(cloudflareSum.bytes),
    cachedRequests,
    cacheHitRatio: requests && cachedRequests !== null ? cachedRequests / requests : null,
    pageViews: finiteOrNull(cloudflareSum.pageViews),
    threats: finiteOrNull(cloudflareSum.threats),
  };

  const gaRow = sources.ga4.ok ? sources.ga4.data.byDate[dates.yesterday] : null;
  const gaMetrics = Object.fromEntries([
    "activeUsers", "newUsers", "sessions", "engagedSessions", "engagementRate",
    "userEngagementDuration", "screenPageViews", "keyEvents",
  ].map((key) => [key, finiteOrNull(gaRow?.[key])]));
  const gaBreakdowns = sources.ga4.ok ? {
    landingPages: normalizedRows(sources.ga4.data.landingPages, "landingPagePlusQueryString", "sessions", { path: true }),
    channels: normalizedRows(sources.ga4.data.channels, "sessionDefaultChannelGroup", "sessions"),
    countries: normalizedRows(sources.ga4.data.countries, "country", "activeUsers"),
    devices: normalizedRows(sources.ga4.data.devices, "deviceCategory", "activeUsers"),
    pages: normalizedRows(sources.ga4.data.pages, "pagePath", "screenPageViews", { path: true }),
  } : {};

  const goatData = sources.goatcounter.ok ? sources.goatcounter.data : {};
  const goatMetrics = { visits: finiteOrNull(goatData.totals?.yesterday?.total) };
  const goatBreakdowns = sources.goatcounter.ok ? {
    pages: normalizedRows(goatData.pages?.hits, "path", "count", { path: true }),
    referrers: normalizedRows(goatData.referrers?.stats, "name", "count"),
    campaigns: normalizedRows(goatData.campaigns?.stats, "name", "count"),
    browsers: normalizedRows(goatData.browsers?.stats, "name", "count"),
    systems: normalizedRows(goatData.systems?.stats, "name", "count"),
    locations: normalizedRows(goatData.locations?.stats, "name", "count"),
    sizes: normalizedRows(goatData.sizes?.stats, "name", "count"),
  } : {};

  return {
    schemaVersion: 1,
    date: dates.yesterday,
    generatedAt: report.generatedAt,
    timezone: report.timezone,
    sources: {
      cloudflare: sourceSnapshot(sources.cloudflare, cloudflareMetrics),
      ga4: sourceSnapshot(sources.ga4, gaMetrics, gaBreakdowns),
      goatcounter: sourceSnapshot(sources.goatcounter, goatMetrics, goatBreakdowns),
    },
  };
}

function renderMarkdown(report) {
  const { dates, sources } = report;
  const lines = [
    `# SunVeda Daily Website Analytics — ${dates.yesterday}`,
    "",
    `Comparison: ${dates.previousDay} and ${dates.previousWeek} (Asia/Tokyo).`,
    "",
  ];
  if (sources.cloudflare.ok) {
    const current = sources.cloudflare.data.byDate[dates.yesterday]?.sum || {};
    const previous = sources.cloudflare.data.byDate[dates.previousDay]?.sum || {};
    const week = sources.cloudflare.data.byDate[dates.previousWeek]?.sum || {};
    const uniques = sources.cloudflare.data.byDate[dates.yesterday]?.uniq?.uniques;
    lines.push(
      "## Cloudflare HTTP Traffic",
      "",
      `- Requests: ${fmt(current.requests)} (${fmtDelta(delta(current.requests, previous.requests))} day/day; ${fmtDelta(delta(current.requests, week.requests))} week/week)`,
      `- Unique clients: ${fmt(uniques)}`,
      `- Bandwidth: ${fmt((current.bytes || 0) / 1_000_000, 1)} MB`,
      `- Cache hit ratio: ${current.requests ? fmt((current.cachedRequests / current.requests) * 100, 1) : "—"}%`,
      `- Threats: ${fmt(current.threats)}`,
      "",
    );
  } else lines.push(`## Cloudflare\n\nUnavailable: ${sources.cloudflare.error}\n`);

  if (sources.ga4.ok) {
    const current = sources.ga4.data.byDate[dates.yesterday] || {};
    const previous = sources.ga4.data.byDate[dates.previousDay] || {};
    const week = sources.ga4.data.byDate[dates.previousWeek] || {};
    lines.push(
      "## Google Analytics 4",
      "",
      `- Active users: ${fmt(current.activeUsers)} (${fmtDelta(delta(current.activeUsers, previous.activeUsers))} day/day; ${fmtDelta(delta(current.activeUsers, week.activeUsers))} week/week)`,
      `- Sessions: ${fmt(current.sessions)}; engaged sessions: ${fmt(current.engagedSessions)}; engagement rate: ${fmt((current.engagementRate || 0) * 100, 1)}%`,
      `- Views: ${fmt(current.screenPageViews)}; key events: ${fmt(current.keyEvents)}`,
      `- Top landing pages: ${listRows(sources.ga4.data.landingPages, "landingPagePlusQueryString", "sessions")}`,
      `- Channels: ${listRows(sources.ga4.data.channels, "sessionDefaultChannelGroup", "sessions")}`,
      `- Countries: ${listRows(sources.ga4.data.countries, "country", "activeUsers")}`,
      "",
    );
  } else lines.push(`## Google Analytics 4\n\nUnavailable: ${sources.ga4.error}\n`);

  if (sources.goatcounter.ok) {
    const current = sources.goatcounter.data.totals.yesterday?.total;
    const previous = sources.goatcounter.data.totals.previousDay?.total;
    const week = sources.goatcounter.data.totals.previousWeek?.total;
    lines.push(
      "## GoatCounter",
      "",
      `- Visits: ${fmt(current)} (${fmtDelta(delta(current, previous))} day/day; ${fmtDelta(delta(current, week))} week/week)`,
      `- Top pages: ${listRows(sources.goatcounter.data.pages?.hits, "path", "count")}`,
      `- Referrers: ${listRows(sources.goatcounter.data.referrers?.stats, "name", "count")}`,
      `- Browsers: ${listRows(sources.goatcounter.data.browsers?.stats, "name", "count")}`,
      `- Locations: ${listRows(sources.goatcounter.data.locations?.stats, "name", "count")}`,
      "",
    );
  } else lines.push(`## GoatCounter\n\nUnavailable: ${sources.goatcounter.error}\n`);

  lines.push(
    "## Interpretation notes",
    "",
    "- Cloudflare HTTP requests include assets, crawlers, and CDN traffic; they are not human visits.",
    "- GA4 and GoatCounter use different identifiers, privacy rules, blockers, and processing windows. Compare trends within each source instead of adding their totals.",
  );
  return `${lines.join("\n").trim()}\n`;
}

async function main() {
  const dates = comparisonDates();
  const [cloudflare, ga4, goatcounter] = await Promise.all([
    capture("cloudflare", () => cloudflareReport(dates)),
    capture("ga4", () => ga4Report(dates)),
    capture("goatcounter", () => goatcounterReport(dates)),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    timezone: "Asia/Tokyo",
    dates,
    sources: { cloudflare, ga4, goatcounter },
  };
  const outputIndex = process.argv.indexOf("--output-dir");
  if (outputIndex !== -1) {
    const outputDirectory = process.argv[outputIndex + 1];
    if (!outputDirectory) throw new Error("--output-dir requires a directory");
    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(resolve(outputDirectory, "report.md"), renderMarkdown(report));
    writeFileSync(resolve(outputDirectory, "snapshot.json"), `${JSON.stringify(normalizeSnapshot(report), null, 2)}\n`);
  } else if (process.argv.includes("--snapshot-json")) {
    process.stdout.write(`${JSON.stringify(normalizeSnapshot(report), null, 2)}\n`);
  } else if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(renderMarkdown(report));
  if (![cloudflare, ga4, goatcounter].some((source) => source.ok)) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

export { addDays, cleanPath, comparisonDates, normalizeSnapshot, renderMarkdown, utcRangeForTokyoDate };
