# SelfAgent

Secure agent runtime inspired by OpenClaw-style computer use and NeMo-style modular orchestration.

## Workspace

- `services/api`: Fastify API for task intake, auth session bootstrapping, and run lifecycle
- `packages/contracts`: Shared task, plan, policy, and audit schemas
- `packages/policy`: Policy decision engine
- `packages/auth`: Tenant/session/auth helpers
- `docs/secure-openclaw-plan.md`: Product, architecture, and execution plan

## Principles

- default deny
- structured plans and typed tools
- isolated execution
- approvals for sensitive actions
- append-only auditability

## Local commands

- `npm install`
- `npm run build`
- `npm run test`
- `npm run dev`
