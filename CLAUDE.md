# Agent workflow

This project defines subagents in `.claude/agents/`. Intended pipeline for non-trivial work:

0. **scout** — cheap, fast, read-only reconnaissance (pinned to haiku). Use it for "where is X / what references Y" lookups instead of spending main-session context on searches. Feed its findings to planner.
1. **planner** — scope the task before writing code. Produces an ordered, file-specific plan with per-phase verification commands, marks parallelizable steps, and surfaces open decisions/risks. Skip for trivial one-line fixes.
2. **builder** — implements the plan (or a directly scoped task) end-to-end, verifies with the project's build/lint/test commands, then commits and pushes per the git policy below. Steps the planner marked parallelizable can be fanned out to multiple builders on disjoint files.
3. **test-runner** and **code-reviewer** — run in parallel after building: independent test verification plus a diff review for correctness/security bugs and unnecessary complexity. A change isn't done until both pass.
4. **docs-writer** — only if the change affects documented behavior (README, API docs, CLI usage).

**debugger** is invoked out-of-band whenever behavior is broken and the cause isn't yet known — before planner, since you can't plan a fix for a cause you haven't found.

Efficiency rules for the orchestrator:
- Delegate searches to scout; keep the main session's context for decisions and synthesis.
- Fan out independent work (parallel builders on disjoint files; test-runner + code-reviewer simultaneously).
- Skip pipeline stages that add nothing: trivial fixes go straight to builder; docs-writer only when documented behavior changed.

None of these subagents can invoke each other (no `Agent` tool); the orchestrating session decides when to call each one. All agents except scout inherit the orchestrating session's model rather than pinning one, so agent quality/cost scales with whatever is driving the session; scout pins haiku because reconnaissance needs speed, not depth.

# Persistent context

See [memory.md](memory.md) for a running, dated log of project-level decisions and state that should survive across sessions. Append to it, don't rewrite it.

# Git policy

All changes are committed and pushed to `origin` automatically after being made — no need to ask for confirmation before pushing. Destructive git operations (force-push, reset --hard, history rewrites) are excluded from this and still require explicit confirmation.
