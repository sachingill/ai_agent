# Verification Artifacts

## Definition of Done

A task is considered done only when all of the following are true:

- implementation is merged into `main`
- relevant Linear issue is updated with final status and validation notes
- `npm run build` passes
- `npm run typecheck` passes
- `npm run test` passes
- feature behavior is covered by focused tests
- security-sensitive logic has explicit negative-path coverage

## Required Checks

These are the baseline checks for the current repo:

```bash
npm run build
npm run typecheck
npm run test
```

## Current Test Suites

### API Integration Checks

File:
[services/api/src/app.test.ts](/Users/sachingill/project/SelfAgent/services/api/src/app.test.ts)

Covers:

- health endpoint returns service status
- task creation works for the active tenant
- run creation works from a created task
- initial run state is set correctly

### Auth Unit Tests

File:
[packages/auth/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/auth/src/index.test.ts)

Covers:

- role hierarchy evaluation
- principal permission checks
- session issuance metadata generation
- session validation for active sessions
- expired session rejection
- revoked session rejection
- downstream permission-check object generation

### Contracts Unit Tests

File:
[packages/contracts/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/contracts/src/index.test.ts)

Covers:

- tenant schema parsing
- session schema parsing
- task schema parsing
- run schema parsing
- plan step schema parsing
- policy input parsing
- policy decision parsing
- approval schema parsing
- audit event schema parsing
- invalid identifier rejection

### Policy Unit Tests

File:
[packages/policy/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/policy/src/index.test.ts)

Covers:

- default deny when no rule matches
- allow rule evaluation by role and action
- approval requirement for high-sensitivity actions
- secret-target denial
- secure default engine behavior
- policy helper evaluation path

## Functional Test Cases

These are the current task-level test cases we should use to decide whether the implemented slice is actually working.

### Task Intake and Run Lifecycle

1. Create a task with tenant and user headers.
Expected:
Task is created, attributed to the correct tenant/user, and returns `201`.

2. Start a run for an existing task in the same tenant.
Expected:
Run is created and starts in `planning` state.

3. Fetch an existing run from the same tenant.
Expected:
Run details are returned and tenant isolation is preserved.

4. Cancel an existing run from the same tenant.
Expected:
Run status becomes `canceled` and updated timestamp changes.

5. Access a task or run from a different tenant.
Expected:
Request is denied.

### Auth and Session Safety

1. Build an active membership and principal.
Expected:
Principal is created only for active membership.

2. Issue a session with positive TTL.
Expected:
Session contains correct issued and expiry metadata.

3. Validate a live session inside TTL.
Expected:
Session is valid.

4. Validate a session after expiry.
Expected:
Session is invalid with `expired`.

5. Revoke a session and validate again.
Expected:
Session is invalid.

6. Check permissions for operator vs approver/admin actions.
Expected:
Only correct roles can approve or request secrets.

### Policy Enforcement

1. Evaluate a request with no matching rule.
Expected:
Decision is `deny`.

2. Evaluate an allowed read action for an operator.
Expected:
Decision is `allow`.

3. Evaluate a high-sensitivity write or execute action.
Expected:
Decision is `require_approval`.

4. Evaluate direct secret access.
Expected:
Decision is `deny`.

## Recommended Next Test Cases

These are not implemented yet, but should be added for the next slice:

- tenant isolation tests for all API endpoints
- policy snapshot binding per run
- audit event creation on task/run mutations
- approval gating in API flows
- shell/browser tool authorization tests
- validator behavior for pass, retry, and fail outcomes

## Artifact Index

### Planning Artifacts

- [docs/secure-openclaw-plan.md](/Users/sachingill/project/SelfAgent/docs/secure-openclaw-plan.md)
- [docs/verification-artifacts.md](/Users/sachingill/project/SelfAgent/docs/verification-artifacts.md)

### Code Artifacts

- [services/api/src/app.ts](/Users/sachingill/project/SelfAgent/services/api/src/app.ts)
- [services/api/src/routes/tasks.ts](/Users/sachingill/project/SelfAgent/services/api/src/routes/tasks.ts)
- [packages/contracts/src/index.ts](/Users/sachingill/project/SelfAgent/packages/contracts/src/index.ts)
- [packages/auth/src/index.ts](/Users/sachingill/project/SelfAgent/packages/auth/src/index.ts)
- [packages/policy/src/index.ts](/Users/sachingill/project/SelfAgent/packages/policy/src/index.ts)

### Test Artifacts

- [services/api/src/app.test.ts](/Users/sachingill/project/SelfAgent/services/api/src/app.test.ts)
- [packages/contracts/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/contracts/src/index.test.ts)
- [packages/auth/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/auth/src/index.test.ts)
- [packages/policy/src/index.test.ts](/Users/sachingill/project/SelfAgent/packages/policy/src/index.test.ts)

### Tracking Artifacts

- Linear project: `Secure Agent Runtime`
- Completed issues: `AGE-13`, `AGE-14`, `AGE-15`, `AGE-16`
