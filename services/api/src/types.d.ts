import type { RuntimeContext } from "./lib/runtime.js";

declare module "fastify" {
  interface FastifyInstance {
    runtime: RuntimeContext;
  }

  interface FastifyRequest {
    requestContext: {
      requestId: string;
      tenantId: string;
      userId: string;
    };
  }
}
