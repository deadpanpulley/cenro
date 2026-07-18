# Contributing to Cenro

Thanks for helping make local-first AI tools more useful and more accountable.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md) and [Security Policy](SECURITY.md).
- Search existing issues before opening a new one.
- For product or architectural changes, open an issue or discussion first so the team can agree on the safety boundary.
- Never include API keys, private workspace content, personal data, or model prompts from a private project in an issue, commit, screenshot, or pull request.

## Development expectations

1. Keep the change focused. Do not mix broad reformatting with behavior changes.
2. Preserve Cenro’s core rules: local-first by default, explicit consent for external routes, review before applying edits, and no silent terminal execution.
3. Add or update tests for behavior changes. Run the project’s validation commands before opening a pull request.
4. Explain user-facing behavior, data boundaries, and any model/provider assumptions in the pull request description.
5. Use accessible UI: keyboard navigation, visible focus, readable contrast, and reduced-motion support are part of the product bar.

## Pull request checklist

- [ ] I tested the affected behavior locally.
- [ ] I did not add secrets, telemetry, or private workspace content.
- [ ] I documented any new permission, external provider, or data egress.
- [ ] I kept generated files and large binaries out of the source commit unless explicitly needed for a release.
- [ ] I updated docs, screenshots, or release notes where users would otherwise be surprised.

## Good first contributions

- Improve an existing playbook.
- Add a tested Ollama model recommendation.
- Improve error states, accessibility, or keyboard behavior.
- Fix a safe workspace-boundary edge case.
- Improve the website, documentation, or Windows setup guidance.

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
