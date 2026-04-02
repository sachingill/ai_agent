# Secure OpenClaw / NeMo-Inspired System Plan

## 1. Goal

Build a system similar in spirit to an "OpenClaw"-style autonomous computer-use agent, while also taking inspiration from NeMo-style enterprise agent design:

- accepts a user goal
- plans tasks
- uses tools such as browser, terminal, file operations, and APIs
- executes multi-step workflows
- reports progress and artifacts back to the user
- supports modular agent roles, guardrails, and production deployment patterns

But unlike a typical open autonomous agent, this system is designed with security as a first-class constraint:

- least privilege by default
- strict isolation between tenants, sessions, and tools
- explicit approval for risky actions
- strong auditability and replayability
- policy-driven execution instead of blind agent freedom

Assumption:
This plan interprets "OpenClaw" as the computer-use, tool-using, browser-and-shell automation side of the system, and "NeMo" as inspiration for modular orchestration, guardrails, enterprise deployment, observability, and policy-aware runtime design. If you meant a specific project or repo for either reference, we can tune this plan against that exact baseline.

## 2. Design Inspiration

This plan intentionally combines two design instincts:

- OpenClaw-like capabilities:
  - goal-driven task execution
  - browser and shell interaction
  - multi-step autonomous workflows
  - artifact-oriented output
- NeMo-like platform qualities:
  - modular agents and tool adapters
  - guardrails and validation around model behavior
  - production-grade observability
  - enterprise deployment, governance, and policy controls

The target system should feel like:

- an OpenClaw-style operator from the user perspective, and
- a NeMo-style governed runtime from the platform and security perspective

## 3. Product Vision

The product is a secure agent runtime that can:

- run goal-driven workflows on behalf of a user
- interact with apps, websites, APIs, and local/remote workspaces
- execute in isolated sandboxes
- require human confirmation for sensitive actions
- enforce organization-specific security policies
- generate complete audit logs for every decision and action

Primary outcome:
Enable high-leverage task automation without granting the agent unrestricted access to secrets, infrastructure, or endpoints.

Additional product direction from NeMo-style systems:

- separate planning, execution, validation, and reporting into explicit runtime roles
- prefer structured intermediate state over opaque freeform agent loops
- make guardrails, telemetry, and deployment controls part of the platform, not add-ons
- support model portability so the orchestration layer is not tightly coupled to one provider

## 4. Core Principles

1. Default deny
No tool, network route, filesystem path, credential, or action is available unless explicitly allowed.

2. Human in control
High-risk actions always pause for approval or require pre-approved policy.

3. Isolation everywhere
Each run gets isolated compute, storage, credentials, and network posture.

4. Observable by design
Every model decision, tool call, approval, secret access, and external side effect is logged.

5. Verifiable execution
Plans, tool requests, and outputs are structured so they can be validated and replayed.

6. Defense in depth
Security is enforced across policy engine, sandbox, network, secrets, runtime, and monitoring layers.

7. Modular orchestration
Planner, executor, validator, and reporter responsibilities should be separable so they can be independently improved, tested, or swapped.

8. Guardrails before autonomy
Validation, policy checks, and tool constraints must surround the model loop so autonomy increases only inside bounded safety controls.

## 5. Scope

### In Scope for V1

- user task intake
- planner/executor loop
- browser automation
- shell execution in sandbox
- file read/write inside restricted workspace
- connector/API tool calls
- policy engine and approval gates
- secret vault integration
- audit logs
- multi-tenant access control
- admin security dashboard

### Out of Scope for V1

- fully autonomous background agents with unrestricted internet access
- self-modifying runtime infrastructure
- unrestricted local desktop control on employee machines
- cross-tenant shared execution environments
- plugin marketplace without code signing/review

## 5. Users and Roles

### End User

- submits tasks
- reviews plans
- approves sensitive actions
- receives outputs

### Admin / Security Team

- defines policies
- approves connectors and tools
- reviews logs and incidents
- manages tenants, roles, and quotas

### Developer / Integrator

- adds new tools/connectors
- defines policy metadata for each tool
- maintains sandbox images and execution templates

## 6. High-Level Architecture

### Control Plane

- Web App / API Gateway
- AuthN/AuthZ Service
- Task Orchestrator
- Policy Decision Point (PDP)
- Approval Service
- Audit Service
- Secrets Broker
- Connector Registry
- Tenant Management

