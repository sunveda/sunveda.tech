# AGENTS.md

Instructions for any AI coding agent (Claude, Copilot, Cursor, Codex, etc.) working in this repository.

## What this is

`sunveda.tech` — Sarveshwar Singh's personal/consulting site (SunVeda Technologies). A single-page marketing/portfolio site, statically hosted.

- No framework, no bundler, no `package.json`. Plain HTML/CSS/JS.
- `index.html` — the entire site: markup + all CSS in one `<style>` block + inline bootstrap scripts.
- `i18n.js` — client-side translation dictionary and language-switching logic (loaded via `<script src="i18n.js?v=N" defer>`).
- `privacy.html`, `terms.html` — small standalone legal pages.
- `site.webmanifest`, `favicon*.png/svg`, `icon-*.png`, `apple-touch-icon.png` — PWA/icon assets.
- `logo-*.png` — client/partner logos shown in the "Selected work" section.
- `CNAME` — GitHub Pages custom domain (`sunveda.tech`). Deployment is GitHub Pages; there is no CI workflow in this repo.

There is no build step. Any change to `index.html`, `i18n.js`, or the HTML pages is live as-is once deployed.

## Running / previewing locally

No dev server or build tooling is configured. Serve the directory with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/index.html`.

## Internationalization (i18n)

- Supported languages are defined in `i18n.js` in the `LANGUAGES` array (currently `en`, `ja`).
- Every user-facing string in `index.html` should have a matching `data-i18n="namespace.key"` attribute, and a corresponding entry for **every** supported language in the `locales` object in `i18n.js`.
- When adding or changing copy:
  1. Add/update the key in `locales.en` (and every other locale — do not leave a language missing a key).
  2. Reference it via `data-i18n="..."` on the element in `index.html`.
  3. Some sections (`stackKeys`/`stackTranslations`, `meetingTranslations`) use separate translation tables for structured/repeated data — check `i18n.js` for the relevant table before adding ad hoc strings.
- After editing `i18n.js`, bump the `?v=N` cache-busting query param on the `<script src="i18n.js?v=N">` tag in `index.html` so the CDN/browser doesn't serve a stale cached copy.

## Styling conventions

- All styles live in the `<style>` block at the top of `index.html`. There is no separate CSS file.
- Design tokens (colors, spacing, radii, shadows, type scale) are CSS custom properties defined under `:root, [data-theme="light"]` and overridden under `[data-theme="dark"]`. Reuse existing `--color-*`, `--space-*`, `--text-*`, `--radius-*` variables rather than hardcoding values.
- Theme (light/dark) is set via `data-theme` on `<html>`, resolved from `prefers-color-scheme` by an inline script in `<head>` before first paint (to avoid flash of wrong theme). Preserve this behavior if touching that script.
- Typography: `--font-display` (Instrument Serif) for headings, `--font-body` (DM Sans) for body text — both loaded from Google Fonts.

## Assets

- Icons: [Lucide](https://lucide.dev) via `<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js">`, rendered as `<i data-lucide="...">` and initialized in JS. Don't introduce a second icon library.
- Logos in the "Selected work" / stack sections are pre-cropped PNGs sized/cropped to match each other (see git history — logos have been re-cropped multiple times for visual consistency). Match existing crop/aspect ratio when adding a new one, and bust the cache by renaming (e.g. `-v2`, `-v3`) if replacing an existing file, since this site is likely fronted by a CDN cache.

## Conventions from git history worth knowing

- Commits are small and scoped (one visual/content change per commit).
- Branch naming pattern used for larger changes: `agent/<short-description>` (e.g. `agent/redesign-tools-of-trade`, `agent/fix-multilingual-layout`), merged via PR.
- The site has previously been adjusted for: multilingual responsive layout bugs, legal/compliance wording (sole proprietor status, service terms), and cache-busting after asset changes.

## What NOT to do

- Don't introduce a build tool, framework, or bundler unless explicitly asked — the whole point of this repo is a zero-build static site.
- Don't add a translation key in one language without adding it in all supported languages.
- Don't hardcode colors/spacing that duplicate an existing design token.
- Don't forget to bump `i18n.js`'s cache-busting version query param when editing it.
