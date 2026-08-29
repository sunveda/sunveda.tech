#!/usr/bin/env node

import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function number(value) {
  if (!value || value === "—") return null;
  const parsed = Number(String(value).replaceAll(",", "").replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function section(markdown, heading) {
  const match = markdown.match(new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`));
  return match?.[1]?.trim() || "";
}

function field(block, label) {
  const match = block.match(new RegExp(`^- ${label}: ([^\\n]+)$`, "m"));
  return match?.[1]?.trim() || null;
}

function firstNumber(value) {
  return number(value?.match(/^[\d,.]+|^—/)?.[0]);
}

function list(value) {
  if (!value || value === "No data") return [];
  const matches = [...value.matchAll(/(?:^|, )(.+?) \(([\d,]+)\)(?=, |$)/g)];
  const totals = new Map();
  for (const match of matches) {
    const label = cleanPath(match[1]);
    const value = number(match[2]);
    if (value !== null) totals.set(label, (totals.get(label) || 0) + value);
  }
  return [...totals.entries()]
    .map(([label, count]) => ({ label, value: count }))
    .sort((a, b) => b.value - a.value);
}

function cleanPath(value) {
  if (!value?.startsWith("/")) return value || "(unknown)";
  return value.split(/[?#]/, 1)[0] || "/";
}

function unavailable(block) {
  return block.match(/^Unavailable: (.+)$/m)?.[1] || null;
}

function parseMarkdownReport(markdown, filename = "report.md") {
  const date = markdown.match(/^# SunVeda Daily Website Analytics — (\d{4}-\d{2}-\d{2})$/m)?.[1];
  if (!date) throw new Error(`${filename}: missing report date`);
  const cf = section(markdown, "Cloudflare HTTP Traffic");
  const ga = section(markdown, "Google Analytics 4");
  const goat = section(markdown, "GoatCounter");
  const cfError = unavailable(cf);
  const gaError = unavailable(ga);
  const goatError = unavailable(goat);
  const cfRequests = firstNumber(field(cf, "Requests"));
  const cfBandwidthMb = firstNumber(field(cf, "Bandwidth"));
  const gaActiveUsers = firstNumber(field(ga, "Active users"));
  const gaSessionsLine = field(ga, "Sessions");
  const gaViewsLine = field(ga, "Views");
  const goatVisits = firstNumber(field(goat, "Visits"));

  return {
    schemaVersion: 1,
    date,
    generatedAt: `${date}T23:00:00.000Z`,
    timezone: "Asia/Tokyo",
    sources: {
      cloudflare: {
        status: cfError ? "unavailable" : cfRequests === null ? "missing" : "ok",
        metrics: {
          requests: cfRequests,
          uniqueClients: firstNumber(field(cf, "Unique clients")),
          bandwidthBytes: cfBandwidthMb === null ? null : cfBandwidthMb * 1_000_000,
          cachedRequests: null,
          cacheHitRatio: (() => {
            const percent = firstNumber(field(cf, "Cache hit ratio"));
            return percent === null ? null : percent / 100;
          })(),
          pageViews: null,
          threats: firstNumber(field(cf, "Threats")),
        },
        breakdowns: {},
      },
      ga4: {
        status: gaError ? "unavailable" : gaActiveUsers === null ? "missing" : "ok",
        metrics: {
          activeUsers: gaActiveUsers,
          newUsers: null,
          sessions: firstNumber(gaSessionsLine),
          engagedSessions: number(gaSessionsLine?.match(/engaged sessions: ([\d,—]+)/)?.[1]),
          engagementRate: (() => {
            const percent = number(gaSessionsLine?.match(/engagement rate: ([\d,.—]+)%/)?.[1]);
            return percent === null ? null : percent / 100;
          })(),
          userEngagementDuration: null,
          screenPageViews: firstNumber(gaViewsLine),
          keyEvents: number(gaViewsLine?.match(/key events: ([\d,—]+)/)?.[1]),
        },
        breakdowns: {
          landingPages: list(field(ga, "Top landing pages")),
          channels: list(field(ga, "Channels")),
          countries: list(field(ga, "Countries")),
          devices: [],
          pages: [],
        },
      },
      goatcounter: {
        status: goatError ? "unavailable" : goatVisits === null ? "missing" : "ok",
        metrics: { visits: goatVisits },
        breakdowns: {
          pages: list(field(goat, "Top pages")),
          referrers: list(field(goat, "Referrers")),
          campaigns: [],
          browsers: list(field(goat, "Browsers")),
          systems: [],
          locations: list(field(goat, "Locations")),
          sizes: [],
        },
      },
    },
  };
}

async function main() {
  const reportsDirectory = process.argv[2];
  const outputDirectory = process.argv[3];
  if (!reportsDirectory || !outputDirectory) {
    throw new Error("Usage: node analytics/import-reports.mjs REPORTS_DIR OUTPUT_DIR");
  }
  await mkdir(outputDirectory, { recursive: true });
  const files = (await readdir(reportsDirectory)).filter((file) => file.endsWith(".md")).sort();
  const snapshots = [];
  for (const file of files) {
    const snapshot = parseMarkdownReport(await readFile(resolve(reportsDirectory, file), "utf8"), file);
    snapshots.push(snapshot);
    await writeFile(resolve(outputDirectory, `${snapshot.date}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  }
  process.stdout.write(`Imported ${snapshots.length} reports from ${basename(reportsDirectory)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

export { parseMarkdownReport };
