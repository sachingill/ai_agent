import { randomUUID } from "node:crypto";

import type { FastifyInstance, FastifyRequest } from "fastify";

import { createAuditRecorder } from "@self-agent/audit";
import { RoleValues } from "@self-agent/contracts";
import { createDefaultPolicyEngine } from "@self-agent/policy";
import { InMemoryRunStore } from "./store.js";

export const createRuntimeContext = () => ({
  store: new InMemoryRunStore(),
  audit: createAuditRecorder(),
  policy: createDefaultPolicyEngine(),
});

export type RuntimeContext = ReturnType<typeof createRuntimeContext>;

export const registerDecorators = async (app: FastifyInstance): Promise<void> => {
  const runtime = createRuntimeContext();

  app.decorate("runtime", runtime);

  app.addHook("preHandler", async (request: FastifyRequest) => {
    const tenantId = request.headers["x-tenant-id"];
    const userId = request.headers["x-user-id"];
    const roleHeader = request.headers["x-user-role"];
    const requestedRoles =
      typeof roleHeader === "string"
        ? roleHeader
            .split(",")
            .map((value) => value.trim())
            .filter((value): value is (typeof RoleValues)[number] =>
              RoleValues.includes(value as (typeof RoleValues)[number]),
            )
        : [];

    request.requestContext = {
      requestId: randomUUID(),
      tenantId: typeof tenantId === "string" ? tenantId : "tenant-dev",
      userId: typeof userId === "string" ? userId : "user-dev",
      roles: requestedRoles.length > 0 ? requestedRoles : ["operator"],
    };
  });
};
