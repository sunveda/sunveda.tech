# SPEC — sunveda.tech

Living requirements. Update when scope, acceptance criteria, user flows, or
shipped/in-flight/planned status changes.

## Goals / non-goals

- Goal: present Sarveshwar Singh's multilingual technology consulting/portfolio site with zero build tooling.
- Goal: host focused, independently maintained applications (e.g. AEDoko) under the owned domain without adding a server backend to the core site.
- Goal: measure traffic through multiple independent providers and present it on an authenticated-free but unlisted aggregate dashboard, without exposing provider credentials or visitor-level data to the browser.
- Goal: run a private, reusable guest-feedback tool for events (written answers + optional video), kept strictly isolated from public/analytics data.
- Non-goal: a server backend, framework, or build pipeline for the core public site.
- Non-goal: mixing feedback PII/video with analytics data, public Pages files, or GitHub context.
- Non-goal: auto-publishing community-submitted AED locations without maintainer review.

## User journeys

- A visitor browses the site in one of 12 supported languages.
- A visitor uses AEDoko to find the nearest AED, optionally exploring the full map on demand.
- A community contributor proposes a new AED city source or leaves feedback via GitHub Issue Forms.
- A maintainer reviews the aggregate analytics dashboard at `/a/`.
- An event guest submits written feedback and, optionally, a short video, without an account.
- A host reviews guest feedback and exports it as CSV from a private authenticated dashboard.

## Requirements

| Requirement | Status | Notes |
| --- | --- | --- |
| Main multilingual website (12 locales) | shipped | `index.html`, `i18n.js` |
| Analytics dashboard `/a/` (Cloudflare, GA4, GoatCounter) | shipped | Aggregate snapshots only, `noindex,nofollow` |
| Application catalogue `/app/` | shipped | Links to reviewed applications |
| Health App and Familiar announcements | in-flight | Homepage and `/app/` listings in all 12 languages; prospective scope, explicit in-development status, original SVG identities; no app runtime or new data collection |
| Experience wording | in-flight | 16 years throughout the homepage translations and `llms.txt` |
| Taxable crypto tax calculator | in-flight | Announce on the homepage and `/app/#taxable` as in development; link the public development repository, with no claim of readiness for tax filing |
| AEDoko emergency finder `/app/aedoko/` | shipped | Vendored static bundle from `sunveda/aedoko` |
| AEDoko on-demand interactive map | shipped | Lazy MapLibre bundle, loads only when opened |
| Daiboju disaster-alert pages `/app/daiboju/` | shipped (test mode) | Listed as live 2026-11-12. Static pages synced from `sunveda/daiboju`; Cloud Run service `daiboju-668725030350.asia-northeast1.run.app`. Sign-up open on the site and covered by `privacy.html`; the service also needs `SIGNUP_OPEN=1`. Until real channels and a persistent store are configured, alerts are simulated (`CHANNELS_DRY_RUN=1`), sign-ups live in memory, and the sign-up page shows a test-mode notice |
| AEDoko community contribution pipeline | shipped | Issue Forms → unverified draft proposal PR; import/validation stays a separate manual step |
| Multilingual layout regression QA | shipped | Playwright, 220 route/language/viewport combinations |
| RSVP parking page `/rsvp/` | shipped | Bilingual thank-you, redirects home; original invitation content archived under `docs/archive/` |
| Event feedback guest form (`/feedback/`) | shipped | Name + at least one contact method + overall experience + privacy acknowledgement required; food/decoration/cake/biryani questions and video upload optional |
| Event feedback host dashboard (`/feedback/admin/`) | shipped | Private password session, paginated review, CSV export |
| Event feedback video upload | shipped | Up to 8 minutes / 250 MB, Worker-mediated multipart upload to private APAC R2, signed capabilities, byte reservations, hourly cleanup of unfinished uploads |
| Feedback video retention period | in-flight | Decision pending — see acceptance criteria below |
| Feedback video phone-compatibility validation | in-flight | Only a generated MP4 round-trip has been verified; no real phone-recorded MP4/MOV sample tested yet |
| Migrate main-site hosting from GitHub Pages to Vercel | in-flight | Repo prepped (`vercel.json`, `.gitignore`); Vercel project/domain/DNS cutover is a manual dashboard step outside agent access — see acceptance criteria below and `CONTEXT.md` blockers |

## Acceptance criteria (current milestone)

Closing out A8 (private event feedback):

- [ ] Decide and document the feedback video retention period.
- [ ] Run a real phone-recorded MP4/MOV sample through the upload pipeline and confirm it plays back correctly.

Vercel hosting migration (see `CONTEXT.md` blockers for the full runbook):

- [ ] Import `sunveda/sunveda.tech` as a Vercel project (Framework preset "Other", no build/install command — `vercel.json` already sets this).
- [ ] Add `sunveda.tech` (and `www.sunveda.tech` if used) as a domain on the Vercel project.
- [ ] Update the Cloudflare DNS record for `sunveda.tech` to point at Vercel instead of GitHub Pages, keeping it **proxied** (orange-cloud) so the existing `sunveda-analytics-api` and feedback Worker routes keep intercepting `/api/analytics*`, `/analyse*`, and `/api/feedback/*` unchanged.
- [ ] Verify every route (site, `/a/`, `/app/`, `/app/aedoko/`, `/feedback/`, `/privacy.html`, `/terms.html`, `/rsvp/`) on the live domain once cut over.
- [ ] Only once Vercel is confirmed serving production traffic: disable GitHub Pages in repo Settings → Pages and remove the now-vestigial `CNAME` file, then record this as architecture revision A10 in `architecture.md` (A9 is Daiboju).

## Spec changelog

- **2026-09-19** — Initial SPEC created from the existing `README.md`/`AGENTS.md` content as part of applying the house docs strategy from [`sunveda/data`](https://github.com/sunveda/data). No requirements changed — this captures what was already shipped/in-flight.
- **2026-09-30** — Added the Vercel hosting migration as an in-flight requirement, now that the Pro plan is available. GitHub Pages remains the live host until the manual Vercel/DNS cutover is completed and verified.
- **2026-10-14** — Add Taxable as a SunVeda crypto tax calculator in development, alongside the live AEDoko application. The listing is an announcement, not a calculator launch.

- **2026-11-04** — Prepare the 16-year experience update and Health App / Familiar development announcements, with matching catalogue counts, metadata and logos. Publication pending.
