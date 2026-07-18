# Security Policy

## Supported versions

Security fixes are applied to the current development release. Do not rely on an unreleased feature for a safety guarantee.

## Reporting a vulnerability

Please do **not** open a public issue for a potential vulnerability. Email `security@cenro.dev` with:

- a concise description and affected version or commit;
- reproduction steps or a proof of concept;
- impact assessment;
- any suggested mitigation.

Please remove secrets, private file contents, API keys, and personally identifiable information from the report. We will acknowledge a report within 7 days and aim to provide a status update within 14 days.

## Product security principles

- Local tasks should not require external network access.
- Cloud and web actions require explicit, task-scoped user consent.
- Secret-looking workspace files must stay excluded from model context by default.
- Credentials must be stored through OS-backed encryption, never in source files, task receipts, renderer state, or logs.
- AI-generated file changes and terminal commands must be reviewable before execution.

If a change weakens one of these boundaries, please flag it in the pull request before merge.