### Execution Plane

- Ephemeral Sandbox Runner
- Browser Worker
- Shell Worker
- File Workspace Mount
- Network Egress Proxy
- Tool Adapter Runtime
- Result/Artifact Store

### Intelligence Plane

- Planner Model
- Executor Model
- Classifier / Risk Scorer
- Guardrail Validators
- Summarizer / Reporter

## 7. Reference Request Flow

1. User submits a goal.
2. System authenticates user and loads tenant policy.
3. Planner produces a structured plan with required tools, resources, and risk labels.
4. Policy engine evaluates the plan.
5. Restricted or risky steps are marked as:
   - auto-allowed
   - require approval
   - denied
6. Orchestrator provisions an isolated sandbox for allowed steps.
7. Executor performs one step at a time through typed tool APIs.
8. Every tool call is validated against policy before execution.
9. Outputs are scanned, normalized, and logged.
10. If a step triggers a sensitive action, the run pauses for user/admin approval.
11. Final outputs and a complete audit trail are stored.

## 8. Security Architecture

### 8.1 Identity and Access

- SSO with OIDC/SAML
- short-lived session tokens
- tenant-scoped RBAC
- service-to-service mTLS
- workload identity for runtime components
- just-in-time elevation for admin actions

### 8.2 Execution Isolation

- one ephemeral sandbox per run or per sensitive task segment
- container or microVM isolation
- read-only base image
- writable ephemeral overlay
- CPU, memory, process, and syscall limits
- no host socket mounting
- no Docker-in-Docker for user workloads

Preferred stack:

- Firecracker microVMs for strongest isolation, or
- gVisor/Kata Containers as a pragmatic first secure runtime

### 8.3 Filesystem Security

- explicit workspace mounts only
- path allowlists
- write restrictions by directory
- artifact quarantine for downloaded/generated files
- malware/content scanning on ingress/egress
- immutable logs outside task workspace

### 8.4 Network Security

- default no outbound internet
- outbound only through egress proxy
- domain/IP allowlists per tool and tenant
- DNS logging and filtering
- request signing for internal services
- rate limiting and data exfiltration thresholds

### 8.5 Secrets Security

- secrets never embedded in prompts
- secrets fetched just in time from vault
- scope secrets to tool + tenant + run
- automatic expiration and revocation
- redact secrets from logs, screenshots, stdout, and model context

### 8.6 Tool Security

- every tool has a manifest:
  - input schema
  - output schema
  - risk class
  - allowed side effects
  - network scope
  - secret requirements
  - approval requirements
- tools execute behind a policy-enforcing adapter, not direct model access
- no arbitrary shell access unless explicitly granted

### 8.7 Prompt and Model Security

- prompt injection detection on web pages, docs, and tool outputs
- content trust labels for retrieved data
- structured planning instead of raw chain-of-thought exposure
- system prompts locked server-side
- model output validation before action execution
- per-step grounding and reason codes

### 8.8 Data Security

- tenant data isolation at DB and storage layers
- encryption in transit and at rest
- optional customer-managed keys
- retention controls
- PII classification and redaction

## 9. Threat Model

### Primary Threats

1. Prompt injection via websites, documents, emails, or tickets
2. Secret exfiltration through outputs, screenshots, logs, or network calls
3. Sandbox escape from browser or shell runtime
4. Cross-tenant data leakage
5. Over-privileged tools enabling destructive actions
6. Malicious plugin or connector code
7. Unauthorized admin actions
8. Model hallucination causing unsafe execution
9. Supply-chain compromise of base images or dependencies
10. Abuse of autonomous loops causing cost or damage

### Key Mitigations

- structured tool invocation only
- isolated sandboxes
- outbound proxy with allowlists
- approval gates
- signed plugins and reviewed connectors
- vault-based secrets
- anomaly detection and kill switch
- image signing and SBOMs
- action budgets and rate limits

## 10. Trust Boundaries

### Boundary A: User Interface to Control Plane

- authenticated requests only
- CSRF/session protections
- request validation

### Boundary B: Control Plane to Model Layer

- sanitized inputs
- no raw secret forwarding
- output schema checks

### Boundary C: Control Plane to Execution Plane

