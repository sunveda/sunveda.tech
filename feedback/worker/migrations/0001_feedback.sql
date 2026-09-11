CREATE TABLE responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  event_snapshot TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  answers TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX responses_event_date ON responses(event_id, created_at DESC, id);
CREATE TABLE uploads (
  response_id TEXT PRIMARY KEY REFERENCES responses(id),
  object_key TEXT NOT NULL UNIQUE,
  multipart_id TEXT,
  file_bytes INTEGER NOT NULL CHECK(file_bytes > 0 AND file_bytes <= 250000000),
  content_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('creating','uploading','verifying','ready','rejected','expired')),
  duration REAL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX uploads_status_expiry ON uploads(status, expires_at);
CREATE TABLE upload_parts (
  response_id TEXT NOT NULL REFERENCES uploads(response_id),
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  PRIMARY KEY(response_id, part_number)
);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
