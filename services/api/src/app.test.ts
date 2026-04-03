import { afterAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";

describe("API bootstrap", () => {
  const appPromise = buildApp();

  afterAll(async () => {
    const app = await appPromise;
    await app.close();
  });

  it("returns a health response", async () => {
    const app = await appPromise;
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      service: "self-agent-api",
    });
  });

  it("creates a task and starts a run for the active tenant", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Review support tickets for prompt injection attempts.",
        allowedTools: ["browser.read"],
        sensitivity: "high",
      },
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(createTaskResponse.statusCode).toBe(201);
    const createdTask = createTaskResponse.json().task;

    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(createRunResponse.statusCode).toBe(201);
    const createdRun = createRunResponse.json().run;

    expect(createdRun.status).toBe("planning");

    const fetchRunResponse = await app.inject({
      method: "GET",
      url: `/runs/${createdRun.id}`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(fetchRunResponse.statusCode).toBe(200);
    expect(fetchRunResponse.json().run.id).toBe(createdRun.id);

    const cancelRunResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/cancel`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(cancelRunResponse.statusCode).toBe(200);
    expect(cancelRunResponse.json().run.status).toBe("canceled");

    const tenantAuditResponse = await app.inject({
      method: "GET",
      url: "/audit",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(tenantAuditResponse.statusCode).toBe(200);
    expect(tenantAuditResponse.json().events.map((event: { eventType: string }) => event.eventType)).toEqual([
      "task.created",
      "run.created",
      "run.read",
      "run.canceled",
    ]);

    const runAuditResponse = await app.inject({
      method: "GET",
      url: `/audit?runId=${createdRun.id}`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(runAuditResponse.statusCode).toBe(200);
    expect(runAuditResponse.json().events.map((event: { eventType: string }) => event.eventType)).toEqual([
      "run.created",
      "run.read",
      "run.canceled",
    ]);
  });

  it("rejects cross-tenant run access", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Validate tenant boundaries.",
        allowedTools: ["browser.read"],
        sensitivity: "medium",
      },
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    const createdTask = createTaskResponse.json().task;
    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });
    const createdRun = createRunResponse.json().run;

    const fetchRunResponse = await app.inject({
      method: "GET",
      url: `/runs/${createdRun.id}`,
      headers: {
        "x-tenant-id": "tenant-beta",
        "x-user-id": "user-999",
      },
    });

    expect(fetchRunResponse.statusCode).toBe(403);
  });

  it("returns 404 for unknown task and run identifiers", async () => {
    const app = await appPromise;

    const createRunResponse = await app.inject({
      method: "POST",
      url: "/tasks/unknown-task/runs",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(createRunResponse.statusCode).toBe(404);

    const fetchRunResponse = await app.inject({
      method: "GET",
      url: "/runs/unknown-run",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(fetchRunResponse.statusCode).toBe(404);

    const cancelRunResponse = await app.inject({
      method: "POST",
      url: "/runs/unknown-run/cancel",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(cancelRunResponse.statusCode).toBe(404);
  });

  it("returns 400 for malformed task payloads and run params", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "",
        allowedTools: [""],
        sensitivity: "critical",
      },
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(createTaskResponse.statusCode).toBe(400);
    expect(createTaskResponse.json().error).toBe("Bad Request");

    const fetchRunResponse = await app.inject({
      method: "GET",
      url: "/runs//",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect([400, 404]).toContain(fetchRunResponse.statusCode);
  });

  it("rejects cross-tenant audit reads", async () => {
    const app = await appPromise;

    const response = await app.inject({
      method: "GET",
      url: "/audit?tenantId=tenant-beta",
      headers: {
        "x-tenant-id": "tenant-alpha",
        "x-user-id": "user-123",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("creates approval requests, lists the inbox, and resumes runs after approval", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Approve browser access before external research.",
        allowedTools: ["browser.read"],
        sensitivity: "high",
      },
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-requester",
      },
    });

    const createdTask = createTaskResponse.json().task;
    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-requester",
      },
    });

    const createdRun = createRunResponse.json().run;

    const createApprovalResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/approvals`,
      payload: {
        scope: "run",
        actionType: "execute",
        summary: "Approve browser.read for example.com capture",
        target: {
          kind: "tool",
          label: "browser.read",
        },
      },
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-requester",
      },
    });

    expect(createApprovalResponse.statusCode).toBe(201);
    expect(createApprovalResponse.json().run.status).toBe("blocked");
    const createdApproval = createApprovalResponse.json().approval;

    const inboxResponse = await app.inject({
      method: "GET",
      url: "/approvals?decision=pending",
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(inboxResponse.statusCode).toBe(200);
    expect(inboxResponse.json().approvals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdApproval.id,
          actionSummary: "Approve browser.read for example.com capture",
          decision: "pending",
          scope: "run",
        }),
      ]),
    );

    const detailResponse = await app.inject({
      method: "GET",
      url: `/approvals/${createdApproval.id}`,
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().approval.id).toBe(createdApproval.id);

    const approveResponse = await app.inject({
      method: "POST",
      url: `/approvals/${createdApproval.id}/approve`,
      payload: {
        reason: "Reviewed and approved for this run.",
      },
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json().approval.decision).toBe("approved");
    expect(approveResponse.json().run.status).toBe("planning");

    const auditResponse = await app.inject({
      method: "GET",
      url: `/audit?runId=${createdRun.id}`,
      headers: {
        "x-tenant-id": "tenant-approval",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(auditResponse.statusCode).toBe(200);
    expect(auditResponse.json().events.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining(["approval.requested", "approval.granted", "run.paused", "run.started"]),
    );
  });

  it("denies approval requests with approver permissions and fails the run", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Block risky shell execution.",
        allowedTools: ["shell.exec"],
        sensitivity: "high",
      },
      headers: {
        "x-tenant-id": "tenant-deny",
        "x-user-id": "user-requester",
      },
    });

    const createdTask = createTaskResponse.json().task;
    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-deny",
        "x-user-id": "user-requester",
      },
    });
    const createdRun = createRunResponse.json().run;

    const createApprovalResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/approvals`,
      payload: {
        scope: "once",
        actionType: "execute",
        summary: "Approve shell.exec for privileged maintenance",
      },
      headers: {
        "x-tenant-id": "tenant-deny",
        "x-user-id": "user-requester",
      },
    });

    const approvalId = createApprovalResponse.json().approval.id;
    const denyResponse = await app.inject({
      method: "POST",
      url: `/approvals/${approvalId}/deny`,
      payload: {
        reason: "Shell access was not justified.",
      },
      headers: {
        "x-tenant-id": "tenant-deny",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(denyResponse.statusCode).toBe(200);
    expect(denyResponse.json().approval.decision).toBe("denied");
    expect(denyResponse.json().run.status).toBe("failed");
  });

  it("rejects approval resolution for non-approver roles and cross-tenant access", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Require approval before write access.",
        allowedTools: ["browser.read"],
        sensitivity: "high",
      },
      headers: {
        "x-tenant-id": "tenant-policy",
        "x-user-id": "user-requester",
      },
    });

    const createdTask = createTaskResponse.json().task;
    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-policy",
        "x-user-id": "user-requester",
      },
    });
    const createdRun = createRunResponse.json().run;

    const createApprovalResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/approvals`,
      payload: {
        summary: "Approve write access for managed content update",
        actionType: "write",
      },
      headers: {
        "x-tenant-id": "tenant-policy",
        "x-user-id": "user-requester",
      },
    });

    const approvalId = createApprovalResponse.json().approval.id;

    const operatorApproveResponse = await app.inject({
      method: "POST",
      url: `/approvals/${approvalId}/approve`,
      headers: {
        "x-tenant-id": "tenant-policy",
        "x-user-id": "user-operator",
        "x-user-role": "operator",
      },
    });

    expect(operatorApproveResponse.statusCode).toBe(403);

    const crossTenantResponse = await app.inject({
      method: "GET",
      url: `/approvals/${approvalId}`,
      headers: {
        "x-tenant-id": "tenant-other",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(crossTenantResponse.statusCode).toBe(403);
  });

  it("rejects malformed approval payloads and duplicate decisions", async () => {
    const app = await appPromise;

    const createTaskResponse = await app.inject({
      method: "POST",
      url: "/tasks",
      payload: {
        goal: "Create invalid approval test run.",
        allowedTools: ["browser.read"],
        sensitivity: "medium",
      },
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-requester",
      },
    });

    const createdTask = createTaskResponse.json().task;
    const createRunResponse = await app.inject({
      method: "POST",
      url: `/tasks/${createdTask.id}/runs`,
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-requester",
      },
    });
    const createdRun = createRunResponse.json().run;

    const malformedApprovalResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/approvals`,
      payload: {
        summary: "",
        actionType: "unsafe",
      },
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-requester",
      },
    });

    expect(malformedApprovalResponse.statusCode).toBe(400);

    const createApprovalResponse = await app.inject({
      method: "POST",
      url: `/runs/${createdRun.id}/approvals`,
      payload: {
        summary: "Approve browser.read for triage",
      },
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-requester",
      },
    });

    const approvalId = createApprovalResponse.json().approval.id;

    const approveResponse = await app.inject({
      method: "POST",
      url: `/approvals/${approvalId}/approve`,
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(approveResponse.statusCode).toBe(200);

    const approveAgainResponse = await app.inject({
      method: "POST",
      url: `/approvals/${approvalId}/approve`,
      headers: {
        "x-tenant-id": "tenant-invalid",
        "x-user-id": "user-approver",
        "x-user-role": "approver",
      },
    });

    expect(approveAgainResponse.statusCode).toBe(409);
  });
});