- signed execution tokens
- tenant/run scoped permissions
- immutable policy snapshot per run

### Boundary D: Execution Plane to External Internet / SaaS

- egress proxy
- connector auth mediation
- DLP checks

### Boundary E: Tenant Data to Shared Platform

- row-level and storage-level isolation
- encryption and audit enforcement

## 11. Core Components

### 11.1 Task Intake API

Responsibilities:

- accept task descriptions
- capture tenant, user, sensitivity, and objective metadata
- attach files or references
- assign policy context

Data shape:

- task id
- tenant id
- user id
- goal
- attachments
- allowed tools
- sensitivity level
- requested output format

### 11.2 Planner

Responsibilities:

- convert user goal into structured DAG/step plan
- identify required tools and data sources
- estimate risk per step
- produce approval checkpoints

Planner output example:

- step id
- description
- required tool
- expected inputs
- expected side effects
- risk level
- approval required
- fallback path

### 11.3 Policy Engine

Responsibilities:

- evaluate each step against organization rules
- allow/deny/escalate actions
- enforce runtime quotas and resource limits

Policy examples:

- browser allowed only for approved domains
- shell allowed only in `/workspace/project`
- no writes to `.env` or secret paths
- no outbound uploads without approval
- payment/admin portal interactions always require approval

### 11.4 Approval Service

Responsibilities:

- render human-readable summaries of risky actions
- collect approval/deny decisions
- record approver identity and time
- re-validate context after approval

### 11.5 Execution Orchestrator

Responsibilities:

- provision isolated runtime
- dispatch step to correct worker
- maintain step state machine
- retry safe-idempotent operations
- stop on policy violation or anomaly

### 11.6 Tool Gateway

Responsibilities:

- expose typed tools to the executor
- validate schemas
- enforce policy before invocation
- normalize outputs
- redact sensitive data

### 11.7 Browser Worker

Responsibilities:

- isolated browser automation
- DOM and screenshot capture
- action replay trace
- page content safety scanning

Preferred features:

- Playwright-based control
- per-domain cookie isolation
- file download quarantine
- prompt injection detector on visible page text and hidden metadata

### 11.8 Shell Worker

Responsibilities:

- execute approved commands in restricted environment
- log stdout/stderr
- cap runtime/resources
- block disallowed binaries/paths

Preferred controls:

- allowlist commands or command families
- seccomp/AppArmor policies
- readonly rootfs
- no credential persistence

### 11.9 Secrets Broker

Responsibilities:

- retrieve short-lived credentials
- inject them only into the required tool runtime
- rotate/revoke automatically

### 11.10 Audit and Telemetry

Responsibilities:

- append-only logs
- step-by-step traceability
- searchable security events
- replay support for incidents

## 12. Tooling Model

Tools should be grouped by risk and capability.

### Low Risk

- read-only HTTP fetch to approved domains
- search internal docs
- read files in approved workspace
- structured DB read through approved queries

### Medium Risk

- write files in workspace
- create tickets/docs
- run build/test commands
- browser form filling in non-sensitive systems

### High Risk

- send email/slack externally
- make purchases
- modify production configs
- run arbitrary shell commands
- upload files externally
- access admin panels or billing systems

Policy rule:
Only low-risk tools should be auto-approvable by default in V1.

## 13. Suggested Technology Stack

### Frontend

- Next.js or React SPA
- Tailwind or component library with strict auth-aware UX
- approval workflow UI
- audit viewer

### Backend

- TypeScript with NestJS or Fastify
- Temporal for workflow orchestration
- PostgreSQL for metadata
- Redis for queues/caching if needed

### Execution Runtime

- Kubernetes for control and scheduling
- Firecracker/Kata/gVisor-backed runners
- Playwright for browser automation
- hardened shell runner in microVM/container

### Security / Infra

- HashiCorp Vault or cloud-native secret manager
- OPA or Cedar for policy evaluation
- OpenTelemetry + SIEM integration
- Cosign for image signing
- Trivy/Grype for scanning

### Storage

- S3-compatible object store for artifacts
- PostgreSQL row-level tenancy
- immutable audit log sink

## 14. Data Model

Core entities:

- Tenant
- User
- Role
- Policy
- Task
- TaskRun
- PlanStep
- ApprovalRequest
- ToolDefinition
- ToolInvocation
- SecretLease
- Artifact
- AuditEvent
- Incident

