import { describe, expect, it } from "vitest";

import {
  ValidationDecisionSchema,
  ValidationInputSchema,
  ValidationResultSchema,
  createValidationEngine,
  evaluateValidation,
} from "./index.js";

describe("validator", () => {
  it("produces pass, retry, fail, and approval-needed outcomes", () => {
    const pass = evaluateValidation({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "22222222-2222-2222-2222-222222222222",
      executionStatus: "succeeded",
      expectedOutputMatched: true,
      attempt: 0,
      maxAttempts: 2,
    });

    const retry = evaluateValidation({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "33333333-3333-3333-3333-333333333333",
      executionStatus: "timeout",
      attempt: 0,
      maxAttempts: 2,
    });

    const fail = evaluateValidation({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "44444444-4444-4444-4444-444444444444",
      executionStatus: "failed",
      attempt: 1,
      maxAttempts: 2,
    });

    const approvalNeeded = evaluateValidation({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "55555555-5555-5555-5555-555555555555",
      policyDecision: "require_approval",
      approvalRequired: true,
      attempt: 0,
      maxAttempts: 2,
    });

    expect(pass.decision).toBe("pass");
    expect(retry.decision).toBe("retry");
    expect(fail.decision).toBe("fail");
    expect(approvalNeeded.decision).toBe("approval-needed");
    expect(ValidationResultSchema.parse(pass).needsApproval).toBe(false);
    expect(ValidationDecisionSchema.parse(approvalNeeded.decision)).toBe("approval-needed");
  });

  it("supports a deterministic engine interface", () => {
    const engine = createValidationEngine();
    const result = engine.evaluate({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "66666666-6666-6666-6666-666666666666",
      executionStatus: "succeeded",
      attempt: 0,
      maxAttempts: 1,
    });

    expect(result.decision).toBe("pass");
    expect(ValidationInputSchema.parse({
      runId: "11111111-1111-1111-1111-111111111111",
      stepId: "66666666-6666-6666-6666-666666666666",
      executionStatus: "succeeded",
    })).toBeTruthy();
  });
});
