import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const RunParamsSchema = z.object({
  runId: z.string().min(1),
});

const ApprovalParamsSchema = z.object({
  approvalId: z.string().min(1),
});

const ApprovalQuerySchema = z.object({
  runId: z.string().min(1).optional(),
  decision: z.enum(["pending", "approved", "denied"]).optional(),
});

const CreateApprovalBodySchema = z.object({
  stepId: z.string().min(1).optional(),
  scope: z.enum(["once", "run"]).default("once"),
  actionType: z
    .enum(["read", "write", "create", "update", "delete", "execute", "approve", "network"])
    .default("execute"),
  summary: z.string().min(1).max(500),
  reason: z.string().max(1_000).optional(),
  target: z
    .object({
      kind: z.enum(["task", "run", "step", "tool", "file", "domain"]),
      label: z.string().min(1).max(255),
    })
    .optional(),
});

const ResolveApprovalBodySchema = z.object({
  reason: z.string().max(1_000).optional(),
});

const badRequest = (reply: { code: (statusCode: number) => { send: (body: unknown) => unknown } }, issues: unknown) =>
  reply.code(400).send({
    statusCode: 400,
    error: "Bad Request",
    message: issues,
  });

const ensureResolvableRun = (status: string): string | null => {
  if (status === "completed" || status === "failed" || status === "canceled") {
    return "Run can no longer accept approval actions.";
  }

  return null;
};

