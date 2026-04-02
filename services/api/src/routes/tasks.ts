import { randomUUID } from "node:crypto";

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const CreateTaskBodySchema = z.object({
  goal: z.string().min(1),
  sensitivity: z.enum(["low", "medium", "high"]).default("medium"),
  allowedTools: z.array(z.string().min(1)).default([]),
});

const StartRunParamsSchema = z.object({
  id: z.string().min(1),
});

const RunActionParamsSchema = z.object({
  runId: z.string().min(1),
});

export const taskRoutes: FastifyPluginAsync = async (app) => {
  app.post("/tasks", async (request, reply) => {
    const parsedBody = CreateTaskBodySchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedBody.error.issues,
      });
    }

    const body = parsedBody.data;
    const { tenantId, userId } = request.requestContext;

    const task = app.runtime.store.createTask({
      id: randomUUID(),
      tenantId,
      userId,
      goal: body.goal,
      sensitivity: body.sensitivity,
      allowedTools: body.allowedTools,
      createdAt: new Date().toISOString(),
    });

    app.runtime.audit.record({
      tenantId,
      actorSubjectId: userId,
      eventType: "task.created",
      targetKind: "task",
      targetId: task.id,
      payload: {
        goal: task.goal,
        sensitivity: task.sensitivity,
        allowedTools: task.allowedTools,
      },
    });

    return reply.code(201).send({ task });
  });

  app.post("/tasks/:id/runs", async (request, reply) => {
    const parsedParams = StartRunParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedParams.error.issues,
      });
    }

    const { id } = parsedParams.data;
    const task = app.runtime.store.getTask(id);

    if (!task) {
      return reply.notFound(`Task ${id} was not found.`);
    }

    if (task.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Task is outside the active tenant scope.");
    }

    const now = new Date().toISOString();
    const run = app.runtime.store.createRun({
      id: randomUUID(),
      taskId: task.id,
      tenantId: task.tenantId,
      userId: request.requestContext.userId,
      status: "planning",
      createdAt: now,
      updatedAt: now,
    });

    app.runtime.audit.record({
      tenantId: task.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "run.created",
      runId: run.id,
      targetKind: "run",
      targetId: run.id,
      payload: {
        taskId: task.id,
        status: run.status,
      },
    });

    return reply.code(201).send({ run });
  });

  app.get("/runs/:runId", async (request, reply) => {
    const parsedParams = RunActionParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedParams.error.issues,
      });
    }

    const { runId } = parsedParams.data;
    const run = app.runtime.store.getRun(runId);

    if (!run) {
      return reply.notFound(`Run ${runId} was not found.`);
    }

    if (run.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Run is outside the active tenant scope.");
    }

    app.runtime.audit.record({
      tenantId: run.tenantId,
      actorSubjectId: request.requestContext.userId,
      eventType: "run.read",
      runId: run.id,
      targetKind: "run",
      targetId: run.id,
      payload: {
        status: run.status,
      },
    });

    return { run };
  });

  app.post("/runs/:runId/cancel", async (request, reply) => {
    const parsedParams = RunActionParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedParams.error.issues,
      });
    }

    const { runId } = parsedParams.data;
    const existingRun = app.runtime.store.getRun(runId);

    if (!existingRun) {
      return reply.notFound(`Run ${runId} was not found.`);
    }

    if (existingRun.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Run is outside the active tenant scope.");
    }

    const run = app.runtime.store.updateRun(runId, (current) => ({
      ...current,
      status: "canceled",
      updatedAt: new Date().toISOString(),
    }));

    if (run) {
      app.runtime.audit.record({
        tenantId: run.tenantId,
        actorSubjectId: request.requestContext.userId,
        eventType: "run.canceled",
        runId: run.id,
        targetKind: "run",
        targetId: run.id,
        payload: {
          status: run.status,
        },
      });
    }

    return { run };
  });
};
