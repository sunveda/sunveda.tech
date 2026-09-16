#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { addDays, collectReport, normalizeSnapshot, tokyoDate, writeReportOutputs } from "./collect.mjs";

const SOURCES = ["cloudflare", "ga4", "goatcounter"];
const API_URL = "https://sunveda.tech/api/analytics?days=30";

function expectedDates(endDate, days = 30) {
  return Array.from({ length: days }, (_, index) => addDays(endDate, index - days + 1));
}

function needsRepair(snapshot) {
  return !snapshot || SOURCES.some((source) => snapshot.sources?.[source]?.status !== "ok");
}

function mergeSnapshot(previous, current) {
  if (!previous) return current;
  return {
    ...current,
    sources: Object.fromEntries(SOURCES.map((source) => [
      source,
      current.sources[source].status === "ok" ? current.sources[source] : previous.sources?.[source] || current.sources[source],
    ])),
  };
}

async function existingSnapshots() {
  const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Analytics API returned ${response.status}`);
  const payload = await response.json();
  return new Map((payload.snapshots || []).map((snapshot) => [snapshot.date, snapshot]));
}

async function reconcile(outputDirectory, endDate = tokyoDate(-1)) {
  const existing = await existingSnapshots();
  const targets = expectedDates(endDate).filter((date) => date === endDate || needsRepair(existing.get(date)));
  const results = [];
  mkdirSync(outputDirectory, { recursive: true });
  for (const date of targets) {
    const report = await collectReport(date);
    const snapshot = mergeSnapshot(existing.get(date), normalizeSnapshot(report));
    writeReportOutputs(report, resolve(outputDirectory, date), snapshot);
    results.push({
      date,
      complete: !needsRepair(snapshot),
      statuses: Object.fromEntries(SOURCES.map((source) => [source, snapshot.sources[source].status])),
    });
  }
  writeFileSync(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({ endDate, results }, null, 2)}\n`);
  return results;
}

async function main() {
  const outputIndex = process.argv.indexOf("--output-dir");
  const outputDirectory = outputIndex === -1 ? null : process.argv[outputIndex + 1];
  if (!outputDirectory) throw new Error("--output-dir requires a directory");
  const dateIndex = process.argv.indexOf("--date");
  const endDate = dateIndex === -1 ? tokyoDate(-1) : process.argv[dateIndex + 1];
  const results = await reconcile(outputDirectory, endDate);
  process.stdout.write(`Reconciled ${results.length} analytics date${results.length === 1 ? "" : "s"}: ${results.map((item) => item.date).join(", ")}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();

export { expectedDates, mergeSnapshot, needsRepair, reconcile };
