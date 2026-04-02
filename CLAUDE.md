# Claude Code Harness Practices

This repository follows Claude Code-style harness practices adapted for secure agent platform work.

## Working rules

- prefer small, reviewable changes over broad rewrites
- keep contracts and runtime boundaries explicit
- default to typed interfaces and schema validation
- record assumptions in docs when behavior is security-sensitive
- treat policy and audit changes as first-class code, not support code

## Development workflow

- use git worktrees for parallel tasks with isolated file ownership
- keep branch names aligned to tracked tasks
- run focused checks before merge
- merge completed branches back into `main` after validation

## Repo conventions

- `packages/contracts` owns shared schemas and enums
- `packages/policy` owns policy evaluation logic
- `packages/auth` owns tenant/session/authn/authz primitives
- `services/api` composes packages into HTTP endpoints

## Security posture

- no secrets in source or fixtures
- no direct raw tool execution from model-facing layers
- no implicit allow behavior in policy evaluation
