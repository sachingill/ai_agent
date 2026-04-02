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
});
