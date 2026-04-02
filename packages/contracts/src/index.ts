import { z } from "zod";

export const IdentifierSchema = z.string().uuid();
export const TimestampSchema = z.string().datetime({ offset: true });
export const MetadataSchema = z.record(z.string(), z.unknown()).default({});

export const RoleValues = [
  "owner",
  "admin",
  "operator",
  "approver",
  "member",
  "viewer",
] as const;
export const RoleSchema = z.enum(RoleValues);
export type Role = z.infer<typeof RoleSchema>;

export const AuthMethodValues = [
  "oidc",
  "saml",
  "password",
  "api_key",
  "service_account",
] as const;
export const AuthMethodSchema = z.enum(AuthMethodValues);
export type AuthMethod = z.infer<typeof AuthMethodSchema>;

export const TenantStatusValues = ["active", "suspended", "archived"] as const;
export const TenantStatusSchema = z.enum(TenantStatusValues);
export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: IdentifierSchema,
  slug: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  status: TenantStatusSchema.default("active"),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  metadata: MetadataSchema,
});
export type Tenant = z.infer<typeof TenantSchema>;

export const SessionStatusValues = ["active", "revoked", "expired"] as const;
export const SessionStatusSchema = z.enum(SessionStatusValues);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: IdentifierSchema,
  tenantId: IdentifierSchema,
  subjectId: IdentifierSchema,
  roles: z.array(RoleSchema).min(1),
  authMethod: AuthMethodSchema,
  issuedAt: TimestampSchema,
  expiresAt: TimestampSchema,
  revokedAt: TimestampSchema.optional(),
  status: SessionStatusSchema.default("active"),
  metadata: MetadataSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const TaskSensitivityValues = ["low", "medium", "high"] as const;
export const TaskSensitivitySchema = z.enum(TaskSensitivityValues);
export type TaskSensitivity = z.infer<typeof TaskSensitivitySchema>;

export const TaskStatusValues = [
  "draft",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "canceled",
] as const;
export const TaskStatusSchema = z.enum(TaskStatusValues);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskSchema = z.object({
  id: IdentifierSchema,
  tenantId: IdentifierSchema,
  createdBy: IdentifierSchema,
  title: z.string().min(1).max(200),
  objective: z.string().min(1).max(10_000),
  description: z.string().max(10_000).optional(),
  sensitivity: TaskSensitivitySchema.default("medium"),
  allowedTools: z.array(z.string().min(1)).default([]),
  status: TaskStatusSchema.default("draft"),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  metadata: MetadataSchema,
});
export type Task = z.infer<typeof TaskSchema>;

export const RunStatusValues = [
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "canceled",
] as const;
export const RunStatusSchema = z.enum(RunStatusValues);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunSchema = z.object({
  id: IdentifierSchema,
  tenantId: IdentifierSchema,
  taskId: IdentifierSchema,
  requestedBy: IdentifierSchema,
  policySnapshotId: IdentifierSchema,
  status: RunStatusSchema.default("queued"),
  createdAt: TimestampSchema,
  startedAt: TimestampSchema.optional(),
  finishedAt: TimestampSchema.optional(),
  metadata: MetadataSchema,
});
export type Run = z.infer<typeof RunSchema>;

export const PlanStepStatusValues = [
  "pending",
  "approved",
  "blocked",
  "running",
  "succeeded",
  "failed",
  "skipped",
] as const;
export const PlanStepStatusSchema = z.enum(PlanStepStatusValues);
export type PlanStepStatus = z.infer<typeof PlanStepStatusSchema>;

export const PlanStepRiskValues = ["low", "medium", "high"] as const;
export const PlanStepRiskSchema = z.enum(PlanStepRiskValues);
export type PlanStepRisk = z.infer<typeof PlanStepRiskSchema>;

