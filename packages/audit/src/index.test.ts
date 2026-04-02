import { describe, expect, it } from "vitest";

import { InMemoryAuditRecorder } from "./index.js";

describe("audit recorder", () => {
  it("appends events in order and filters by run and tenant", () => {
    const recorder = new InMemoryAuditRecorder();

    const first = recorder.record({
      tenantId: "11111111-1111-1111-1111-111111111111",
      eventType: "task.created",
      actorSubjectId: "22222222-2222-2222-2222-222222222222",
      payload: { kind: "task" },
    });

    const second = recorder.record({
      tenantId: "11111111-1111-1111-1111-111111111111",
      eventType: "run.created",
      actorSubjectId: "22222222-2222-2222-2222-222222222222",
      runId: "33333333-3333-3333-3333-333333333333",
      payload: { kind: "run" },
    });

    const third = recorder.record({
      tenantId: "11111111-1111-1111-1111-111111111111",
      eventType: "run.canceled",
      actorSubjectId: "22222222-2222-2222-2222-222222222222",
      runId: "33333333-3333-3333-3333-333333333333",
      payload: { kind: "run" },
    });

    expect(recorder.list().map((event) => event.id)).toEqual([first.id, second.id, third.id]);
    expect(recorder.list({ tenantId: first.tenantId }).map((event) => event.eventType)).toEqual([
      "task.created",
      "run.created",
      "run.canceled",
    ]);
    expect(recorder.list({ runId: second.runId as string }).map((event) => event.eventType)).toEqual([
      "run.created",
      "run.canceled",
    ]);
  });
});