export const approvalRoutes: FastifyPluginAsync = async (app) => {
  app.get("/approvals", async (request) => {
    const query = ApprovalQuerySchema.parse(request.query);
    const approvals = app.runtime.store.listApprovals({
      tenantId: request.requestContext.tenantId,
      ...(query.runId ? { runId: query.runId } : {}),
      ...(query.decision ? { decision: query.decision } : {}),
    });

    return { approvals };
  });

  app.get("/approvals/:approvalId", async (request, reply) => {
    const parsedParams = ApprovalParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error.issues);
    }

    const { approvalId } = parsedParams.data;
    const approval = app.runtime.store.getApproval(approvalId);

    if (!approval) {
      return reply.notFound(`Approval ${approvalId} was not found.`);
    }

    if (approval.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Approval is outside the active tenant scope.");
    }

    return { approval };
  });

  app.post("/runs/:runId/approvals", async (request, reply) => {
    const parsedParams = RunParamsSchema.safeParse(request.params);
    const parsedBody = CreateApprovalBodySchema.safeParse(request.body);

    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error.issues);
    }

    if (!parsedBody.success) {
      return badRequest(reply, parsedBody.error.issues);
    }

    const { runId } = parsedParams.data;
    const body = parsedBody.data;
    const run = app.runtime.store.getRun(runId);

    if (!run) {
      return reply.notFound(`Run ${runId} was not found.`);
    }

    if (run.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Run is outside the active tenant scope.");
    }

    const runStateError = ensureResolvableRun(run.status);
    if (runStateError) {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: runStateError,
      });
    }

    const now = new Date().toISOString();
    const approval = app.runtime.store.createApproval({
      id: randomUUID(),
      tenantId: run.tenantId,
      runId: run.id,
      requestedBy: request.requestContext.userId,
      requestedAt: now,
      decision: "pending",
      scope: body.scope,
      actionType: body.actionType,
      actionSummary: body.summary,
      ...(body.stepId ? { stepId: body.stepId } : {}),
      ...(body.reason ? { reason: body.reason } : {}),
      ...(body.target?.kind ? { targetKind: body.target.kind } : {}),
      ...(body.target?.label ? { targetLabel: body.target.label } : {}),
      metadata: {},
    });

    const nextRun =
      run.status === "blocked"
        ? run
        : app.runtime.store.updateRun(run.id, (current) => ({
            ...current,
            status: "blocked",
            updatedAt: now,
          })) ?? run;

    app.runtime.audit.record({
      tenantId: run.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "approval.requested",
      runId: run.id,
      ...(body.stepId ? { stepId: body.stepId } : {}),
      targetKind: "approval",
      targetId: approval.id,
      payload: {
        scope: approval.scope,
        actionType: approval.actionType,
        actionSummary: approval.actionSummary,
        targetKind: approval.targetKind,
        targetLabel: approval.targetLabel,
      },
    });

    if (run.status !== "blocked") {
      app.runtime.audit.record({
        tenantId: run.tenantId,
        actorSubjectId: request.requestContext.userId,
        eventType: "run.paused",
        runId: run.id,
        ...(body.stepId ? { stepId: body.stepId } : {}),
        targetKind: "run",
        targetId: run.id,
        payload: {
          status: nextRun.status,
          reason: "Awaiting approval",
          approvalId: approval.id,
        },
      });
    }

    return reply.code(201).send({ approval, run: nextRun });
  });

  app.post("/approvals/:approvalId/approve", async (request, reply) => {
    const parsedParams = ApprovalParamsSchema.safeParse(request.params);
    const parsedBody = ResolveApprovalBodySchema.safeParse(request.body ?? {});

    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error.issues);
    }

    if (!parsedBody.success) {
      return badRequest(reply, parsedBody.error.issues);
    }

    const { approvalId } = parsedParams.data;
    const body = parsedBody.data;
    const approval = app.runtime.store.getApproval(approvalId);

    if (!approval) {
      return reply.notFound(`Approval ${approvalId} was not found.`);
    }

    if (approval.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Approval is outside the active tenant scope.");
    }

    if (approval.decision !== "pending") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Approval ${approvalId} is already ${approval.decision}.`,
      });
    }

    const run = app.runtime.store.getRun(approval.runId);
    if (!run) {
      return reply.notFound(`Run ${approval.runId} was not found.`);
    }

    const task = app.runtime.store.getTask(run.taskId);
    const decision = app.runtime.policy.evaluate({
      actor: {
        tenantId: request.requestContext.tenantId,
        subjectId: request.requestContext.userId,
        roles: request.requestContext.roles,
      },
      action: "approve",
      target: {
        kind: "run",
        runId: run.id,
      },
      context: {
        requestId: request.requestContext.requestId,
        environment: "dev",
        tags: ["approval"],
        ...(run.id ? { runId: run.id } : {}),
        ...(approval.stepId ? { stepId: approval.stepId } : {}),
        taskSensitivity: task?.sensitivity ?? "medium",
        metadata: {},
      },
    });

    if (decision.decision !== "allow") {
      return reply.forbidden("Current role cannot resolve this approval request.");
    }

    const now = new Date().toISOString();
    const updatedApproval =
      app.runtime.store.updateApproval(approval.id, (current) => ({
        ...current,
        decision: "approved",
        decidedBy: request.requestContext.userId,
        decidedAt: now,
        ...(body.reason ? { reason: body.reason } : current.reason ? { reason: current.reason } : {}),
      })) ?? approval;

    const updatedRun =
      app.runtime.store.updateRun(run.id, (current) => ({
        ...current,
        status: "planning",
        updatedAt: now,
      })) ?? run;

    app.runtime.audit.record({
      tenantId: approval.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "approval.granted",
      runId: approval.runId,
      ...(approval.stepId ? { stepId: approval.stepId } : {}),
      targetKind: "approval",
      targetId: approval.id,
      payload: {
        scope: approval.scope,
        actionSummary: approval.actionSummary,
        decidedBy: request.requestContext.userId,
      },
    });

    app.runtime.audit.record({
      tenantId: run.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "run.started",
      runId: run.id,
      ...(approval.stepId ? { stepId: approval.stepId } : {}),
      targetKind: "run",
      targetId: run.id,
      payload: {
        status: updatedRun.status,
        approvalId: approval.id,
      },
    });

    return { approval: updatedApproval, run: updatedRun };
  });

  app.post("/approvals/:approvalId/deny", async (request, reply) => {
    const parsedParams = ApprovalParamsSchema.safeParse(request.params);
    const parsedBody = ResolveApprovalBodySchema.safeParse(request.body ?? {});

    if (!parsedParams.success) {
      return badRequest(reply, parsedParams.error.issues);
    }

    if (!parsedBody.success) {
      return badRequest(reply, parsedBody.error.issues);
    }

    const { approvalId } = parsedParams.data;
    const body = parsedBody.data;
    const approval = app.runtime.store.getApproval(approvalId);

    if (!approval) {
      return reply.notFound(`Approval ${approvalId} was not found.`);
    }

    if (approval.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Approval is outside the active tenant scope.");
    }

    if (approval.decision !== "pending") {
      return reply.code(409).send({
        statusCode: 409,
        error: "Conflict",
        message: `Approval ${approvalId} is already ${approval.decision}.`,
      });
    }

    const run = app.runtime.store.getRun(approval.runId);
    if (!run) {
      return reply.notFound(`Run ${approval.runId} was not found.`);
    }

    const task = app.runtime.store.getTask(run.taskId);
    const decision = app.runtime.policy.evaluate({
      actor: {
        tenantId: request.requestContext.tenantId,
        subjectId: request.requestContext.userId,
        roles: request.requestContext.roles,
      },
      action: "approve",
      target: {
        kind: "run",
        runId: run.id,
      },
      context: {
        requestId: request.requestContext.requestId,
        environment: "dev",
        tags: ["approval"],
        ...(run.id ? { runId: run.id } : {}),
        ...(approval.stepId ? { stepId: approval.stepId } : {}),
        taskSensitivity: task?.sensitivity ?? "medium",
        metadata: {},
      },
    });

    if (decision.decision !== "allow") {
      return reply.forbidden("Current role cannot resolve this approval request.");
    }

    const now = new Date().toISOString();
    const updatedApproval =
      app.runtime.store.updateApproval(approval.id, (current) => ({
        ...current,
        decision: "denied",
        decidedBy: request.requestContext.userId,
        decidedAt: now,
        ...(body.reason ? { reason: body.reason } : current.reason ? { reason: current.reason } : {}),
      })) ?? approval;

    const updatedRun =
      app.runtime.store.updateRun(run.id, (current) => ({
        ...current,
        status: "failed",
        updatedAt: now,
      })) ?? run;

    app.runtime.audit.record({
      tenantId: approval.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "approval.denied",
      runId: approval.runId,
      ...(approval.stepId ? { stepId: approval.stepId } : {}),
      targetKind: "approval",
      targetId: approval.id,
      payload: {
        scope: approval.scope,
        actionSummary: approval.actionSummary,
        decidedBy: request.requestContext.userId,
        ...(updatedApproval.reason ? { reason: updatedApproval.reason } : {}),
      },
    });

    app.runtime.audit.record({
      tenantId: run.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "run.failed",
      runId: run.id,
      ...(approval.stepId ? { stepId: approval.stepId } : {}),
      targetKind: "run",
      targetId: run.id,
      payload: {
        status: updatedRun.status,
        approvalId: approval.id,
      },
    });

    return { approval: updatedApproval, run: updatedRun };
  });
};
