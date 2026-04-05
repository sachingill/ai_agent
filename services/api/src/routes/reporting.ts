import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import {
  createFinalReport,
  createProgressReport,
  summarizeRun,
  validateRunSummary,
} from "@self-agent/reporting";

const RunParamsSchema = z.object({
  runId: z.string().min(1),
});

const ReportQuerySchema = z.object({
  kind: z.enum(["progress", "final"]).default("progress"),
});

export const reportingRoutes: FastifyPluginAsync = async (app) => {
  app.get("/runs/:runId/summary", async (request, reply) => {
    const parsedParams = RunParamsSchema.safeParse(request.params);

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

    const task = app.runtime.store.getTask(run.taskId);
    if (!task) {
      return reply.notFound(`Task ${run.taskId} was not found.`);
    }

    const summary = summarizeRun({
      run,
      task,
      approvals: app.runtime.store.listApprovals({
        tenantId: run.tenantId,
        runId: run.id,
      }),
      auditEvents: app.runtime.audit.list({
        tenantId: run.tenantId,
        runId: run.id,
      }),
    });

    const validation = validateRunSummary(summary);

    return { summary, validation };
  });

  app.get("/runs/:runId/report", async (request, reply) => {
    const parsedParams = RunParamsSchema.safeParse(request.params);
    const parsedQuery = ReportQuerySchema.safeParse(request.query);

    if (!parsedParams.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedParams.error.issues,
      });
    }

    if (!parsedQuery.success) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message: parsedQuery.error.issues,
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

    const task = app.runtime.store.getTask(run.taskId);
    if (!task) {
      return reply.notFound(`Task ${run.taskId} was not found.`);
    }

    const summary = summarizeRun({
      run,
      task,
      approvals: app.runtime.store.listApprovals({
        tenantId: run.tenantId,
        runId: run.id,
      }),
      auditEvents: app.runtime.audit.list({
        tenantId: run.tenantId,
        runId: run.id,
      }),
    });

    return {
      report:
        parsedQuery.data.kind === "final"
          ? createFinalReport(summary)
          : createProgressReport(summary),
    };
  });
};
