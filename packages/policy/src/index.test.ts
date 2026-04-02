import { describe, expect, it } from "vitest";
import {
  allowRoles,
  createDefaultPolicyEngine,
  createPolicyEngine,
  denyTargets,
  evaluatePolicy,
  requireApprovalForSensitivity,
} from "./index.js";

const ids = {
  tenantId: "11111111-1111-1111-1111-111111111111",
  subjectId: "22222222-2222-2222-2222-222222222222",
  runId: "44444444-4444-4444-4444-444444444444",
  stepId: "55555555-5555-5555-5555-555555555555",
};

const baseInput = {
  actor: {
    tenantId: ids.tenantId,
    subjectId: ids.subjectId,
    roles: ["operator" as const],
    authMethod: "service_account" as const,
  },
  context: {
    requestId: ids.subjectId,
    runId: ids.runId,
    stepId: ids.stepId,
    environment: "dev" as const,
    taskSensitivity: "medium" as const,
    tags: ["automation"],
    metadata: {},
  },
};

describe("policy engine", () => {
  it("defaults to deny when no rule matches", () => {
    const engine = createPolicyEngine([]);

    expect(
      engine.evaluate({
        ...baseInput,
        action: "write",
        target: { kind: "tool", toolName: "browser" },
      }),
    ).toMatchObject({
      decision: "deny",
      matchedRuleIds: [],
    });
  });

  it("allows matching role-based rules", () => {
    const engine = createPolicyEngine([
      allowRoles({
        id: "allow-browser-read",
        description: "Allow browser read",
        priority: 10,
        reason: "Read access allowed for operators.",
        roles: ["operator"],
        actions: ["read"],
        targetKinds: ["tool"],
      }),
    ]);

    expect(
      engine.evaluate({
        ...baseInput,
        action: "read",
        target: { kind: "tool", toolName: "browser" },
      }),
    ).toMatchObject({
      decision: "allow",
      matchedRuleIds: ["allow-browser-read"],
    });
  });

  it("requires approval for sensitive actions and denies secrets", () => {
    const engine = createPolicyEngine([
      denyTargets({
        id: "deny-secrets",
        description: "No secret access",
        priority: 100,
        reason: "Secrets are not directly accessible.",
        targetKinds: ["secret"],
      }),
      requireApprovalForSensitivity({
        id: "approval-high",
        description: "High sensitivity",
        priority: 90,
        reason: "High sensitivity requires approval.",
        sensitivities: ["high"],
        actions: ["write", "execute"],
      }),
    ]);

    expect(
      engine.evaluate({
        ...baseInput,
        action: "execute",
        target: { kind: "tool", toolName: "shell" },
        context: { ...baseInput.context, taskSensitivity: "high" },
      }),
    ).toMatchObject({
      decision: "require_approval",
      matchedRuleIds: ["approval-high"],
    });

    expect(
      engine.evaluate({
        ...baseInput,
        action: "read",
        target: { kind: "secret", secretName: "prod-db-password" },
      }),
    ).toMatchObject({
      decision: "deny",
      matchedRuleIds: ["deny-secrets"],
    });
  });

  it("exposes a secure default engine with approval and read rules", () => {
    const decision = createDefaultPolicyEngine().evaluate({
      ...baseInput,
      action: "read",
      target: { kind: "file", path: "/workspace/readme.md" },
    });

    expect(decision.decision).toBe("allow");
    expect(decision.reason).toContain("permitted");
  });

  it("supports the evaluatePolicy helper", () => {
    const decision = evaluatePolicy({
      ...baseInput,
      action: "approve",
      target: { kind: "run", runId: ids.runId },
    });

    expect(["allow", "deny", "require_approval"]).toContain(decision.decision);
  });
});

