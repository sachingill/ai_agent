import { z } from "zod";

import {
  PolicyActorSchema,
  PolicyDecisionSchema,
  PolicyInputSchema,
  PolicyTargetSchema,
  type PolicyDecision,
  type PolicyInput,
  type PolicyTarget,
  RoleSchema,
} from "@self-agent/contracts";

export const ToolRiskValues = ["low", "medium", "high"] as const;
export const ToolRiskSchema = z.enum(ToolRiskValues);
export type ToolRisk = z.infer<typeof ToolRiskSchema>;

export const ToolManifestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  risk: ToolRiskSchema.default("medium"),
  allowedTargets: z.array(PolicyTargetSchema).default([]),
  inputSchema: z.any(),
  outputSchema: z.any(),
  redactKeys: z.array(z.string().min(1)).default([]),
});
export type ToolManifest = z.infer<typeof ToolManifestSchema>;
export type ToolManifestInput = z.input<typeof ToolManifestSchema>;

export const ToolInvocationContextSchema = z.object({
  tenantId: z.string().min(1),
  subjectId: z.string().min(1),
  roles: z.array(RoleSchema).min(1),
  authMethod: z.string().min(1).optional(),
  environment: z.enum(["dev", "staging", "prod"]).optional(),
  runId: z.string().min(1).optional(),
  stepId: z.string().min(1).optional(),
  taskSensitivity: z.enum(["low", "medium", "high"]).optional(),
  tags: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ToolInvocationContext = z.infer<typeof ToolInvocationContextSchema>;

export type ToolInvocationRequest = {
  target: PolicyTarget;
  input: unknown;
  context: ToolInvocationContext;
};

export const ToolInvocationRequestSchema = z.object({
  target: PolicyTargetSchema,
  input: z.unknown(),
  context: ToolInvocationContextSchema,
});

export type ToolInvocationResult<TOutput = unknown> = {
  output: TOutput;
  rawOutput: unknown;
  manifest: ToolManifest;
  policyDecision: PolicyDecision;
};

export type ToolHandler<TInput = unknown, TOutput = unknown> = (request: {
  input: TInput;
  context: ToolInvocationContext;
}) => Promise<TOutput> | TOutput;

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  manifest: ToolManifest;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler: ToolHandler<TInput, TOutput>;
};

export type PolicyEvaluator = (input: PolicyInput) => PolicyDecision;
export type OutputNormalizer = <TOutput>(output: TOutput, manifest: ToolManifest) => TOutput;
export type OutputRedactor = <TOutput>(output: TOutput, manifest: ToolManifest) => TOutput;

const defaultNormalizer: OutputNormalizer = (output) => output;
const redactByKeys: OutputRedactor = (output, manifest) => {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return output;
  }

  const entries = Object.entries(output as Record<string, unknown>).map(([key, value]) => [
    key,
    manifest.redactKeys.includes(key) ? "[redacted]" : value,
  ]);

  return Object.fromEntries(entries);
};

export class ToolGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolGatewayError";
  }
}

export class ToolPolicyDeniedError extends ToolGatewayError {
  readonly decision: PolicyDecision;

  constructor(decision: PolicyDecision) {
    super(decision.reason);
    this.name = "ToolPolicyDeniedError";
    this.decision = decision;
  }
}

export class ToolRegistrationError extends ToolGatewayError {
  constructor(message: string) {
    super(message);
    this.name = "ToolRegistrationError";
  }
}

export class ToolInvocationValidationError extends ToolGatewayError {
  constructor(message: string) {
    super(message);
    this.name = "ToolInvocationValidationError";
  }
}

export type ToolGatewayOptions = {
  evaluatePolicy?: PolicyEvaluator;
  normalizeOutput?: OutputNormalizer;
  redactOutput?: OutputRedactor;
};

export class ToolGateway {
  private readonly tools = new Map<string, ToolDefinition<any, any>>();
  private readonly evaluatePolicy: PolicyEvaluator;
  private readonly normalizeOutput: OutputNormalizer;
  private readonly redactOutput: OutputRedactor;

