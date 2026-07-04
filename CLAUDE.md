# Agent workflow

This project defines subagents in `.claude/agents/`. Intended pipeline for non-trivial work:

1. **planner** — scope the task before writing code. Produces an ordered, file-specific plan and surfaces open decisions/risks. Skip for trivial one-line fixes.
2. **builder** — implements the plan (or a directly scoped task) end-to-end, verifying with whatever build/lint/test commands exist in the project.
3. **test-runner** — independent verification pass after building; runs the test suite and diagnoses any failures without assuming builder's self-check was sufficient.
4. **code-reviewer** — reviews the resulting diff for correctness/security bugs and unnecessary complexity before the change is considered done.
5. **docs-writer** — only if the change affects documented behavior (README, API docs, CLI usage).

**debugger** is invoked out-of-band whenever behavior is broken and the cause isn't yet known — before planner, since you can't plan a fix for a cause you haven't found.

None of these subagents can invoke each other (no `Agent` tool); the orchestrating session decides when to call each one. All agents inherit the orchestrating session's model rather than pinning one, so agent quality/cost scales with whatever is driving the session.

# Persistent context

See [memory.md](memory.md) for a running, dated log of project-level decisions and state that should survive across sessions. Append to it, don't rewrite it.

# Git policy

All changes are committed and pushed to `origin` automatically after being made — no need to ask for confirmation before pushing. Destructive git operations (force-push, reset --hard, history rewrites) are excluded from this and still require explicit confirmation.