Important relationships:

- tenant has many users, policies, tasks
- task has many runs
- run has many plan steps, approvals, tool invocations, artifacts, audit events

## 15. Policy Design

Represent policy in a machine-enforceable form.

Example dimensions:

- actor: user role, team, tenant
- tool: browser, shell, connector, file
- target: domain, path, resource type
- action: read, write, delete, execute, upload
- context: sensitivity, environment, time, location
- decision: allow, deny, require approval

Example policy rules:

- Engineers may run `npm test` in project sandboxes without approval.
- Any `git push` requires approval unless repo is marked dev-only.
- Browser access to banking, identity, billing, or admin domains always requires approval.
- File uploads outside tenant-owned domains are denied by default.
- Access to production credentials is denied for autonomous runs.

## 16. Approval UX

Approval prompts must be precise and readable.

Approval card fields:

- action summary
- why the agent wants to do it
- impacted system/resource
- data leaving trust boundary
- tool requested
- exact command or web action
- risk rating
- approve once / approve for run / deny

## 17. Observability and Incident Response

### Required Telemetry

- task lifecycle events
- tool invocation events
- policy decisions
- approvals
- secret access
- network egress
- filesystem writes
- browser navigation/action trails
- model latency/cost/error metrics

### Incident Features

- kill switch per run
- tenant-wide emergency disable
- replay a run from logs
- diff planned vs executed actions
- alert on anomalous behavior

## 18. Non-Functional Requirements

### Security

- strong isolation between runs
- zero long-lived secrets in sandboxes
- full audit coverage of privileged actions

### Reliability

- resumable workflows
- idempotent retries for safe steps
- graceful failure with partial artifacts

### Performance

- plan generation under 5 seconds for standard tasks
- sandbox startup under 10 seconds target

### Compliance Readiness

- audit export
- retention controls
- approval traceability
- support SOC2-oriented evidence collection

## 19. Multi-Agent Runtime Blueprint

To make the NeMo-inspired guidance concrete, the runtime should be split into explicit cooperating roles instead of one unconstrained agent loop.

### Runtime Roles

#### 1. Supervisor

- owns the run lifecycle
- tracks budget, approvals, and policy posture
- decides whether to continue, pause, escalate, or terminate

#### 2. Planner

- turns the user goal into a structured step graph
- identifies required tools, dependencies, and expected outputs
- proposes approval checkpoints before execution starts

#### 3. Executor

- performs one approved step at a time
- calls typed tools through the tool gateway
- never bypasses policy or secrets controls

#### 4. Validator

- checks whether a step result satisfies the intended objective
- verifies schema, safety, and side-effect boundaries
- detects hallucinated success or suspicious outputs

#### 5. Risk and Guardrail Agent

- classifies actions, targets, and data movement
- scores risk continuously as execution context changes
- requests human approval when runtime conditions drift

#### 6. Reporter

- summarizes progress, blockers, artifacts, and next actions
- produces user-facing status updates and audit-friendly reports

### Recommended Runtime Flow

1. Supervisor creates run context with immutable tenant policy snapshot.
2. Planner emits structured plan with dependencies and risk metadata.
3. Policy engine pre-screens all steps.
4. Supervisor provisions isolated runtime for the first allowed step.
5. Executor performs the step through the tool gateway.
6. Validator checks result quality and policy conformance.
7. Risk agent reevaluates whether the next step still qualifies for auto-execution.
8. Supervisor either continues, pauses for approval, retries safely, or terminates.
9. Reporter emits progress summary and stores artifacts.

### Why This Split Matters

- it reduces single-agent overreach
- it improves observability and testing
- it allows separate models or heuristics per role
- it fits enterprise controls better than one opaque autonomous loop

## 20. Service Map

The platform should be split into clear services with ownership boundaries.

### User-Facing Services

#### Web Console

- task submission
- plan review
- approval inbox
- artifact viewer
- audit explorer

#### Admin Console

- policy management
- connector approvals
- tenant settings
- incident review
- runtime kill switches

### Core Platform Services

#### API Gateway

- authenticated entrypoint
- request validation
- rate limiting
- tenant routing

#### Orchestrator Service