  constructor(options: ToolGatewayOptions = {}) {
    this.evaluatePolicy = options.evaluatePolicy ?? (() =>
      PolicyDecisionSchema.parse({
        decision: "deny",
        reason: "Default deny: tool execution requires policy.",
        matchedRuleIds: [],
        metadata: {},
      }));
    this.normalizeOutput = options.normalizeOutput ?? defaultNormalizer;
    this.redactOutput = options.redactOutput ?? redactByKeys;
  }

  register<TInput, TOutput>(definition: ToolDefinition<TInput, TOutput>): void {
    const manifest = ToolManifestSchema.parse(definition.manifest);

    if (this.tools.has(manifest.name)) {
      throw new ToolRegistrationError(`Tool already registered: ${manifest.name}`);
    }

    this.tools.set(manifest.name, {
      manifest,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      handler: definition.handler,
    });
  }

  list(): ToolManifest[] {
    return [...this.tools.values()].map((definition) => definition.manifest);
  }

  get(name: string): ToolDefinition<any, any> | null {
    return this.tools.get(name) ?? null;
  }

  async invoke<TOutput = unknown>(name: string, request: ToolInvocationRequest): Promise<ToolInvocationResult<TOutput>> {
    const definition = this.tools.get(name);

    if (!definition) {
      throw new ToolRegistrationError(`Tool not registered: ${name}`);
    }

    const manifest = definition.manifest;
    const context = ToolInvocationContextSchema.parse(request.context);
    const policyInput = PolicyInputSchema.parse({
      actor: PolicyActorSchema.parse({
        tenantId: context.tenantId,
        subjectId: context.subjectId,
        roles: [...context.roles],
        ...(context.authMethod ? { authMethod: context.authMethod } : {}),
      }),
      action: "execute",
      target: request.target,
      context: {
        ...(context.runId ? { requestId: context.runId, runId: context.runId } : {}),
        ...(context.stepId ? { stepId: context.stepId } : {}),
        environment: context.environment ?? "dev",
        ...(context.taskSensitivity ? { taskSensitivity: context.taskSensitivity } : {}),
        tags: [...context.tags],
        metadata: context.metadata,
      },
    });

    const decision = this.evaluatePolicy(policyInput);

    if (decision.decision !== "allow") {
      throw new ToolPolicyDeniedError(decision);
    }

    if (
      request.target.kind !== "tool" &&
      manifest.allowedTargets.length > 0 &&
      !manifest.allowedTargets.some(
        (allowedTarget) => JSON.stringify(allowedTarget) === JSON.stringify(request.target),
      )
    ) {
      throw new ToolPolicyDeniedError({
        decision: "deny",
        reason: `Target is outside the allowed manifest scope for ${manifest.name}.`,
        matchedRuleIds: ["tool-manifest-target-denied"],
        metadata: {},
      });
    }

    const parsedInput = definition.inputSchema.safeParse(request.input);

    if (!parsedInput.success) {
      throw new ToolInvocationValidationError(parsedInput.error.message);
    }

    const rawOutput = await definition.handler({
      input: parsedInput.data,
      context,
    });

    const normalizedOutput = this.normalizeOutput(rawOutput, manifest);
    const redactedOutput = this.redactOutput(normalizedOutput, manifest);
    const parsedOutput = definition.outputSchema.safeParse(redactedOutput);

    if (!parsedOutput.success) {
      throw new ToolInvocationValidationError(parsedOutput.error.message);
    }

    return {
      output: parsedOutput.data as TOutput,
      rawOutput,
      manifest,
      policyDecision: decision,
    };
  }
}

export const createToolGateway = (options: ToolGatewayOptions = {}) => new ToolGateway(options);

export const createToolManifest = (manifest: ToolManifestInput): ToolManifest =>
  ToolManifestSchema.parse(manifest);

export const createToolDefinition = <TInput, TOutput>(definition: {
  manifest: ToolManifestInput;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  handler: ToolHandler<TInput, TOutput>;
}): ToolDefinition<TInput, TOutput> => ({
  manifest: createToolManifest(definition.manifest),
  inputSchema: definition.inputSchema,
  outputSchema: definition.outputSchema,
  handler: definition.handler,
});
