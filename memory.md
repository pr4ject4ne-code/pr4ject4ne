# Project memory

Running log of project-level context that should persist across sessions and agent invocations. Append new entries with a date; don't rewrite history.

## 2026-07-04
- Repo created: https://github.com/pr4ject4ne-code/pr4ject4ne (public).
- Agent fleet set up in `.claude/agents/`: planner, builder, code-reviewer, test-runner, debugger, docs-writer. All inherit the orchestrating session's model (no pinned `model:` field) so they scale with whatever is driving the session. See [CLAUDE.md](CLAUDE.md) for the intended pipeline.
- Evaluated and declined "ruflo" (third-party multi-agent orchestration npm package, formerly Claude Flow) due to supply-chain/cross-machine "federation" concerns — built this project's own lightweight agent fleet instead.
- Standing policy: all changes are committed and pushed to `origin` automatically without asking for confirmation each time.
- Agent system upgraded: added `scout` (haiku-pinned read-only recon agent); planner now emits a structured handoff format with per-phase verification commands and parallelizable-step markers; builder auto-commits/pushes per git policy; test-runner + code-reviewer declared parallel; CLAUDE.md gained orchestrator efficiency rules (delegate searches to scout, fan out independent work, skip needless stages).
- Production-readiness pass: added `security-auditor` (systematic OWASP-style audits, mandatory for changes touching auth/input/secrets) and `devops` (CI/CD, containers, config/secrets, observability, release safety). CLAUDE.md now has a production readiness checklist (security, testing, CI/CD, config, error handling, observability, data safety, performance, accessibility, docs) with named agent owners. When first code lands, devops should set up GitHub Actions CI enforcing the automatable items.
