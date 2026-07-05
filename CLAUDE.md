# Session start

Read [memory.md](memory.md) before starting any work — it's the cross-session log of decisions, state, and standing policies. This file (CLAUDE.md) is auto-loaded; memory.md is not.

# Agent workflow

This project defines subagents in `.claude/agents/`. Intended pipeline for non-trivial work:

0. **scout** — cheap, fast, read-only reconnaissance (pinned to haiku). Use it for "where is X / what references Y" lookups instead of spending main-session context on searches. Feed its findings to planner.
1. **planner** — scope the task before writing code. Produces an ordered, file-specific plan with per-phase verification commands, marks parallelizable steps, and surfaces open decisions/risks. Skip for trivial one-line fixes. For any page/screen work, read the matching file in `docs/pages/` first (one file per page — homepage, login, first-aid, dashboard, etc.) — that's the source of truth for that page's confirmed design, freely readable by all agents but the planner's primary input.
2. **builder** — implements the plan (or a directly scoped task) end-to-end, verifies with the project's build/lint/test commands, then commits and pushes per the git policy below. Steps the planner marked parallelizable can be fanned out to multiple builders on disjoint files.
3. **test-runner** and **code-reviewer** — run in parallel after building: independent test verification plus a diff review for correctness/security bugs and unnecessary complexity. A change isn't done until both pass.
4. **security-auditor** — mandatory (not optional) when the change touches auth, user input, file/network handling, or secrets; also for periodic dependency audits. Deeper than code-reviewer's inline security pass.
5. **docs-writer** — only if the change affects documented behavior (README, API docs, CLI usage).

**debugger** is invoked out-of-band whenever behavior is broken and the cause isn't yet known — before planner, since you can't plan a fix for a cause you haven't found.

**devops** owns everything between committed code and a running service: CI/CD workflows, Dockerfiles, env/secrets config, observability, release safety. Invoke it when project infrastructure is being created or changed, not per-feature.

Efficiency rules for the orchestrator:
- Delegate searches to scout; keep the main session's context for decisions and synthesis.
- Fan out independent work (parallel builders on disjoint files; test-runner + code-reviewer simultaneously).
- Skip pipeline stages that add nothing: trivial fixes go straight to builder; docs-writer only when documented behavior changed.

None of these subagents can invoke each other (no `Agent` tool); the orchestrating session decides when to call each one. All agents except scout inherit the orchestrating session's model rather than pinning one, so agent quality/cost scales with whatever is driving the session; scout pins haiku because reconnaissance needs speed, not depth.

# Production readiness checklist

A service in this project is not production-ready until every item below is satisfied. Each item names the agent that owns it. When code first lands in this repo, devops sets up CI enforcing the automatable items.

- **Security** (security-auditor): no unvalidated input reaching a sink, authz checked on every endpoint, no secrets in code/logs/git history, dependency audit clean or triaged, secure cookie/CORS/CSP settings for web surfaces.
- **Testing** (test-runner gates it, builder writes them): automated tests exist for core logic and failure paths, and the full suite passes in CI — not just locally.
- **CI/CD** (devops): every push runs lint + tests + security scans; deploys only from green builds; pipeline has no long-lived plaintext secrets.
- **Config & secrets** (devops): all config via environment variables; `.env.example` documents every variable; real secrets only in the platform secret store.
- **Error handling** (builder, code-reviewer verifies): failures produce actionable errors without leaking internals; external calls have timeouts; no swallowed exceptions.
- **Observability** (devops): structured logs without PII/secrets, a health/liveness endpoint, error reporting wired up.
- **Data safety** (planner flags, builder implements): migrations are reversible or forward-fixable; destructive operations require confirmation; backups exist before schema changes in production.
- **Performance** (code-reviewer flags, planner budgets): no N+1 query patterns or unbounded result sets on hot paths; pagination on list endpoints.
- **Accessibility & UX baseline** (builder, for web UIs): semantic HTML, keyboard navigability, labels on form controls.
- **Docs** (docs-writer): README covers setup, env vars, how to run tests, and how to deploy.

# Persistent context

See [memory.md](memory.md) for a running, dated log of project-level decisions and state that should survive across sessions. Append to it, don't rewrite it.

# Git policy

All changes are committed and pushed to `origin` automatically after being made — no need to ask for confirmation before pushing. Destructive git operations (force-push, reset --hard, history rewrites) are excluded from this and still require explicit confirmation.