export const PlanStepSchema = z.object({
  id: IdentifierSchema,
  runId: IdentifierSchema,
  order: z.number().int().nonnegative(),
  title: z.string().min(1).max(200),
  toolName: z.string().min(1).max(120),
  input: z.record(z.string(), z.unknown()).default({}),
  expectedOutput: z.string().max(10_000).optional(),
  risk: PlanStepRiskSchema.default("medium"),
  requiresApproval: z.boolean().default(false),
  status: PlanStepStatusSchema.default("pending"),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  metadata: MetadataSchema,
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const ApprovalDecisionValues = ["pending", "approved", "denied"] as const;
export const ApprovalDecisionSchema = z.enum(ApprovalDecisionValues);
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalSchema = z.object({
  id: IdentifierSchema,
  tenantId: IdentifierSchema,
  runId: IdentifierSchema,
  stepId: IdentifierSchema.optional(),
  requestedBy: IdentifierSchema,
  requestedAt: TimestampSchema,
  decidedBy: IdentifierSchema.optional(),
  decidedAt: TimestampSchema.optional(),
  decision: ApprovalDecisionSchema.default("pending"),
  reason: z.string().max(10_000).optional(),
  metadata: MetadataSchema,
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const PolicyActionValues = [
  "read",
  "write",
  "create",
  "update",
  "delete",
  "execute",
  "approve",
  "network",
] as const;
export const PolicyActionSchema = z.enum(PolicyActionValues);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tenant"),
    tenantId: IdentifierSchema,
  }),
  z.object({
    kind: z.literal("task"),
    taskId: IdentifierSchema,
  }),
  z.object({
    kind: z.literal("run"),
    runId: IdentifierSchema,
  }),
  z.object({
    kind: z.literal("step"),
    stepId: IdentifierSchema,
  }),
  z.object({
    kind: z.literal("tool"),
    toolName: z.string().min(1).max(120),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1).max(4096),
  }),
  z.object({
    kind: z.literal("domain"),
    domain: z.string().min(1).max(255),
  }),
  z.object({
    kind: z.literal("secret"),
    secretName: z.string().min(1).max(120),
  }),
]);
export type PolicyTarget = z.infer<typeof PolicyTargetSchema>;

export const PolicyActorSchema = z.object({
  tenantId: IdentifierSchema,
  subjectId: IdentifierSchema,
  roles: z.array(RoleSchema).min(1),
  authMethod: AuthMethodSchema.optional(),
});
export type PolicyActor = z.infer<typeof PolicyActorSchema>;

export const PolicyContextSchema = z.object({
  requestId: IdentifierSchema.optional(),
  runId: IdentifierSchema.optional(),
  stepId: IdentifierSchema.optional(),
  environment: z.enum(["dev", "staging", "prod"]).default("dev"),
  taskSensitivity: TaskSensitivitySchema.optional(),
  tags: z.array(z.string().min(1)).default([]),
  metadata: MetadataSchema,
});
export type PolicyContext = z.infer<typeof PolicyContextSchema>;

export const PolicyInputSchema = z.object({
  actor: PolicyActorSchema,
  action: PolicyActionSchema,
  target: PolicyTargetSchema,
  context: PolicyContextSchema,
});
export type PolicyInput = z.infer<typeof PolicyInputSchema>;

export const PolicyDecisionSchema = z.object({
  decision: z.enum(["allow", "deny", "require_approval"]),
  reason: z.string().min(1).max(10_000),
  matchedRuleIds: z.array(z.string().min(1)).default([]),
  metadata: MetadataSchema,
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const AuditEventTypeValues = [
  "tenant.created",
  "session.created",
  "task.created",
  "task.updated",
  "run.created",
  "run.started",
  "run.paused",
  "run.completed",
  "run.failed",
  "step.created",
  "step.started",
  "step.completed",
  "approval.requested",
  "approval.granted",
  "approval.denied",
  "policy.evaluated",
  "tool.invoked",
  "tool.completed",
  "tool.failed",
] as const;
export const AuditEventTypeSchema = z.enum(AuditEventTypeValues);
export type AuditEventType = z.infer<typeof AuditEventTypeSchema>;

export const AuditEventSchema = z.object({
  id: IdentifierSchema,
  tenantId: IdentifierSchema,
  actorSubjectId: IdentifierSchema.optional(),
  eventType: AuditEventTypeSchema,
  occurredAt: TimestampSchema,
  runId: IdentifierSchema.optional(),
  stepId: IdentifierSchema.optional(),
  targetKind: z.string().min(1).max(80).optional(),
  targetId: z.string().min(1).max(255).optional(),
  payload: MetadataSchema,
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const createTimestamp = (value: Date | string): string =>
  typeof value === "string" ? value : value.toISOString();
