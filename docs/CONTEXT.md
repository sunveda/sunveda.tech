# CONTEXT — sunveda.tech handoff

**Only this:** enough for another agent to take over this repo with no chat history and lose nothing operational.
**Not this:** a second copy of SPEC or architecture — see those for detail.

Canonical strategy: [`house/DOCS_STRATEGY.md`](https://github.com/sunveda/data/blob/main/house/DOCS_STRATEGY.md)

---

## Must not lose

| Fact | Value |
| --- | --- |
| Project role | Sarveshwar Singh's multilingual technology consulting/portfolio site (SunVeda Technologies) — statically hosted, with a small Cloudflare Worker + D1 analytics plane and a separate Worker + D1 + R2 feedback plane |
| Live URL | https://sunveda.tech |
| Owners | Sarveshwar Singh |
| AI agents in use | Any AI coding agent (Claude, Copilot, Cursor, Codex, ...) — see `AGENTS.md`'s "AI agents used on this project" table |
| Stack locks | Zero-build static core site (`index.html`/`i18n.js`, no framework/bundler) · GitHub Pages (`main`) is the deployment mechanism · Cloudflare fronts DNS/CDN with two independent Workers (analytics, feedback), two independent D1 databases, and a private APAC R2 bucket for feedback video — never mix feedback PII/video with analytics or public Pages files |
| Open PRs that matter | None known at last check — see repo PR list |
| Production branch | `main` |
| Blockers | Feedback video retention period undecided; no real phone-recorded MP4/MOV compatibility sample run yet; Vercel hosting migration needs manual dashboard steps no agent has account access for — see below (all tracked in `SPEC.md` acceptance criteria) |
| Smoke path | `python3 -m http.server 8000` → open `http://localhost:8000/`; `npm test` for the full suite (`npm run test:layout` for just layout QA, `npm run test:feedback` for the feedback backend) |
| Hard constraints | Sole-proprietor legal/compliance wording on the public site; feedback guest PII and videos must never reach analytics, public Pages files, or GitHub context; every merged PR must update the `.footer__version` link (see `AGENTS.md`) |
| Pointers | [SPEC](SPEC.md) · [architecture](architecture.md) · [docs strategy](https://github.com/sunveda/data/blob/main/house/DOCS_STRATEGY.md) |

---

## Vercel hosting migration — manual steps

No AI agent has Vercel or Cloudflare dashboard access, so this cutover cannot
be automated. `vercel.json` and `.gitignore` are already prepped in the repo
(no build/install command needed — this is a zero-build static site). What's
left, for whoever has account access:

1. In Vercel: **New Project → Import Git Repository** → `sunveda/sunveda.tech`. Framework preset **Other**. `vercel.json` already disables the install/build commands, so this should deploy as a static site with no extra config.
2. Add `sunveda.tech` (and `www.sunveda.tech` if used) as a domain on the new Vercel project. Vercel will show the DNS target to use (typically a CNAME to `cname.vercel-dns.com`).
3. In Cloudflare DNS (the `sunveda.tech` zone): update the record currently pointing at GitHub Pages to point at Vercel instead. **Keep it proxied (orange cloud)** — the `sunveda-analytics-api` Worker (`/api/analytics*`, `/analyse*`) and the feedback Worker (`/api/feedback/*`) run at the Cloudflare edge and are origin-agnostic, so they keep working unchanged as long as Cloudflare stays in front. Switching to Vercel's own nameservers, or setting the record DNS-only, would break both Workers.
4. Verify on the live domain: homepage + all 12 locales, `/a/`, `/app/`, `/app/aedoko/`, `/feedback/`, `/privacy.html`, `/terms.html`, `/rsvp/`, and both Worker API paths.
5. Only after Vercel is confirmed serving production traffic: disable GitHub Pages in repo **Settings → Pages** (source: None) and remove the now-vestigial root `CNAME` file in a follow-up PR. That PR is also when `docs/architecture.md` gets its real **A9** entry — don't document the migration as done before this step, since GitHub Pages is still the live host until then.

---

## Quick catch-up

- **Current state:** The static site, analytics dashboard, AEDoko, and private event feedback are running on the architecture described in [architecture.md](architecture.md). The birthday RSVP route is a post-event thank-you page. [PR #64](https://github.com/sunveda/sunveda.tech/pull/64) hid the homepage “Tools of the trade” section and removed its navigation links while retaining its source and translations for a possible return. The PR layout check and the `main` GitHub Pages deployment passed.
- **Priorities:** Decide how long accepted feedback and videos should be retained; verify a phone-recorded MP4/MOV upload and playback; then reconcile the runbook and [SPEC](SPEC.md) with those findings. No decision or sample result has been recorded yet. Separately, a Vercel Pro plan is now available and the site is meant to migrate off GitHub Pages — repo-side prep (`vercel.json`) is done, but the actual project/domain/DNS cutover needs a human with dashboard access (see "Vercel hosting migration" above).
- **Restart:** Read this file, [SPEC](SPEC.md), and [AGENTS.md](../AGENTS.md); compare `main` with any open PRs and check the relevant deployment before claiming a change is live. Use the proposed ownership below only when implementation is authorized.

## Proposed agent split

These are recommendations, not active assignments. Use one agent for a small scoped change.

| Owner | Starting point and scope | Deliverable and check |
| --- | --- | --- |
| Coordinator | This context, `SPEC.md`, PR and deployment state; own integration and context updates | Prioritized scope, merged-versus-live record, and final verification |
| Feedback reviewer | `feedback/README.md`, form, Worker and existing tests; do not inspect guest records | Retention proposal and phone-video test plan with privacy boundaries |
| Site reviewer | `index.html`, `i18n.js`, `tests/layout.mjs`; own any approved public-site edits | Responsive and translation checks across supported languages |

The coordinator should settle any retention decision before implementation. Run the feedback tests for backend changes and layout checks for visible page changes; keep guest data out of PRs and context.

---

## Status log

Append one dated entry per session that changes state — this is how the next
agent, or your own next session, picks up the working context without
replaying the chat. Prefer appending a line over rewriting the file.

- **2026-09-19** — Claude Code — Created `docs/CONTEXT.md` and `docs/SPEC.md`, and moved the architecture section (Mermaid diagrams, deployment map, flows, security boundaries, A1–A8 evolution) out of root `README.md` into `docs/architecture.md`, applying the house docs strategy from [`sunveda/data`](https://github.com/sunveda/data). Root `README.md` and `AGENTS.md` updated to point here. No hosting/runtime/route/API/storage/security boundary changed — documentation reorganization only.
- **2026-09-23** — Claude Code — [PR #64](https://github.com/sunveda/sunveda.tech/pull/64) hid the homepage “Tools of the trade” section and removed its navigation links. Its source and translations remain available. Layout checks and GitHub Pages deployment for the merged commit `393d1f7` passed; no architecture boundary changed.
- **2026-09-30** — Claude Code — Prepped the repo for a Vercel migration (Pro plan now available): added `vercel.json` (disables install/build — static site needs neither) and gitignored `.vercel/`. Added the migration as an in-flight `SPEC.md` requirement with acceptance criteria, and a "Vercel hosting migration — manual steps" runbook above, since no agent has Vercel or Cloudflare account access to complete the actual project import / domain / DNS cutover. GitHub Pages remains the live host; `architecture.md` is intentionally not updated yet — that happens once the cutover is verified live (see runbook step 5, future A9).
