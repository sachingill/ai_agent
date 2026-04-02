import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const start = async () => {
  const app = await buildApp();
  await app.listen({ port, host });
};

start().catch((error) => {
  // Keep bootstrap logging simple until audit sinks are wired in.
  console.error(error);
  process.exitCode = 1;
});
