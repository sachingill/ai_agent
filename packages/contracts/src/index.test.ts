import { describe, expect, it } from "vitest";
import {
  ApprovalSchema,
  AuditEventSchema,
  IdentifierSchema,
  PolicyDecisionSchema,
  PolicyInputSchema,
  PlanStepSchema,
  RunSchema,
  SessionSchema,
  TaskSchema,
  TenantSchema,
  createTimestamp,
} from "./index.js";

const ids = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  subjectId: "22222222-2222-2222-2222-222222222222",
  taskId: "33333333-3333-3333-3333-333333333333",
  runId: "44444444-4444-4444-4444-444444444444",
  stepId: "55555555-5555-5555-5555-555555555555",
  approvalId: "66666666-6666-6666-6666-666666666666",
  eventId: "77777777-7777-7777-7777-777777777777",
};

describe("contracts", () => {
  it("parses tenant, session, task, run, and step records", () => {
    const now = createTimestamp(new Date("2026-04-02T09:00:00.000Z"));

    expect(
      TenantSchema.parse({
        id: ids.tenantId,
        slug: "acme",
        name: "Acme",
        status: "active",
        createdAt: now,
        updatedAt: now,
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      SessionSchema.parse({
        id: ids.runId,
        tenantId: ids.tenantId,
        subjectId: ids.subjectId,
        roles: ["operator"],
        authMethod: "oidc",
        issuedAt: now,
        expiresAt: "2026-04-02T10:00:00.000Z",
        status: "active",
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      TaskSchema.parse({
        id: ids.taskId,
        tenantId: ids.tenantId,
        createdBy: ids.subjectId,
        title: "Investigate secure agent",
        objective: "Gather requirements and implement safe automation",
        sensitivity: "high",
        allowedTools: ["browser", "shell"],
        status: "draft",
        createdAt: now,
        updatedAt: now,
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      RunSchema.parse({
        id: ids.runId,
        tenantId: ids.tenantId,
        taskId: ids.taskId,
        requestedBy: ids.subjectId,
        policySnapshotId: ids.eventId,
        status: "queued",
        createdAt: now,
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      PlanStepSchema.parse({
        id: ids.stepId,
        runId: ids.runId,
        order: 0,
        title: "Verify target",
        toolName: "browser",
        input: { url: "https://example.com" },
        risk: "medium",
        requiresApproval: false,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        metadata: {},
      }),
    ).toBeTruthy();
  });

  it("parses policy input, decision, approval, and audit events", () => {
    const now = "2026-04-02T09:00:00.000Z";

    expect(
      PolicyInputSchema.parse({
        actor: {
          tenantId: ids.tenantId,
          subjectId: ids.subjectId,
          roles: ["operator"],
          authMethod: "service_account",
        },
        action: "execute",
        target: {
          kind: "tool",
          toolName: "browser",
        },
        context: {
          requestId: ids.eventId,
          runId: ids.runId,
          stepId: ids.stepId,
          environment: "dev",
          taskSensitivity: "medium",
          tags: ["automation"],
          metadata: {},
        },
      }),
    ).toBeTruthy();

    expect(
      PolicyDecisionSchema.parse({
        decision: "require_approval",
        reason: "Tool access is sensitive",
        matchedRuleIds: ["rule-1"],
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      ApprovalSchema.parse({
        id: ids.approvalId,
        tenantId: ids.tenantId,
        runId: ids.runId,
        stepId: ids.stepId,
        requestedBy: ids.subjectId,
        requestedAt: now,
        decision: "pending",
        metadata: {},
      }),
    ).toBeTruthy();

    expect(
      AuditEventSchema.parse({
        id: ids.eventId,
        tenantId: ids.tenantId,
        actorSubjectId: ids.subjectId,
        eventType: "policy.evaluated",
        occurredAt: now,
        runId: ids.runId,
        stepId: ids.stepId,
        targetKind: "tool",
        targetId: "browser",
        payload: { decision: "allow" },
      }),
    ).toBeTruthy();
  });

  it("rejects invalid identifiers", () => {
    expect(() => IdentifierSchema.parse("not-a-uuid")).toThrow();
  });
});

