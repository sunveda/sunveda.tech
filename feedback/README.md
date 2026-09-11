# Reusable event feedback

Status: the production guest page, written-feedback API, private host dashboard, Turnstile widget, separate APAC D1 database, and private APAC R2 video bucket were deployed and verified on 2026-09-11. Video upload is enabled. The existing RSVP cancellation app remains separate. Timeline copy from website PR #50 was merged separately and verified live on 2026-09-11.

Guest page: `/feedback/` (default Sanya event), or `/feedback/?event=<id>`. Host dashboard: `/feedback/admin/`. Questions and event versions live in `events.mjs`. Add another event there rather than copying the application. The guest page supports English and Japanese with an English / 日本語 button switch, browser-language default and a saved preference. Use `?lang=en` or `?lang=ja` to share a specific language. Switching keeps answers and selected files intact; stored answer values remain canonical. The private host dashboard is currently English. Required: name, email or phone, overall rating, and privacy acknowledgement. Other questions, comments and video are optional.

Below the feedback experience, guests can use bilingual buttons for the existing public LINE invite, celebration WhatsApp group and `@sunvedatech` Instagram account. Keep these destinations public and avoid adding a private phone number to the static page.

## Run locally

Use Node.js 24 and the repository npm lockfile:

```sh
npm ci
npm run test:feedback
npm run preview:feedback
```

Open http://localhost:8788/feedback/. Local D1/R2 data persists under ignored `.feedback-local/`; tests use disposable isolated storage. The development server prints a development-only host password. Never copy it to production. Local Turnstile bypass works only for loopback requests and is not enabled in the production template. The static page also renders without a backend, but clearly disables submission; it never displays a fake success.

## Data and upload flow

1. Same-origin API checks required fields, allowed answers, consent, event capacity and Turnstile. The response UUID is an idempotency key. D1 stores the contact details, answers and exact event/question snapshot.
2. A confirmed receipt grants a signed, response-specific upload capability for 24 hours. Written answers remain saved even if video fails. Receipt/capability is held in the current tab's session storage; form answers are not persisted there.
3. Optional MP4/MOV uploads go through the Worker in 5 MiB multipart chunks. Per-part exact byte limits prevent clients from bypassing the 250 MB reservation. Completed parts can be retried. A D1 lease serializes part/completion operations for a response. The browser resumes the original selected file in the same tab; metadata matching protects against accidental selection of a different file, not deliberate tampering.
4. Completion inspects bounded MP4/MOV container metadata, including movie and video-track duration, before marking ready. The limit is 480 seconds. Fragmented, unreadable and unsupported containers are rejected. This is metadata validation, not full decoding/transcoding or a guarantee that all codecs play in every browser. Deliberately falsified media metadata is outside this initial validator's guarantees.
5. The private bucket has no public domain. Host sign-in creates an HttpOnly, Secure, SameSite=Strict one-hour session. Only authenticated host endpoints list responses or stream/download ready videos. Never include video URLs or contact details in analytics.
6. Hourly cleanup aborts recorded unfinished uploads older than 24 hours and removes incomplete objects. It does not delete accepted feedback. Rejected object bytes are released from the reservation only after deletion succeeds. A storage creation failure can leave a reservation until cleanup; written feedback is unaffected.

## Production status and provisioning record

GitHub Pages continues to host the website. `sunveda-feedback` runs at `sunveda.tech/api/feedback/*`, with its own `sunveda-feedback` D1 database, private `sunveda-feedback-private` R2 bucket and managed Turnstile widget restricted to `sunveda.tech`. Production secrets are stored only in Cloudflare. The owner-held dashboard password is also saved locally with mode `0600` at `/home/shin/.config/sunveda-feedback/admin-password`; it is not committed. Written feedback, video upload and private dashboard access are live.

R2 is active on the account. The bucket uses Standard storage with an APAC location hint, has no public domain, and aborts incomplete multipart uploads after one day. The Worker has the `FEEDBACK_VIDEOS` binding, `VIDEO_ENABLED=true`, and an hourly cleanup trigger at minute 15. Free allowances are finite and shared at the account level; this app's limits are not a billing cap.

