# Cenro

> **Your files. Your models. Your choice.**

Cenro is a Windows-first, local-first AI workspace for coding, research, and learning. It runs local models through Ollama, makes routing visible, and keeps file changes and terminal commands reviewable before anything happens.

## Why Cenro

- **Local by default:** use Ollama models without an account or cloud dependency.
- **Smart, not opaque:** a compact local router recommends the worker, playbook, and tool boundary, then shows a route receipt.
- **Review before apply:** inspect code diffs and multi-file changes before writing to a workspace.
- **Cloud only by consent:** when a task needs an external provider, see the provider, model, scope, and character count first.
- **A terminal with manners:** Cenro can propose a command; only the user runs it.

## The model kit

| Role | Recommended Ollama model | Why |
| --- | --- | --- |
| Router | `qwen3:1.7b` | Selects a workflow and data boundary. |
| Builder | `qwen2.5-coder:3b` | Builds and reviews focused code changes. |
| Research (optional) | `qwen3:4b` | Adds depth for research and learning tasks. |

Any installed Ollama model can be selected. DeepSeek and GLM work locally when an Ollama-compatible build is installed; their hosted APIs belong behind an explicit provider configuration and consent screen.

## Local development

```powershell
npm install
npm run dev
```

Start Ollama before launching Cenro. The app must not install software, download a model, apply a generated change, or run an AI-suggested command without a visible user action.

## Open source launch checklist

Before publishing, replace placeholder GitHub and `cenro.dev` URLs, add the generated social card and product screenshots, configure repository topics, and follow [`docs/GITHUB-LAUNCH.md`](docs/GITHUB-LAUNCH.md). The public repository is licensed under [Apache-2.0](LICENSE).
