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
- **All PRs must be assigned to `sunveda`** — always pass `--assignee sunveda` when running `gh pr create`.
- The site has previously been adjusted for: multilingual responsive layout bugs, legal/compliance wording (sole proprietor status, service terms), and cache-busting after asset changes.

## Footer version line

> **MANDATORY — update this on every PR before merging.**

The footer shows the current site version as a link to the last merged PR with its short commit hash, e.g.:

```
v10 · da8be08
```

**Format:** `v{PR number} · {short hash (7 chars)}` — rendered as a single `<a>` inside `.footer__version` pointing to the GitHub PR URL.

**When working on a PR branch**, update the footer to reflect the *upcoming* PR number and the branch tip hash:

1. Find the PR number. Ask GitHub — do **not** derive it from `git log --merges`, which reports the last *merged* PR and is wrong whenever an open PR or issue sits in between (and finds nothing at all under squash merges). Issues and PRs share one number sequence:
   ```bash
   gh pr view --json number -q .number   # branch already has an open PR — use its number
   # otherwise, the next free number:
   echo $(( $(gh api 'repos/sunveda/sunveda.tech/issues?state=all&per_page=1' --jq '.[0].number') + 1 ))
   ```
2. Get the hash of the commit the version describes: `git rev-parse --short HEAD`, run *after* committing the content change and *before* committing the footer. The footer commit cannot contain its own hash, so it points at the content commit ahead of it — don't try to chase it by amending.
3. Update the footer in `index.html`:
   ```html
   <div class="footer__version">
     <a href="https://github.com/sunveda/sunveda.tech/pull/{N}" target="_blank" rel="noopener noreferrer" aria-label="Last merged pull request #{N}">v{N} · {hash}</a>
   </div>
   ```
4. Include this update in the PR — it must be part of every merged PR, no exceptions.

The GitHub repo URL pattern is `https://github.com/sunveda/sunveda.tech/pull/{N}`.

A Claude Code skill at `.claude/skills/footer-version/SKILL.md` carries the full procedure and loads automatically when working in this repo. It replaces the former `.kiro/hooks/update-footer-version.json` hook, which patched the footer automatically but computed the PR number with the `git log --merges` method described above as unreliable.

## What NOT to do

- Don't introduce a build tool, framework, or bundler unless explicitly asked — the whole point of this repo is a zero-build static site.
- Don't add a translation key in one language without adding it in all supported languages.
- Don't hardcode colors/spacing that duplicate an existing design token.
- Don't forget to bump `i18n.js`'s cache-busting version query param when editing it.
- Don't merge a PR without updating the `.footer__version` link in `index.html` to the new PR number and commit hash.
- Don't create a PR without assigning it to `sunveda` (`--assignee sunveda` in `gh pr create`).