1. The private bucket and one-day incomplete-multipart lifecycle rule are active. Keep public access disabled.
2. The ignored production `worker/wrangler.jsonc` contains the live D1 ID, public Turnstile site key, R2 binding and cleanup trigger. Keep `PUBLIC_ORIGIN=https://sunveda.tech`; do not add `DEV_MODE`.
3. `SESSION_SECRET`, `ADMIN_PASSWORD`, and `TURNSTILE_SECRET` are configured. Never commit or copy them into context documents. Rotate `SESSION_SECRET` to revoke existing host/upload sessions. Host password is an initial single-host mechanism; Google sign-in is not implemented in this release.
4. Apply the migration and upload secrets from `feedback/worker/` using a separately installed Wrangler CLI:

```sh
wrangler d1 migrations apply sunveda-feedback --remote --config wrangler.jsonc
wrangler secret put SESSION_SECRET --config wrangler.jsonc
wrangler secret put ADMIN_PASSWORD --config wrangler.jsonc
wrangler secret put TURNSTILE_SECRET --config wrangler.jsonc
wrangler deploy --config wrangler.jsonc
```

5. The domain route, R2 binding, `VIDEO_ENABLED=true`, and hourly cleanup trigger are deployed; existing analytics routes remain intact.
6. Written feedback was smoke-tested through the live Turnstile flow. The labeled test response was removed, leaving zero production responses. A generated one-second MP4 completed a byte-identical production R2 upload/download round trip and was deleted, returning the bucket to zero objects. A small real-phone MP4/MOV compatibility sample remains useful before broad distribution; remove its response and object afterward.

Defaults: 1,000 responses per event; 10 new submissions per IP per hour; 5 host login attempts per IP per minute; 8 GB reserved video storage across this application; 250 MB per video. At 250 MB, 8 GB holds 32 videos. These limits do not bound every billable request or other applications' usage. Monitor Cloudflare usage and reduce/disable video intake before exceeding the chosen budget. An eight-minute recording may exceed 250 MB; the guest must export a smaller MP4/MOV.

## Host operation and retention

Sign in at `/feedback/admin/` using the owner-held password. Responses are paginated in batches of 50. CSV exports contain only loaded responses; load all pages before exporting a complete event. Videos are viewed/downloaded through authenticated endpoints. Sign out on shared devices. Treat downloaded CSV/video files as private too.

The host chooses a retention period before inviting guests; automatic deletion of accepted responses is not configured. For a deletion request, locate the response ID privately in D1, delete its R2 object (if any), then delete its `upload_parts`, `uploads` and `responses` rows in that order. Remove corresponding exports/backups according to the host's policy. Keep a private operational record without copying guest data into GitHub. Set the event's `accepting` to false to close new feedback, deploy the Worker and static event config together. Existing receipts may finish uploads until expiry. Set `VIDEO_ENABLED=false` for an immediate upload pause.

## API contract

All JSON is no-store. Mutations require the configured same-origin `Origin`. Errors return `{error}` with an appropriate 4xx/5xx status.

| Method and `/api/feedback` path          | Access                 | Purpose                                                           |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------- |
| GET `/events/:event`                     | Public                 | Event schema, availability, public Turnstile key and video limits |
| POST `/responses`                        | Turnstile              | Validate/save response; return receipt and signed upload token    |
| GET/POST `/responses/:id/video`          | Upload bearer token    | Get progress/reserve upload                                       |
| PUT `/responses/:id/video/parts/:number` | Upload bearer token    | Exact-size binary chunk                                           |
| POST `/responses/:id/video/complete`     | Upload bearer token    | Complete and validate video                                       |
| POST `/admin/login`, `/admin/logout`     | Host password / cookie | Start/end host session                                            |
| GET `/admin/responses?event=…`           | Host cookie            | Private response pages; use returned next cursor                  |
| GET `/admin/videos/:id`                  | Host cookie            | Private video stream; `?download` for attachment                  |

Tests run the actual Worker against local D1/R2, plus unit checks of validation and media inspection. The live written-feedback, private-dashboard, R2 binding, video-availability and scheduled-cleanup configuration are verified. Only a real-device MP4/MOV compatibility sample remains pending.
