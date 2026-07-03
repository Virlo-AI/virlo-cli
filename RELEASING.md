# Releasing virlo-cli

Human-triggered, machine-executed. You decide the version and write the
changelog; CI publishes from a clean environment with provenance.

## One-time setup

1. **npm 2FA** on for every account with publish rights.
2. **CI token**: npmjs.com → avatar → Access Tokens → *Generate New Token →
   Granular*. Permissions: read/write, scoped to the `virlo-cli` package only
   (after first publish; before it, scope to all org packages and narrow later).
   Set an expiry (e.g. 1 year) and calendar the rotation.
3. Add it to GitHub: repo → Settings → Secrets and variables → Actions →
   New repository secret → name `NPM_TOKEN`.
4. The package must be granted to the org after first publish:
   `npm access grant read-write virlo:developers virlo-cli`.

## Per release

`main` only accepts pull requests, so the version bump lands via PR and the
tag — the actual release trigger — is created on `main` *after* the merge:

```shell
# 1. Release branch with the bump + changelog:
git checkout main && git pull
git checkout -b release/vX.Y.Z
npm version patch --no-git-tag-version   # bumps package.json only — no commit, no tag
#    Move the Unreleased section of CHANGELOG.md under a new "## [X.Y.Z] - date"
#    heading and update the link refs at the bottom.
git add -A && git commit -m "release: vX.Y.Z"
git push -u origin release/vX.Y.Z

# 2. Open the PR, get it approved, merge it (merge commit or squash — the tag
#    is created on main afterwards, so either is safe).

# 3. Tag the merged result — this is what fires the Release workflow:
git checkout main && git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

> ⚠ Do **not** use plain `npm version` (without `--no-git-tag-version`) on
> `main`: it commits directly to the branch, which the ruleset rejects — while
> the tag still goes through and publishes a release from a commit that never
> landed on `main`.

The Release workflow (`.github/workflows/release.yml`) then:

- runs typecheck + the full test suite from `npm ci`
- refuses to publish if the tag doesn't match `package.json`'s version
- logs the exact tarball contents for the audit trail
- publishes to npm with `--provenance` (verified supply-chain attestation)
- creates the GitHub Release with notes extracted from CHANGELOG.md

If any step fails, nothing is published — fix, delete the tag
(`git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`), and re-run.

## Security posture (why it's set up this way)

- **Publishes only from CI** — no long-lived publish tokens on laptops; the
  token lives in a GitHub secret, scoped to one package, with an expiry.
- **Provenance** — every npm version carries a signed attestation linking it
  to the exact commit and workflow run that built it.
- **Pinned actions** — workflows pin actions to commit SHAs (tags are
  mutable; SHAs aren't). Dependabot keeps the pins fresh.
- **Least privilege** — workflows default to zero permissions and request
  only `contents` and `id-token` where needed; checkout does not persist git
  credentials.
- **No mid-flight cancellation** — the release concurrency group prevents
  overlapping or half-cancelled publishes.

## Manual fallback

If CI is down: `npm publish` from a clean checkout works (`prepublishOnly`
runs typecheck + build), but skips provenance — prefer re-running the
workflow when possible.