- run state machine
- step scheduling
- retry logic
- timeout and cancellation handling

#### Policy Service

- allow/deny/approval decisions
- policy simulation
- runtime constraint evaluation

#### Approval Service

- approval requests
- approver workflows
- approval evidence and timestamps

#### Audit Service

- immutable event ingestion
- trace reconstruction
- export for compliance and investigations

#### Secret Broker

- short-lived credential issuance
- scoped secret injection
- lease rotation and revocation

#### Tool Gateway

- typed tool registration
- schema validation
- policy enforcement
- output normalization and redaction

### Execution Services

#### Sandbox Manager

- ephemeral runtime provisioning
- microVM/container lifecycle
- resource ceilings

#### Browser Worker

- Playwright session control
- trace and screenshot capture
- download quarantine

#### Shell Worker

- approved command execution
- stdout/stderr capture
- path and process restrictions

#### Connector Workers

- SaaS/API integrations
- typed side-effect boundaries
- connector-specific auth mediation

#### Egress Proxy

- outbound filtering
- DNS control
- exfiltration monitoring

### Data Services

#### Metadata Store

- tasks
- runs
- plan steps
- approvals
- tool invocations

#### Artifact Store

- files
- screenshots
- browser traces
- structured outputs

#### Security Telemetry Store

- policy decisions
- network events
- secret access logs
- anomaly signals

## 21. Prioritized Task List

This is the recommended implementation order for delivery and tracking.

### P0: Foundations and Safety Gates

1. Tenant-aware auth, RBAC, and session model
2. Task intake API and run lifecycle model
3. Structured plan schema for planner, executor, and validator roles
4. Policy engine MVP with allow, deny, and approval decisions
5. Append-only audit event pipeline

### P1: Secure Execution Core

6. Ephemeral sandbox manager with restricted filesystem and resource limits
7. Tool gateway with typed contracts and policy interception
8. Secrets broker with short-lived scoped leases
9. Approval service and approval inbox UI
10. Browser worker with domain allowlists, trace capture, and quarantine

### P2: Controlled Write Actions

11. Shell worker with command allowlists and execution budgets
12. Workspace file write controls and artifact scanning
13. Basic connector SDK for approved SaaS/API tools
14. Validator service for result verification and unsafe-output detection
15. Reporter service for user updates and run summaries

### P3: Enterprise Hardening

16. Egress proxy with domain/IP filtering and network telemetry
17. DLP and exfiltration heuristics
18. Prompt injection detection and trust labeling
19. Security dashboard and incident replay tooling
20. Signed plugin/connector packaging model

### P4: Pilot Readiness

21. Policy simulation and dry-run mode
22. Budget controls and anomaly throttling
23. Tenant self-service policy management
24. Compliance exports and retention controls
25. Pilot runbooks, SLOs, and on-call procedures

### Priority and Order Summary

- first priority: auth, policy, audit, and run control
- second priority: sandboxing, tool gateway, secrets, and approvals
- third priority: browser, shell, validators, and controlled write paths
- fourth priority: enterprise hardening and pilot operations

## 22. Delivery Plan

### Phase 0: Discovery and Threat Modeling

Deliverables:

- product requirements doc
- threat model
- trust boundary diagram
- tool risk taxonomy
- initial architecture decision records

Duration:
1 to 2 weeks

### Phase 1: Secure Core Platform

Build:

- auth and tenant model
- task intake API
- orchestrator skeleton
- policy engine MVP
- ephemeral sandbox provisioning
- audit event pipeline

Exit criteria:

- can accept a task, create a run, enforce basic policy, and log all actions

Duration:
2 to 4 weeks

### Phase 2: Low-Risk Tool Execution

Build:

- read-only browser
- restricted file reader
- approved-domain HTTP fetch
- structured planner/executor loop
- approval workflow UI

Exit criteria:

- supports safe read-heavy automation with human review checkpoints

Duration:
2 to 3 weeks

### Phase 3: Write Actions with Approval

Build:

- file write tool
- ticket/doc creation connectors
- shell runner with command allowlists
- secrets broker integration
- artifact quarantine/scanning

Exit criteria:

- supports controlled write operations with policy and approval gates

Duration:
3 to 5 weeks

### Phase 4: Enterprise Security Hardening

Build:

