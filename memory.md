# Project memory

Running log of project-level context that should persist across sessions and agent invocations. Append new entries with a date; don't rewrite history.

## 2026-07-04
- Repo created: https://github.com/pr4ject4ne-code/pr4ject4ne (public).
- Agent fleet set up in `.claude/agents/`: planner, builder, code-reviewer, test-runner, debugger, docs-writer. All inherit the orchestrating session's model (no pinned `model:` field) so they scale with whatever is driving the session. See [CLAUDE.md](CLAUDE.md) for the intended pipeline.
- Evaluated and declined "ruflo" (third-party multi-agent orchestration npm package, formerly Claude Flow) due to supply-chain/cross-machine "federation" concerns — built this project's own lightweight agent fleet instead.
- Standing policy: all changes are committed and pushed to `origin` automatically without asking for confirmation each time.
