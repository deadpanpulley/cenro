# Cenro release checklist

## Product readiness

- [ ] Confirm the build, type checks, tests, and audit checks pass on a clean Windows machine.
- [ ] Exercise onboarding with no Ollama installation, Ollama with no models, and the recommended model kit.
- [ ] Test Local, Smart, web consent, cloud consent, provider failure, workspace containment, diff review, Apply/Discard, and terminal rejection/approval flows.
- [ ] Check keyboard navigation, visible focus, contrast, compact layout, and reduced-motion behavior.
- [ ] Confirm no generated change or agent command runs without a visible user action.

## Privacy and security

- [ ] Inspect task history, logs, exported receipts, crash reporting, and screenshots for secrets or provider keys.
- [ ] Confirm secret-looking files are excluded from every model/provider context path.
- [ ] Confirm cloud consent shows provider, model, selected files, character count, and route reason.
- [ ] Confirm provider secrets use OS-backed encryption and are not shipped in configuration or bundled source.
- [ ] Confirm the production installer is code-signed if a signing certificate is available.

## Windows delivery

- [ ] Build and install the NSIS installer on a clean Windows 10/11 VM or device.
- [ ] Test the portable build, uninstall flow, update behavior, and no-admin install path.
- [ ] Add SHA-256 checksums and concise release notes to the GitHub release.
- [ ] Verify the release download URL used by the website.

## Open-source launch

- [ ] Create the public `cenro-ai/cenro` repository or update every placeholder link to the final repository.
- [ ] Set description, homepage, Apache-2.0 license, and topics: `local-llm`, `ollama`, `coding-agent`, `ai-devtools`, `local-first`, `electron`, `monaco-editor`, `openai-devtools`.
- [ ] Add the 1280×640 PNG social card, a lightweight demo GIF, product screenshots, and a current README.
- [ ] Check CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue forms, and the release notes.
- [ ] Confirm the README’s model claims match the installed/onboarding experience.

## Website and X launch

- [ ] Replace all `cenro.dev` placeholder URLs with the verified production domain.
- [ ] Replace temporary social SVG metadata with the generated 1280×640 PNG.
- [ ] Validate Open Graph/Twitter previews after Vercel deploy.
- [ ] Verify canonical URL, sitemap, robots, JSON-LD, performance, and mobile layout.
- [ ] Publish the launch post and 50-second video after the release URL is live.