- outbound egress proxy
- DLP and exfiltration detection
- signed plugin model
- anomaly detection
- security dashboard
- incident replay tooling

Exit criteria:

- platform ready for internal pilot in security-conscious environments

Duration:
3 to 6 weeks

### Phase 5: Pilot and Expansion

Build:

- tenant self-service policies
- connector SDK
- advanced approvals
- budget controls
- runbooks and ops tooling

## 23. MVP Recommendation

If we want the fastest credible version, build this MVP:

- task intake UI/API
- planner generating structured steps
- policy engine with allow/deny/approval
- isolated browser worker
- isolated shell worker with allowlisted commands only
- workspace file read/write with path restrictions
- vault-backed secrets broker
- approval UI
- append-only audit log

Avoid in MVP:

- arbitrary plugin loading
- unrestricted internet browsing
- autonomous background scheduling without approvals
- production system mutation

## 24. Suggested Repo/Service Breakdown

### services/web

- user UI
- admin UI
- approval UI
- audit viewer

### services/api

- REST/gRPC API
- auth
- task intake
- orchestration endpoints

### services/orchestrator

- workflow engine integration
- step execution state machine

### services/policy

- policy evaluation service
- reusable decision API

### services/runner

- sandbox lifecycle management
- command/browser dispatch

### services/tool-gateway

- tool registry
- adapter execution
- schema validation

### services/audit

- event ingest
- immutable storage/export

### packages/sdk

- typed tool contracts
- event contracts
- policy types

### packages/security

- redaction
- prompt injection detection
- DLP helpers

## 25. API Sketch

### POST /tasks

Create a task with:

- goal
- attachments
- allowedTools
- sensitivity

### POST /tasks/:id/runs

Start a run.

### GET /runs/:id

Get run status, plan, steps, approvals, artifacts.

### POST /runs/:id/approve/:approvalId

Approve a blocked action.

### POST /runs/:id/cancel

Kill the run.

### GET /runs/:id/audit

Get full audit trail.

## 26. Security Acceptance Criteria

The system is not ready until all are true:

- every tool invocation is policy checked
- every sensitive action is either denied or approved
- secrets are never stored in prompts or persistent sandbox disks
- cross-tenant access tests pass
- egress restrictions are enforceable
- audit logs cannot be altered by task runners
- sandboxes are ephemeral and isolated
- all artifacts are attributable to a run and actor

## 27. Testing Strategy

### Unit Tests

- policy decision logic
- schema validation
- redaction logic
- risk scoring

### Integration Tests

- task to plan to execution flow
- approval gates
- vault lease injection
- runner isolation guarantees

### Security Tests

- prompt injection scenarios
- SSRF attempts
- sandbox escape probes
- cross-tenant authorization tests
- command injection tests
- data exfiltration simulation

### Adversarial Evaluations

- malicious webpage instructing agent to reveal secrets
- ticket/comment trying to override system policy
- poisoned connector output
- deceptive UI automation flow

## 28. Risks and Open Decisions

### Major Risks

- runtime isolation weaker than expected
- too much friction from approvals
- model output reliability for multi-step execution
- high cost if long-lived browser sessions are common
- connector sprawl increasing attack surface

### Open Decisions

- Firecracker vs gVisor/Kata for first release
- OPA vs Cedar for policy language
- Temporal vs custom orchestration
- single executor model vs planner/executor split
- browser-only MVP vs browser + shell MVP

## 29. Recommended First 6 Build Tickets

1. Create tenant-aware auth, RBAC, and task intake service.
2. Implement structured plan schema and planner response contract.
3. Build policy engine MVP with allow/deny/require-approval outputs.
4. Stand up ephemeral sandbox runner with restricted filesystem and resource limits.
5. Add browser worker using Playwright with domain allowlists and trace capture.
6. Add append-only audit event service and approval workflow UI.

## 30. Nice-to-Have Later

- policy simulation mode before rollout
- explainable policy decisions in UI
- signed third-party connector marketplace
- reusable task templates
- formal verification for critical policy paths
- customer-managed network connectors

## 31. Final Recommendation

Do not build this as "an agent with lots of tools."
Build it as "a policy-controlled execution platform with an agent inside it."

That framing is the difference between:

- a useful enterprise automation system, and
- a high-risk autonomous operator that security teams will reject.
