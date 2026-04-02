import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { createAuditRecorder } from "@self-agent/audit";
import { InMemoryRunStore } from "./store.js";

export const createRuntimeContext = () => ({
  store: new InMemoryRunStore(),
  audit: createAuditRecorder(),
});

export type RuntimeContext = ReturnType<typeof createRuntimeContext>;

export const registerDecorators = async (app: FastifyInstance): Promise<void> => {
  const runtime = createRuntimeContext();

  app.decorate("runtime", runtime);

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const tenantId = request.headers["x-tenant-id"];
    const userId = request.headers["x-user-id"];

    request.requestContext = {
      requestId: randomUUID(),
      tenantId: typeof tenantId === "string" ? tenantId : "tenant-dev",
      userId: typeof userId === "string" ? userId : "user-dev",
    };
  });
};
