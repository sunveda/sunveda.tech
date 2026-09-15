# Agent context (living)

**Purpose:** Single source of truth so any agent (or human) can pick up this repo without chat history.

**Rule (SunVeda, all projects):** Update this file **at least once per active workday** while the project is the focus, and **immediately** on any major direction change (scope, stack, blockers, live URL, merge policy). Prefer a short dated entry at the top of Status over rewriting the whole file.

Do not put secrets here. Env var *names* and where they live are fine. Analytics ingest tokens, feedback PII, Turnstile secrets, and R2 credentials never belong in git or in this file.

Architecture diagrams and deployment maps remain authoritative in **README.md** — keep them in sync on material boundary changes (existing AGENTS.md rule).

---

## What this product is

Public site for **SunVeda Technologies** / Sarveshwar Singh: multilingual consulting + portfolio at https://sunveda.tech, plus hosted apps under `/app/` (notably AEDoko), aggregate analytics at `/a/`, and private event feedback under `/feedback/`.

Repo: https://github.com/sunveda/sunveda.tech

## Owner / bots

- Product owner: Sarveshwar Singh (SunVeda)
- Standards: **Chief of Engineering**
- Coordination: **Chief of Staff**
- No single named specialist bot for the marketing site; app specialists own their source repos (e.g. AEDoko → `sunveda/aedoko`)

## Stack (known)

- Zero-build core: plain HTML/CSS/JS on GitHub Pages; Cloudflare DNS/CDN
- Cloudflare Worker + D1 for analytics (`/api/analytics*`); separate Worker/D1/R2/Turnstile for feedback
- Playwright layout QA; Node collector for multi-provider analytics
- AEDoko vendored static bundle at `app/aedoko/` from `sunveda/aedoko`
- Architecture revision **A8** (private event feedback) current as of README

## Current status (2026-09-15)

### Engineering focus

- **Paused / held for feature eng.** Active SunVeda eng focus is **jkk-watch** (+ Learn AI Now, no repo). Prefer **CONTEXT-only** (and architecture-doc sync when required) until the owner reopens site eng.

### Live highlights

- Site + `/app/` catalogue + `/app/aedoko/` live
- Feedback written + video path deployed/verified (A8); **retention policy for accepted feedback still an open operational choice**
- `/rsvp/` is a post-event parking page (Sanya birthday closed); Apps Script closure deploy may still be outstanding in sibling repo
- No open PRs on this repo as of handoff seed

### Blockers / next when reopened

1. Decide feedback/video retention duration (see feedback runbook)
2. Keep README architecture revision + diagrams updated on any Worker/route/storage change
3. Coordinate AEDoko vendored releases with `sunveda/aedoko` (draft map-flicker PR #3 held there)
4. Footer version link must track each merged PR (existing AGENTS.md mandate)

## Non-goals / constraints

- Do not introduce a framework/bundler for the core site unless explicitly asked
- Do not mix feedback PII/videos into analytics, public Pages, or GitHub context
- Assign PRs to `sunveda`

## Related docs

- Root [README.md](../README.md) — architecture source of truth
- Root [AGENTS.md](../AGENTS.md) — agent operating rules (now points here first)
- [feedback/README.md](../feedback/README.md) — feedback runbook
- Sibling product contexts: `sunveda/aedoko`, `sunveda/jkk-watch`, etc.
