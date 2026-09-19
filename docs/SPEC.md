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
| AEDoko emergency finder `/app/aedoko/` | shipped | Vendored static bundle from `sunveda/aedoko` |
| AEDoko on-demand interactive map | shipped | Lazy MapLibre bundle, loads only when opened |
| AEDoko community contribution pipeline | shipped | Issue Forms → unverified draft proposal PR; import/validation stays a separate manual step |
| Multilingual layout regression QA | shipped | Playwright, 188 route/language/viewport combinations |
| RSVP parking page `/rsvp/` | shipped | Bilingual thank-you, redirects home; original invitation content archived under `docs/archive/` |
| Event feedback guest form (`/feedback/`) | shipped | Name + at least one contact method + overall experience + privacy acknowledgement required; food/decoration/cake/biryani questions and video upload optional |
| Event feedback host dashboard (`/feedback/admin/`) | shipped | Private password session, paginated review, CSV export |
| Event feedback video upload | shipped | Up to 8 minutes / 250 MB, Worker-mediated multipart upload to private APAC R2, signed capabilities, byte reservations, hourly cleanup of unfinished uploads |
| Feedback video retention period | in-flight | Decision pending — see acceptance criteria below |
| Feedback video phone-compatibility validation | in-flight | Only a generated MP4 round-trip has been verified; no real phone-recorded MP4/MOV sample tested yet |

## Acceptance criteria (current milestone)

Closing out A8 (private event feedback):

- [ ] Decide and document the feedback video retention period.
- [ ] Run a real phone-recorded MP4/MOV sample through the upload pipeline and confirm it plays back correctly.

## Spec changelog

- **2026-09-19** — Initial SPEC created from the existing `README.md`/`AGENTS.md` content as part of applying the house docs strategy from [`sunveda/data`](https://github.com/sunveda/data). No requirements changed — this captures what was already shipped/in-flight.
