import Fastify from "fastify";
import sensible from "@fastify/sensible";

import { registerDecorators } from "./lib/runtime.js";
import { healthRoutes } from "./routes/health.js";
import { taskRoutes } from "./routes/tasks.js";

export const buildApp = async () => {
  const app = Fastify({
    logger: false,
  });

  await app.register(sensible);
  await registerDecorators(app);
  await app.register(healthRoutes);
  await app.register(taskRoutes);

  return app;
};
