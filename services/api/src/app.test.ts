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
    expect(createRunResponse.json().run.status).toBe("planning");
  });
});
