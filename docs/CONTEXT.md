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
| Blockers | Feedback video retention period undecided; no real phone-recorded MP4/MOV compatibility sample has been run through the upload pipeline yet (see `SPEC.md` acceptance criteria) |
| Smoke path | `python3 -m http.server 8000` → open `http://localhost:8000/`; `npm test` for the full suite (`npm run test:layout` for just layout QA, `npm run test:feedback` for the feedback backend) |
| Hard constraints | Sole-proprietor legal/compliance wording on the public site; feedback guest PII and videos must never reach analytics, public Pages files, or GitHub context; every merged PR must update the `.footer__version` link (see `AGENTS.md`) |
| Pointers | [SPEC](SPEC.md) · [architecture](architecture.md) · [docs strategy](https://github.com/sunveda/data/blob/main/house/DOCS_STRATEGY.md) |

---

## Status log

Append one dated entry per session that changes state — this is how the next
agent, or your own next session, picks up the working context without
replaying the chat. Prefer appending a line over rewriting the file.

- **2026-09-19** — Claude Code — Created `docs/CONTEXT.md` and `docs/SPEC.md`, and moved the architecture section (Mermaid diagrams, deployment map, flows, security boundaries, A1–A8 evolution) out of root `README.md` into `docs/architecture.md`, applying the house docs strategy from [`sunveda/data`](https://github.com/sunveda/data). Root `README.md` and `AGENTS.md` updated to point here. No hosting/runtime/route/API/storage/security boundary changed — documentation reorganization only.
