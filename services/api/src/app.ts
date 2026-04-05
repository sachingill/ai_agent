import Fastify from "fastify";
import sensible from "@fastify/sensible";
import { ZodError } from "zod";

import { registerDecorators } from "./lib/runtime.js";
import { approvalRoutes } from "./routes/approvals.js";
import { auditRoutes } from "./routes/audit.js";
import { healthRoutes } from "./routes/health.js";
import { reportingRoutes } from "./routes/reporting.js";
import { taskRoutes } from "./routes/tasks.js";

export const buildApp = async () => {
  const app = Fastify({
    logger: false,
  });

  await app.register(sensible);
  await registerDecorators(app);
  await app.register(approvalRoutes);
  await app.register(healthRoutes);
  await app.register(reportingRoutes);
  await app.register(auditRoutes);
  await app.register(taskRoutes);

  app.setErrorHandler((error, _request, reply) => {
    const errorWithIssues = error as { issues?: unknown };
    const errorWithMessage = error as { message?: unknown };
    const hasSerializedZodIssues =
      typeof errorWithMessage.message === "string" &&
      errorWithMessage.message.trim().startsWith("[") &&
      errorWithMessage.message.includes("\"path\"");

    if (
      error instanceof ZodError ||
      (typeof error === "object" &&
        error !== null &&
        Array.isArray(errorWithIssues.issues)) ||
      hasSerializedZodIssues
    ) {
      return reply.code(400).send({
        statusCode: 400,
        error: "Bad Request",
        message:
          error instanceof ZodError || Array.isArray(errorWithIssues.issues)
            ? errorWithIssues.issues
            : errorWithMessage.message,
      });
    }

    return reply.send(error);
  });

  return app;
};
