# Releasing virlo-cli

Releases are automated with [release-please](https://github.com/googleapis/release-please)
(the same setup mercury-cli uses). Nobody edits versions, changelogs, or tags
by hand.

## How it works

1. **Every PR gets a conventional title**, because squash-merging turns the
   title into the commit release-please reads:

   | Title prefix               | Effect on next release        |
   | -------------------------- | ----------------------------- |
   | `fix: …`                   | patch bump, listed in CHANGELOG |
   | `feat: …`                  | minor bump, listed in CHANGELOG |
   | `feat!: …` / `fix!: …`     | **major** bump                 |
   | `chore: …` / `docs: …` / `ci: …` / `test: …` | no release triggered |

2. **release-please maintains a release PR** (branch `release-please--*`).
   Every merge to `main` updates it: the version bump in `package.json` and
   the generated CHANGELOG entries, always current.

3. **Merging the release PR ships it.** The Release workflow detects the
   merge, re-runs typecheck + the full test suite, and publishes to npm with
   `--provenance`. It also creates the git tag and the GitHub Release.

That's the whole flow: merge feature PRs with good titles; merge the release
PR when you want to ship.

## Repo settings this depends on

- **Squash merging only** (Settings → General → Pull Requests): the PR title
  must become the commit message. Disable merge commits and rebase merging.
- **`NPM_TOKEN` secret**: granular automation token scoped to `virlo-cli`
  (read/write, expiring — calendar the rotation).
- **Tag ruleset**: if a ruleset restricts `v*` tag creation, add GitHub
  Actions to its bypass list — the bot creates the tags now.

## Quirks worth knowing

- **CI checks on the release PR**: PRs opened by the default Actions token
  don't trigger `pull_request` workflows. If branch protection blocks the
  release PR on missing checks, close and reopen it (triggers CI), or merge
  anyway if allowed — the Release workflow independently re-runs typecheck
  and all tests before anything is published, so an unpublishable state
  cannot ship.
- **Nothing releasable**: if all merges since the last release are `chore:`/
  `docs:`-typed, release-please won't offer a release. That's by design.
- **Wrong title merged**: a mistyped squash commit (e.g. `Fix stuff`) is
  invisible to release-please. It still ships with the next release, just
  without a changelog line. Fix the habit, not the history.

## Security posture

- **Publishes only from CI** — the npm token lives in a GitHub secret,
  scoped to one package, with an expiry; no publish tokens on laptops.
- **Provenance** — every npm version carries a signed SLSA attestation
  linking it to the exact commit and workflow run that built it.
- **Pinned actions** — workflows pin actions to commit SHAs; Dependabot
  keeps the pins fresh.
- **Least privilege** — workflows request only the permissions they need;
  checkout does not persist git credentials.
- **Human decision point** — nothing publishes until a person merges the
  release PR, and branch rules (reviews, no self-merge) govern that PR like
  any other.

## Manual fallback

If automation is down: `npm publish` from a clean checkout of the tagged
commit works (`prepublishOnly` runs typecheck + build), but skips provenance —
prefer fixing and re-running the workflow.
