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
    const body = CreateTaskBodySchema.parse(request.body);
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

    return reply.code(201).send({ task });
  });

  app.post("/tasks/:id/runs", async (request, reply) => {
    const { id } = StartRunParamsSchema.parse(request.params);
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

    return reply.code(201).send({ run });
  });

  app.get("/runs/:runId", async (request, reply) => {
    const { runId } = RunActionParamsSchema.parse(request.params);
    const run = app.runtime.store.getRun(runId);

    if (!run) {
      return reply.notFound(`Run ${runId} was not found.`);
    }

    if (run.tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Run is outside the active tenant scope.");
    }

    return { run };
  });

  app.post("/runs/:runId/cancel", async (request, reply) => {
    const { runId } = RunActionParamsSchema.parse(request.params);
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

    return { run };
  });
};
