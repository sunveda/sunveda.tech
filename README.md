# SunVeda Technologies

Source for [sunveda.tech](https://sunveda.tech), Sarveshwar Singh's multilingual technology consulting and portfolio website.

## Documentation

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — agent handoff, read this first
- [`docs/SPEC.md`](docs/SPEC.md) — living requirements, shipped/in-flight/planned status
- [`docs/architecture.md`](docs/architecture.md) — architecture **source of truth**: current Mermaid diagram, deployment map, request/data flows, security boundaries, and the A1–A8 revision history
- [`AGENTS.md`](AGENTS.md) — agent operating contract for this repo
- [House docs strategy](https://github.com/sunveda/data/blob/main/house/DOCS_STRATEGY.md) — rules shared by every SunVeda repo

`AGENTS.md` mandates keeping `docs/architecture.md` synchronized in the same PR as any change affecting hosting, runtime services, public routes, APIs, data storage, automation, external integrations, or security boundaries.

## Repository layout

```text
.
├── index.html                    # Main site markup, styles, and browser scripts
├── i18n.js                       # 12-locale translation dictionary and switcher
├── a/index.html                  # Database-backed analytics dashboard
├── app/index.html                # Multilingual application catalogue
├── app/aedoko/                   # Vendored AEDoko static application and AED snapshot
├── rsvp/index.html               # Post-event parking page (redirects home)
├── privacy.html / terms.html     # Legal pages
├── docs/                         # CONTEXT, SPEC, architecture, and archived content
├── tests/layout.mjs              # Multilingual responsive layout regression suite
├── package.json / package-lock.json
│                                      # Browser-test dependency and commands
├── analytics/
│   ├── collect.mjs               # Provider collection and normalization
│   ├── reconcile.mjs             # Rolling gap detection and repair orchestration
│   ├── import-reports.mjs        # Historical Markdown-to-snapshot converter
│   ├── preview.mjs               # Local dashboard preview with live public API
│   ├── test.mjs                  # Collector and importer tests
│   └── worker/                   # Worker API, D1 schema, tests, deployment config
├── feedback/                     # Guest feedback app, Worker, and D1/R2 (see feedback/README.md)
├── .github/workflows/
│   ├── analytics.yml             # Daily analytics collection
│   └── layout-tests.yml          # PR, main and weekly layout QA
├── CNAME
└── site.webmanifest
```

## Local development

Preview the static website:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`. For the analytics dashboard with its live public API proxy:

```bash
node analytics/preview.mjs
```

The application catalogue is available locally at `http://localhost:8000/app/`. The vendored AEDoko release is at `http://localhost:8000/app/aedoko/`; its source and build commands live in the [`sunveda/aedoko`](https://github.com/sunveda/aedoko) repository.

Install the browser-test dependency and Chromium once:

```bash
npm ci
npx playwright install chromium
```

Run the complete test suite or only the layout checks:

```bash
npm test
npm run test:layout
```

The analytics tests remain directly runnable without npm dependencies:

```bash
node analytics/test.mjs
node analytics/worker/test.mjs
```

See `analytics/README.md` for collector credentials, historical imports, D1 setup, and Worker deployment details. See [`feedback/README.md`](feedback/README.md) for the feedback app's preview, security, deployment, and retention runbook.
