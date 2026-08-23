---
name: footer-version
description: Update the .footer__version link in index.html to the correct PR number and commit hash. Use whenever opening a PR against sunveda.tech, or when asked to bump/fix the site version. AGENTS.md makes this mandatory on every merged PR.
---

# Footer version bump

`index.html` shows the site version as a link to its PR:

```
v21 · b500120
```

Format: `v{PR number} · {7-char commit hash}`, rendered as a single `<a>` inside `.footer__version`.

AGENTS.md marks this **mandatory on every PR** — a PR without it should not be merged.

## Which PR number

Do not derive it from `git log --merges`. That reports the last *merged* PR, which is wrong when open PRs or issues sit in between, and finds nothing at all when merges are squashed. GitHub numbers issues and PRs in one shared sequence, so query the API.

**If this branch already has an open PR**, use that PR's own number:

```bash
gh pr view --json number -q .number
```

**If you are about to create a new PR**, use the highest existing number plus one:

```bash
echo $(( $(gh api 'repos/sunveda/sunveda.tech/issues?state=all&per_page=1' --jq '.[0].number') + 1 ))
```

The `issues` endpoint returns PRs too, so this covers the shared sequence.

## Which commit hash

Bump the footer as the **last commit on the branch**, and use the hash of the commit *before* it — the substantive change the version describes.

The hash cannot be its own commit's hash (you would need it before committing). Do not chase it by amending: committing the footer changes HEAD again, which is the loop to avoid. Pointing at the content commit is both achievable and more meaningful.

```bash
git rev-parse --short HEAD   # run AFTER committing the content, BEFORE committing the footer
```

## Steps

1. Commit the actual content change first.
2. `HASH=$(git rev-parse --short HEAD)`
3. Get `N` per the rules above.
4. Patch the footer in `index.html`:

```html
<div class="footer__version">
  <a href="https://github.com/sunveda/sunveda.tech/pull/{N}" target="_blank" rel="noopener noreferrer" aria-label="Last merged pull request #{N}">v{N} · {HASH}</a>
</div>
```

5. Commit it on its own, then push.

Verify before pushing:

```bash
grep -o 'v[0-9]* · [a-f0-9]*' index.html
```

## Repo layout warning

The working files live in the directory `sunveda.tech ` (**with a trailing space**), but git tracks them at the repo root `/Users/singh/repo/sunveda/`. Editing only the subdirectory copy leaves the tracked file untouched and the change never reaches the PR.

After editing `sunveda.tech /index.html`, copy it to the tracked path:

```bash
cp "/Users/singh/repo/sunveda/sunveda.tech /index.html" /Users/singh/repo/sunveda/index.html
```

Then confirm the staged content is what you expect:

```bash
git diff --cached index.html
```

## Assignee

Every PR must be assigned to `sunveda`. The flag differs by subcommand:

```bash
gh pr create --assignee sunveda      # creating
gh pr edit <N> --add-assignee sunveda # after the fact
```

## Before you push to an existing PR

Confirm it has not already been merged — commits pushed to a merged PR's branch are silently orphaned and never reach `main`:

```bash
gh pr view <N> --json state -q .state
```

If it reports `MERGED`, branch from an updated `main` and open a new PR instead.

## Related

`.kiro/hooks/update-footer-version.json` does this automatically for the Kiro agent, using the `git log --merges` method described above as unreliable. Leave the hook in place (AGENTS.md says not to remove it), but prefer these steps when working here.
