# Launch Readiness Checklist

## Purpose

This checklist defines what "fully completed" means for market and production launch.

A feature-complete backlog is not the same as a launch-ready platform. This document separates:

- what is already complete in the current codebase
- what must still be completed before production launch
- what evidence is required to mark each area as ready

Current implementation baseline:

- backlog foundations through `AGE-24` are complete
- code is on `main`
- baseline proof exists in Linear and in repo artifacts

Current launch status:

- implementation complete for the planned foundation phase
- not yet production ready

## Release Gates

The system should only be considered launch ready when all gates below are green:

1. Functional completeness
2. Security hardening
3. Runtime isolation
4. Persistence and recovery
5. Observability and incident response
6. Deployment and environment readiness
7. Performance and reliability
8. Compliance and operational governance
9. Go-live verification and sign-off

## 1. Functional Completeness

### Already Complete

- task intake and run lifecycle
- tenant-scoped auth/session foundation
- policy engine with default deny and approval paths
- append-only audit foundation
- sandbox control model
- tool gateway foundation
- secrets broker foundation
- approval inbox and resolution flow
- browser worker foundation
- shell worker foundation
- validator and reporting foundations

### Required Before Launch

- end-to-end orchestrator that connects planner, validator, browser worker, shell worker, approvals, and reporting in one real run flow
- persistent run storage instead of in-memory-only execution state
- artifact storage with durable references
- resumable runs across process restart
- operator/admin workflows for approvals, audit review, and failed-run inspection

### Required Evidence

- end-to-end smoke test run passes in a deployed environment
- restart-resume scenario passes
- artifact links survive service restart
- multi-tenant isolation test passes across all major endpoints

## 2. Security Hardening

### Already Complete

- default-deny policy posture
- tenant-scoped access checks across the current API surface
- approval requirement support for sensitive actions
- typed tool contracts and structured validation foundations

### Required Before Launch

- formal threat model review
- prompt injection and malicious content handling review
- secret redaction verification across logs, reports, and artifacts
- dependency security scan and remediation workflow
- SAST and secret scanning in CI
- abuse-rate limits and anti-exfiltration guardrails
- security review for browser, shell, and connector execution paths

### Required Evidence

- signed-off threat model
- CI security scans passing
- dependency report with no unaccepted critical issues
- redaction test cases passing
- penetration checklist completed for auth, tenant isolation, and approval bypass attempts

## 3. Runtime Isolation

### Already Complete

- sandbox lifecycle manager and policy envelope
- resource validation for CPU, memory, runtime, and process limits
- filesystem and network policy modeling

### Required Before Launch

- real sandbox backend, such as Firecracker, gVisor, or Kata
- enforced process isolation per run
- restricted filesystem mounts
- restricted outbound network egress through a controlled proxy
- hard timeout and kill behavior for runaway worker execution
- browser and shell workers bound to the real sandbox runtime

### Required Evidence

- live sandbox provision and destroy proof
- denied filesystem and denied egress test cases passing in the real runtime
- worker execution trace from inside the real sandbox
- isolation verification report documenting escape-prevention controls

## 4. Persistence and Recovery

### Already Complete

- structured domain models for tasks, runs, approvals, audit events, validation, and reporting

### Required Before Launch

- durable database for tasks, runs, approvals, and audit metadata
- durable object or blob storage for artifacts
- backup and restore strategy
- idempotent run state transitions
- recovery flow for partially completed runs
- migration strategy and schema versioning

### Required Evidence

- backup and restore drill passes
- restart recovery test passes
- migration test passes on a seeded environment
- no run-state corruption after forced process restart

## 5. Observability And Incident Response

### Already Complete

- audit event generation foundation
- structured reporting and run summaries

### Required Before Launch

- centralized logs
- metrics and dashboards
- error tracking
- alerting for failed runs, approval backlog, sandbox failures, and policy denials
- correlation ids across request, run, approval, and worker traces
- incident playbook for runtime failures and suspected abuse

### Required Evidence

- dashboard screenshots or exported dashboard definitions
- test alert firing and recovery proof
- traced run with correlated logs, metrics, and audit event chain
- documented incident response runbook

## 6. Deployment And Environment Readiness

### Already Complete

- local build, typecheck, and test workflow
- service entrypoint for the API

### Required Before Launch

- production environment definitions
- CI/CD pipeline with gated promotion
- environment-specific configuration and secret injection
- staging environment that mirrors production controls
- release rollback procedure
- health, readiness, and startup probes

### Required Evidence

- successful staging deployment
- successful production-like deployment rehearsal
- rollback rehearsal passes
- environment configuration review completed

## 7. Performance And Reliability

### Already Complete

- deterministic package-level tests for current logic

### Required Before Launch

- latency budget and throughput targets
- load testing for API and worker orchestration
- soak testing for longer-running sessions
- queue/backpressure strategy
- graceful degradation behavior for partial dependency outages

### Required Evidence

- load-test report against launch targets
- soak-test report
- failure-injection test results for key dependencies
- documented SLOs and error budget policy

## 8. Compliance And Operational Governance

### Already Complete

- audit-oriented architecture direction
- explicit approval model for sensitive actions

### Required Before Launch

- data retention policy
- audit retention and export policy
- tenant data deletion workflow
- access review process for admins and approvers
- change management policy for production rollout

### Required Evidence

- approved operating policy docs
- retention and deletion test evidence
- access review checklist completed

## 9. Go-Live Verification And Sign-Off

### Required Checklist

- `npm run build` passes on release candidate
- `npm run typecheck` passes on release candidate
- `npm run test` passes on release candidate
- live staging smoke test passes
- negative-path smoke test passes
- approval workflow passes
- browser worker smoke test passes
- shell worker smoke test passes
- reporting and summary endpoints pass
- security review is signed off
- production deployment review is signed off
- rollback plan is signed off

### Required Sign-Off Roles

- engineering owner
- security owner
- platform or infra owner
- product owner

## Current Status Snapshot

### Green

- code foundations through `AGE-24`
- repo and Linear proof alignment
- local build, typecheck, and test suite
- live local API smoke test for task, run, approval, summary, report, and tenant denial

### Yellow

- end-to-end production orchestration
- persistent state and artifact durability
- real sandbox runtime
- real browser runtime
- deployment pipeline and staging verification
- observability and alerting

### Red

- production launch sign-off
- hardened runtime isolation proof
- disaster recovery proof
- load and reliability proof

## Immediate Next Work

1. Add persistent storage for tasks, runs, approvals, audits, and artifacts.
2. Replace the in-memory sandbox model with a real isolated runtime backend.
3. Replace the deterministic browser adapter with a real browser execution backend.
4. Add deployment pipeline, staging environment, and production configuration.
5. Add observability, alerting, and incident runbooks.
6. Run launch-gate verification and capture artifacts for each gate.
