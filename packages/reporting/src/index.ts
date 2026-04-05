import { z } from "zod";

export const ValidationDecisionValues = ["pass", "fail", "retry", "approval_needed"] as const;
export const ValidationDecisionSchema = z.enum(ValidationDecisionValues);
export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;

export const RunArtifactSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.string().min(1).max(80),
  url: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RunArtifact = z.infer<typeof RunArtifactSchema>;

export const RunApprovalSummarySchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["pending", "approved", "denied"]),
  scope: z.enum(["once", "run"]),
  actionType: z.string().min(1),
  actionSummary: z.string().min(1),
  requestedAt: z.string().datetime({ offset: true }),
  decidedAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().optional(),
});
export type RunApprovalSummary = z.infer<typeof RunApprovalSummarySchema>;

export const RunBlockerSchema = z.object({
  type: z.enum(["approval", "runtime", "policy", "artifact", "operator"]),
  summary: z.string().min(1).max(1_000),
  source: z.string().min(1).max(120),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RunBlocker = z.infer<typeof RunBlockerSchema>;

export const RunSummarySchema = z.object({
  runId: z.string().min(1),
  tenantId: z.string().min(1),
  taskId: z.string().min(1),
  goal: z.string().min(1),
  sensitivity: z.enum(["low", "medium", "high"]),
  status: z.string().min(1),
  allowedTools: z.array(z.string().min(1)),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  auditEventTypes: z.array(z.string().min(1)),
  approvals: z.array(RunApprovalSummarySchema),
  blockers: z.array(RunBlockerSchema),
  artifacts: z.array(RunArtifactSchema),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const ValidationResultSchema = z.object({
  decision: ValidationDecisionSchema,
  summary: z.string().min(1).max(1_000),
  blockers: z.array(RunBlockerSchema).default([]),
  recommendedActions: z.array(z.string().min(1).max(300)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const ProgressReportSchema = z.object({
  kind: z.literal("progress"),
  headline: z.string().min(1).max(200),
  statusLine: z.string().min(1).max(500),
  blockers: z.array(z.string().min(1).max(500)),
  approvalsPending: z.number().int().nonnegative(),
  artifactCount: z.number().int().nonnegative(),
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;

export const FinalReportSchema = z.object({
  kind: z.literal("final"),
  headline: z.string().min(1).max(200),
  outcome: z.string().min(1).max(500),
  blockers: z.array(z.string().min(1).max(500)),
  approvals: z.array(z.string().min(1).max(500)),
  artifacts: z.array(z.string().min(1).max(500)),
});
export type FinalReport = z.infer<typeof FinalReportSchema>;

export type SummaryApprovalInput = {
  id: string;
  decision: "pending" | "approved" | "denied";
  scope: "once" | "run";
  actionType: string;
  actionSummary: string;
  requestedAt: string;
  decidedAt?: string;
  reason?: string;
};

export type SummaryAuditInput = {
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
};

export type RunSummaryInput = {
  run: {
    id: string;
    tenantId: string;
    taskId: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  task: {
    id: string;
    goal: string;
    sensitivity: "low" | "medium" | "high";
    allowedTools: string[];
  };
  approvals?: SummaryApprovalInput[];
  auditEvents?: SummaryAuditInput[];
};

const extractArtifacts = (auditEvents: SummaryAuditInput[]): RunArtifact[] => {
  const artifacts: RunArtifact[] = [];

  for (const event of auditEvents) {
    const payload = event.payload ?? {};
    const candidates = [
      payload.artifact,
      ...(Array.isArray(payload.artifacts) ? payload.artifacts : []),
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
        continue;
      }

      const artifactRecord = candidate as Record<string, unknown>;
      const title = typeof artifactRecord.title === "string" ? artifactRecord.title : undefined;
      const kind = typeof artifactRecord.kind === "string" ? artifactRecord.kind : undefined;
      const url = typeof artifactRecord.url === "string" ? artifactRecord.url : undefined;

      if (!title || !kind) {
        continue;
      }

      artifacts.push(
        RunArtifactSchema.parse({
          title,
          kind,
          ...(url ? { url } : {}),
          metadata: {
            eventType: event.eventType,
            ...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
          },
        }),
      );
    }
  }

  return artifacts;
};

export const summarizeRun = (input: RunSummaryInput): RunSummary => {
  const approvals = (input.approvals ?? []).map((approval) =>
    RunApprovalSummarySchema.parse({
      ...approval,
      ...(approval.decidedAt ? { decidedAt: approval.decidedAt } : {}),
      ...(approval.reason ? { reason: approval.reason } : {}),
    }),
  );
  const auditEvents = input.auditEvents ?? [];
  const blockers: RunBlocker[] = [];

  for (const approval of approvals) {
    if (approval.decision === "pending") {
      blockers.push({
        type: "approval",
        summary: `Awaiting approval for ${approval.actionSummary}`,
        source: "approval",
        metadata: {
          approvalId: approval.id,
          actionType: approval.actionType,
        },
      });
    }
  }

  if (input.run.status === "failed") {
    blockers.push({
      type: "runtime",
      summary: "Run failed before completion.",
      source: "run.status",
      metadata: {},
    });
  }

  if (input.run.status === "canceled") {
    blockers.push({
      type: "operator",
      summary: "Run was canceled before completion.",
      source: "run.status",
      metadata: {},
    });
  }

  for (const event of auditEvents) {
    if (event.eventType === "approval.denied") {
      blockers.push({
        type: "policy",
        summary: "A requested approval was denied.",
        source: "audit.approval.denied",
        metadata: event.payload ?? {},
      });
    }

    if (event.eventType === "run.failed") {
      blockers.push({
        type: "runtime",
        summary: "Audit recorded a run failure event.",
        source: "audit.run.failed",
        metadata: event.payload ?? {},
      });
    }
  }

  return RunSummarySchema.parse({
    runId: input.run.id,
    tenantId: input.run.tenantId,
    taskId: input.task.id,
    goal: input.task.goal,
    sensitivity: input.task.sensitivity,
    status: input.run.status,
    allowedTools: [...input.task.allowedTools],
    createdAt: input.run.createdAt,
    updatedAt: input.run.updatedAt,
    auditEventTypes: auditEvents.map((event) => event.eventType),
    approvals,
    blockers,
    artifacts: extractArtifacts(auditEvents),
    metadata: {},
  });
};

export const validateRunSummary = (summary: RunSummary): ValidationResult => {
  const pendingApprovals = summary.approvals.filter((approval) => approval.decision === "pending");

  if (pendingApprovals.length > 0) {
    return ValidationResultSchema.parse({
      decision: "approval_needed",
      summary: "Run is waiting on human approval.",
      blockers: summary.blockers,
      recommendedActions: ["Resolve the pending approval request before continuing the run."],
      metadata: {
        approvalsPending: pendingApprovals.length,
      },
    });
  }

  if (summary.status === "completed") {
    return ValidationResultSchema.parse({
      decision: "pass",
      summary: "Run completed successfully.",
      blockers: [],
      recommendedActions: [],
      metadata: {
        artifactCount: summary.artifacts.length,
      },
    });
  }

  if (summary.status === "failed" || summary.status === "canceled") {
    return ValidationResultSchema.parse({
      decision: "fail",
      summary: "Run ended unsuccessfully.",
      blockers: summary.blockers,
      recommendedActions: ["Review blockers and retry only after fixing the failing condition."],
      metadata: {},
    });
  }

  return ValidationResultSchema.parse({
    decision: "retry",
    summary: "Run is still in progress or needs another execution step.",
    blockers: summary.blockers,
    recommendedActions: ["Continue execution or re-check the latest run state."],
    metadata: {},
  });
};

export const createProgressReport = (summary: RunSummary): ProgressReport =>
  ProgressReportSchema.parse({
    kind: "progress",
    headline: `Run ${summary.runId} is ${summary.status}`,
    statusLine: `${summary.goal} for tenant ${summary.tenantId}`,
    blockers: summary.blockers.map((blocker) => blocker.summary),
    approvalsPending: summary.approvals.filter((approval) => approval.decision === "pending").length,
    artifactCount: summary.artifacts.length,
  });

export const createFinalReport = (summary: RunSummary): FinalReport =>
  FinalReportSchema.parse({
    kind: "final",
    headline: `Run ${summary.runId} finished with status ${summary.status}`,
    outcome:
      summary.status === "completed"
        ? "Run completed and produced a final structured summary."
        : "Run ended before clean completion and needs review.",
    blockers: summary.blockers.map((blocker) => blocker.summary),
    approvals: summary.approvals.map(
      (approval) => `${approval.actionSummary}: ${approval.decision}`,
    ),
    artifacts: summary.artifacts.map((artifact) =>
      artifact.url ? `${artifact.title} (${artifact.url})` : artifact.title,
    ),
  });
