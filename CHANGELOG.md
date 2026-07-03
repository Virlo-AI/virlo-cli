# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-07-02

Initial release.

### Added

- Full coverage of the Virlo public API: `account`, `hashtags`, `videos`, `trends`,
  `orbit`, `comet`, `satellite`, `sounds`, `tracking`, and `webhooks` command groups.
- Interactive `virlo setup` wizard that validates and stores the API key
  (`~/.virlo/config.json`, `chmod 600`); `whoami` and `logout`.
- Config precedence: flag > env var (`VIRLO_API_KEY`, `VIRLO_BASE_URL`) > file > default.
- `--json` output contract: pure data on stdout; errors, spend notices, and a
  `{"pagination":…}` line on stderr.
- Stable exit codes for scripting: `0` ok · `1` generic · `2` usage/validation ·
  `3` auth/config · `4` insufficient credits · `5` rate limited · `6` not found ·
  `7` network.
- Spend guardrails: paid (💲) commands prompt y/N interactively and require
  `--yes` when non-interactive or in `--json` mode, failing before any request
  is made.
- Async job support via `--watch` with transient-network-failure tolerance and
  a 60s per-request timeout (`VIRLO_TIMEOUT_MS` override).
- `virlo skill install` — installs a `SKILL.md` that teaches AI agents (Claude
  Code) the full CLI surface, cost model, and interpretation rules.

[Unreleased]: https://github.com/Virlo-AI/virlo-cli/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Virlo-AI/virlo-cli/releases/tag/v0.1.0
