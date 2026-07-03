

⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⣶⣿⣿⣿⣿⣿⣷⣦⡀  

⠀⠹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷  

⠀⠀⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟  

⠀⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣆⠀⠀⠀⠀⣰⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠀  

⠀⠀⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⣠⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠀⠀  

⠀⠀⠀⠀⠀⠀⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣶⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠁⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠛⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⠻⣿⣿⣿⣿⣿⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⣿⣿⣿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿⡿⠃⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸⣿⠋⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀  




**Virlo CLI** — run your social intelligence from the terminal.

The official command-line interface for [Virlo](https://dev.virlo.ai/docs): TikTok,
YouTube Shorts, Instagram Reels, and Meta Ads research — trends, viral videos,
creators, sounds, hashtags — designed to be driven by humans (interactive setup
wizard) and by scripts / AI agents (subcommands, flags, `--json`).

## Install

```shell
npm install -g virlo-cli
```

Or run it without installing anything:

```shell
npx virlo-cli <command>
```

Requires Node ≥ 20.

## Quick start

```shell
virlo setup             # interactive wizard: paste your virlo_tkn_… key, it validates and saves
virlo whoami            # masked key + live balance
virlo trends digest     # today's trends 💲 $0.25 (prompts before spending)
```

Kick off a keyword search, wait for it, then read the results:

```shell
virlo orbit create \
  --name "ai tools" \
  --keywords "ai tools,ai apps" \
  --time-period this_week \
  --platforms tiktok,youtube \
  --yes --watch

virlo orbit videos <orbit_id> --order-by views --sort desc --limit 20
virlo orbit analysis <orbit_id> --latest
```

No key yet? Sign up at [dev.virlo.ai](https://dev.virlo.ai), then
Dashboard → API Keys → Generate Key.

## What you can do

- **Spot trends** — `virlo trends digest`, `virlo videos digest` 💲 $0.25 · `virlo hashtags list` 💲 $0.05
- **Research a niche** — `virlo orbit create` 💲 one-shot keyword search across platforms
- **Keep watching a niche** — `virlo comet create` 💲 recurring scheduled scrapes
- **Deep-dive a creator** — `virlo satellite creator tiktok @handle --include videos,outliers` 💲
- **Explain a viral video** — `virlo satellite video-outlier <url> --platform tiktok` 💲
- **Research sounds** — `virlo sounds trending` / `search` / `usage-history` 💲
- **Track creators & videos over time** — `virlo tracking creators add`, `virlo tracking videos add` 💲
- **Get notified** — `virlo webhooks create --url … --events comet.run.completed,…`
- **Hand it to an agent** — `virlo skill install` teaches Claude the whole surface

## Usage

### Authentication & configuration

Effective config is resolved per-call as **flag > env var > file > default**:


| Setting  | Flag         | Env var          | File key  | Default                |
| -------- | ------------ | ---------------- | --------- | ---------------------- |
| API key  | `--api-key`  | `VIRLO_API_KEY`  | `apiKey`  | *(none — required)*    |
| Base URL | `--base-url` | `VIRLO_BASE_URL` | `baseUrl` | `https://api.virlo.ai` |


`virlo setup` validates your key against the free balance endpoint and saves it to
`~/.virlo/config.json`. `virlo whoami` shows what's configured (and where it came
from); `virlo logout` deletes it.

`VIRLO_CONFIG_DIR` overrides the config directory (defaults to `~/.virlo`).
`VIRLO_TIMEOUT_MS` overrides the per-request timeout (default 60000).

> **Security note:** the API key is stored **in plaintext** at `~/.virlo/config.json`
> with `chmod 600` (owner read/write only). Anyone who can read that file can spend
> your credits. For CI or shared machines, prefer the `VIRLO_API_KEY` env var
> (nothing is written to disk), and rotate keys from the dashboard if exposed.

### Global flags


| Flag            | Description                                                                      |
| --------------- | -------------------------------------------------------------------------------- |
| `--json`        | pure JSON on stdout — for scripting / agents                                     |
| `-y, --yes`     | confirm paid commands without prompting (required when non-interactive/`--json`) |
| `--api-key`     | override the configured API key                                                  |
| `--base-url`    | override the API base URL                                                        |
| `-v, --verbose` | log requests to stderr (API key redacted)                                        |


Global flags parse before or after the command:
`virlo --json orbit list` ≡ `virlo orbit list --json`.

### Output & scripting

- **Default**: human-readable tables / key-value blocks on stdout.
- `**--json`**: the response `data` payload as pure JSON on stdout (nothing else),
so it pipes cleanly into `jq` or an agent. Errors go to **stderr** as
`{"error":{"type","message",…}}` — including usage errors. When a list response
paginates, one `{"pagination":{…}}` line goes to stderr (check `has_next_page`/
`total` there); spend notices also go to stderr, keeping stdout machine-clean.

Exit codes, for branching in scripts:


| Code | Meaning              |
| ---- | -------------------- |
| `0`  | ok                   |
| `1`  | generic error        |
| `2`  | usage / validation   |
| `3`  | auth / config        |
| `4`  | insufficient credits |
| `5`  | rate limited         |
| `6`  | not found            |
| `7`  | network              |


### Money & spend safety

**💲 commands require confirmation before they spend.** Running one interactively
in a terminal prompts a y/N confirm (default No). Non-interactive callers — including
Claude and scripts — and any call using `--json` must pass `-y`/`--yes` up front;
otherwise the command fails with a validation error *before* any request is made, no
credits spent. All paid commands route through `src/lib/spend-guard.ts`, the single
place this gating lives (per-session/daily spend caps and `--dry-run` are still future
work).

Costs are resolved server-side and may change; known cost hints are shown in `--help`
and printed before paid calls, and the **actual** charge is always reported from the
response headers (`💲 spent $X.XX · $Y.YY remaining`, on stderr). Existing results are
free to re-read — check `virlo orbit list`, `virlo comet list`, `virlo tracking creators list` before creating new paid work.

### Async jobs (`--watch`)

`orbit create`, `satellite` lookups, and `tracking collect` are asynchronous: the
create call returns an id immediately. Add `--watch` to poll until the job reaches a
terminal state (transient network blips during the wait are retried). Note that
orbit/comet report `completed` when the **scrape** finishes — the AI **analysis** may
still be generating (fields come back `null`); re-check with
`virlo orbit analysis <id> --latest`.

### Agent skill (for Claude / AI agents)

Install a `SKILL.md` that gives an AI agent (Claude Code) full context on Virlo and
this CLI — capabilities, the cost/safety model, the async model, interpretation
rules, and intent routing — so it can drive `virlo` correctly.

```shell
virlo skill install            # interactive: pick project / global / custom dir
virlo skill install --global   # ~/.claude/skills/virlo/SKILL.md (all projects)
virlo skill install --dir ./.claude/skills/virlo   # explicit, non-interactive
virlo skill print              # dump the skill markdown to stdout
```

Place it under `.claude/skills/<name>/SKILL.md` for Claude Code to auto-discover it.
Add `--force` to overwrite an existing file.

## Command reference

Run `virlo <group> --help` for full options. 💲 = spends credits.


| Group       | Highlights                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `account`   | `balance`                                                                                                                   |
| `hashtags`  | 💲`list`, 💲`performance <hashtag>`                                                                                         |
| `videos`    | 💲`digest`                                                                                                                  |
| `trends`    | 💲`list`, 💲`digest`                                                                                                        |
| `orbit`     | 💲`create`, `list`, `get`, `videos`/`slideshows`/`ads`/`outliers`/`sounds`/`trends`/`analysis <id>`                         |
| `comet`     | 💲`create`, `list`, `get`, `update`, `delete`, + same sub-resources as orbit                                                |
| `satellite` | 💲`creator <platform> <user>`, `creator-status`, 💲`batch`, `batch-status`, 💲`video-outlier <url>`, `video-outlier-status` |
| `sounds`    | 💲`trending`, 💲`search <q>`, 💲`by-creator`, 💲`get`, 💲`usage-history`, 💲`videos`                                        |
| `tracking`  | `creators` / `videos` sub-groups: 💲`add`, `list`, `get`, `report`, `snapshots`, `posts`, 💲`collect`, `update`, `remove`   |
| `webhooks`  | `create`, `list`, `get`, `update`, `delete`, `reenable`, `test`, `deliveries`, `retry-delivery`                             |


Out of scope (different auth, not a normal API key): `/v1/admin/*` and `/v1/teams/*`.

## Development

```shell
git clone https://github.com/Virlo-AI/virlo-cli && cd virlo-cli
npm install
npm run build
npm link            # makes your local build available globally as `virlo`
npm run virlo -- …  # or run from source without building (tsx)
```

```
src/
  index.ts                 commander root + global flags + exit-code mapping
  config/                  ~/.virlo config (chmod 600) + resolution
  client/                  fetch wrapper, envelope unwrap, error mapping, timeout
  lib/                     output renderer, flags/parsers, polling, spend-guard, validation
  domain/endpoints.ts      paid-endpoint registry (cost hints / 💲 markers)
  commands/                one module per resource group
test/                      vitest unit + E2E exit-code tests (all offline)
```

```shell
npm run typecheck   # tsc --noEmit
npm test            # builds, then runs the vitest suite
npm run dev         # tsup --watch
```

Releases are tag-triggered from CI — see [RELEASING.md](RELEASING.md).

## License

[MIT](LICENSE)

---

 Commands marked 💲 spend real credits (1 credit = $0.01); re-reading existing
results is free — see [Money & spend safety](#money--spend-safety).