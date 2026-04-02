import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

const AuditQuerySchema = z.object({
  tenantId: z.string().optional(),
  runId: z.string().optional(),
  stepId: z.string().optional(),
});

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get("/audit", async (request, reply) => {
    const query = AuditQuerySchema.parse(request.query);
    const tenantId = query.tenantId ?? request.requestContext.tenantId;

    if (tenantId !== request.requestContext.tenantId) {
      return reply.forbidden("Audit events are outside the active tenant scope.");
    }

    const filter = {
      tenantId,
      ...(query.runId ? { runId: query.runId } : {}),
      ...(query.stepId ? { stepId: query.stepId } : {}),
    };

    const events = app.runtime.audit.list(filter);

    return { events };
  });
};
