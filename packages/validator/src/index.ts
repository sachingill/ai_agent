import { z } from "zod";

export const ValidationExecutionStatusValues = [
  "succeeded",
  "failed",
  "timeout",
  "denied",
] as const;
export const ValidationExecutionStatusSchema = z.enum(ValidationExecutionStatusValues);
export type ValidationExecutionStatus = z.infer<typeof ValidationExecutionStatusSchema>;

export const ValidationDecisionValues = [
  "pass",
  "fail",
  "retry",
  "approval-needed",
] as const;
export const ValidationDecisionSchema = z.enum(ValidationDecisionValues);
export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;

export const ValidationInputSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  policyDecision: z.enum(["allow", "deny", "require_approval"]).optional(),
  approvalRequired: z.boolean().default(false),
  executionStatus: ValidationExecutionStatusSchema.optional(),
  expectedOutputMatched: z.boolean().default(true),
  attempt: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(1),
  blockers: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ValidationInput = z.infer<typeof ValidationInputSchema>;
export type ValidationInputShape = z.input<typeof ValidationInputSchema>;

export const ValidationResultSchema = z.object({
  runId: z.string().min(1),
  stepId: z.string().min(1),
  decision: ValidationDecisionSchema,
  reason: z.string().min(1).max(10_000),
  retriable: z.boolean(),
  needsApproval: z.boolean(),
  executionStatus: ValidationExecutionStatusSchema.optional(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  blockers: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const evaluateValidation = (input: ValidationInputShape): ValidationResult => {
  const parsed = ValidationInputSchema.parse(input);
  const executionStatus = parsed.executionStatus;

  if (parsed.policyDecision === "require_approval" || parsed.approvalRequired) {
    return ValidationResultSchema.parse({
      runId: parsed.runId,
      stepId: parsed.stepId,
      decision: "approval-needed",
      reason: "Approval is required before this step can advance.",
      retriable: false,
      needsApproval: true,
      ...(executionStatus ? { executionStatus } : {}),
      attempt: parsed.attempt,
      maxAttempts: parsed.maxAttempts,
      blockers: [...parsed.blockers],
      metadata: {
        ...parsed.metadata,
        source: "approval_gate",
      },
    });
  }

  if (parsed.policyDecision === "deny" || executionStatus === "denied") {
    return ValidationResultSchema.parse({
      runId: parsed.runId,
      stepId: parsed.stepId,
      decision: "fail",
      reason: "The step was denied by policy or execution controls.",
      retriable: false,
      needsApproval: false,
      ...(executionStatus ? { executionStatus } : {}),
      attempt: parsed.attempt,
      maxAttempts: parsed.maxAttempts,
      blockers: [...parsed.blockers],
      metadata: {
        ...parsed.metadata,
        source: "policy_deny",
      },
    });
  }

  if (executionStatus === "succeeded" && parsed.expectedOutputMatched) {
    return ValidationResultSchema.parse({
      runId: parsed.runId,
      stepId: parsed.stepId,
      decision: "pass",
      reason: "Execution completed successfully.",
      retriable: false,
      needsApproval: false,
      executionStatus,
      attempt: parsed.attempt,
      maxAttempts: parsed.maxAttempts,
      blockers: [...parsed.blockers],
      metadata: {
        ...parsed.metadata,
        source: "execution_pass",
      },
    });
  }

  if (executionStatus === "timeout" || executionStatus === "failed" || !executionStatus) {
    const canRetry = parsed.attempt + 1 < parsed.maxAttempts;

    return ValidationResultSchema.parse({
      runId: parsed.runId,
      stepId: parsed.stepId,
      decision: canRetry ? "retry" : "fail",
      reason: canRetry
        ? "Execution can be retried within the remaining budget."
        : executionStatus
          ? "Execution failed and the retry budget has been exhausted."
          : "No execution status was provided.",
      retriable: canRetry,
      needsApproval: false,
      ...(executionStatus ? { executionStatus } : {}),
      attempt: parsed.attempt,
      maxAttempts: parsed.maxAttempts,
      blockers: [...parsed.blockers],
      metadata: {
        ...parsed.metadata,
        source: canRetry ? "retry_budget" : "execution_failure",
      },
    });
  }

  return ValidationResultSchema.parse({
    runId: parsed.runId,
    stepId: parsed.stepId,
    decision: "fail",
    reason: "Validation could not classify the step outcome.",
    retriable: false,
    needsApproval: false,
    ...(executionStatus ? { executionStatus } : {}),
    attempt: parsed.attempt,
    maxAttempts: parsed.maxAttempts,
    blockers: [...parsed.blockers],
    metadata: {
      ...parsed.metadata,
      source: "classification_failure",
    },
  });
};

export type ValidationEngine = {
  evaluate: (input: ValidationInputShape) => ValidationResult;
};

export const createValidationEngine = (): ValidationEngine => ({
  evaluate: (input) => evaluateValidation(input),
});
