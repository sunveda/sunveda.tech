CREATE TABLE IF NOT EXISTS daily_snapshots (
  date TEXT PRIMARY KEY NOT NULL,
  generated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  cloudflare_status TEXT NOT NULL,
  ga4_status TEXT NOT NULL,
  goatcounter_status TEXT NOT NULL,
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date
  ON daily_snapshots(date DESC);
