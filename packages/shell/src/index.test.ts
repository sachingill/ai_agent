import { describe, expect, it } from "vitest";

import {
  ShellBudgetExceededError,
  ShellCommandDeniedError,
  ShellPathDeniedError,
  ShellSessionStateError,
  ShellSessionSpecSchema,
  ShellCommandRequestSchema,
  ShellExecutionRecordSchema,
  createShellWorker,
} from "./index.js";

describe("shell worker", () => {
  it("executes allowed commands and captures stdout and stderr", async () => {
    const worker = createShellWorker({
      workerId: "shell-worker-test",
      idFactory: (() => {
        let count = 0;
        return () => `shell-id-${++count}`;
      })(),
      now: (() => {
        const times = [
          new Date("2026-04-03T06:00:00.000Z"),
          new Date("2026-04-03T06:00:01.000Z"),
        ];
        let index = 0;
        return () => times[Math.min(index++, times.length - 1)]!;
      })(),
      executor: {
        execute: async () => ({
          stdout: "build complete",
          stderr: "warning: cached result",
          exitCode: 0,
          durationMs: 12,
          metadata: {
            adapter: "fake",
          },
        }),
      },
    });

    const session = worker.openSession({
      tenantId: "tenant-shell",
      runId: "run-shell",
      purpose: "run approved build command",
      cwd: "/workspace/project",
      allowedPaths: ["/workspace"],
      allowedCommands: ["npm"],
      allowedCommandFamilies: [["git"]],
      budgets: {
        maxCommands: 4,
        maxRuntimeMs: 100,
      },
      metadata: {
        source: "unit-test",
      },
    });

    const result = await worker.execute({
      sessionId: session.id,
      command: ["npm", "run", "build"],
      stdin: "ignored",
      environment: {
        CI: "1",
      },
    });

    expect(result.status).toBe("succeeded");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("build complete");
    expect(result.stderr).toBe("warning: cached result");
    expect(ShellExecutionRecordSchema.parse(result).commandLine).toBe("npm run build");

    const stored = worker.getExecution(result.id);
    expect(stored.metadata.adapter).toBe("fake");
    expect(worker.getSession(session.id).totalCommands).toBe(1);
    expect(worker.getSession(session.id).totalRuntimeMs).toBe(12);
  });

  it("rejects commands outside the allowlist and records the denial", async () => {
    const worker = createShellWorker({
      executor: {
        execute: async () => ({
          stdout: "should not be used",
          stderr: "",
          exitCode: 0,
          durationMs: 1,
        }),
      },
    });

    const session = worker.openSession({
      tenantId: "tenant-deny",
      runId: "run-deny",
      purpose: "deny shell access",
      cwd: "/workspace/project",
      allowedPaths: ["/workspace"],
      allowedCommands: ["npm"],
      budgets: {
        maxCommands: 1,
        maxRuntimeMs: 10,
      },
    });

    await expect(
      worker.execute({
        sessionId: session.id,
        command: ["rm", "-rf", "/"],
      }),
    ).rejects.toBeInstanceOf(ShellCommandDeniedError);

    expect(worker.listExecutions(session.id)).toHaveLength(1);
    expect(worker.listExecutions(session.id)[0]?.status).toBe("denied");
  });

  it("enforces runtime budgets and marks over-budget work as a timeout", async () => {
    const worker = createShellWorker({
      executor: {
        execute: async () => ({
          stdout: "too slow",
          stderr: "",
          exitCode: 0,
          durationMs: 25,
        }),
      },
    });

    const session = worker.openSession({
      tenantId: "tenant-budget",
      runId: "run-budget",
      purpose: "budget test",
      cwd: "/workspace/project",
      allowedPaths: ["/workspace"],
      allowedCommands: ["npm"],
      budgets: {
        maxCommands: 2,
        maxRuntimeMs: 10,
      },
    });

    await expect(
      worker.execute({
        sessionId: session.id,
        command: ["npm", "run", "test"],
      }),
    ).rejects.toBeInstanceOf(ShellBudgetExceededError);

    expect(worker.listExecutions(session.id)[0]?.status).toBe("timeout");
    expect(worker.getSession(session.id).totalCommands).toBe(0);
  });

  it("rejects cwd paths outside the allowed directories", async () => {
    const worker = createShellWorker();

    const session = worker.openSession({
      tenantId: "tenant-path",
      runId: "run-path",
      purpose: "cwd restriction",
      cwd: "/workspace/project",
      allowedPaths: ["/workspace"],
      allowedCommands: ["npm"],
      budgets: {
        maxCommands: 1,
        maxRuntimeMs: 10,
      },
    });

    await expect(
      worker.execute({
        sessionId: session.id,
        command: ["npm", "run", "build"],
        cwd: "/etc",
      }),
    ).rejects.toBeInstanceOf(ShellPathDeniedError);
  });

  it("rejects invalid session lifecycle transitions and schemas", async () => {
    const worker = createShellWorker();

    expect(() =>
      worker.openSession({
        tenantId: "tenant-invalid",
        runId: "run-invalid",
        purpose: "invalid cwd",
        cwd: "relative/path",
        allowedPaths: ["/workspace"],
        allowedCommands: ["npm"],
        budgets: {
          maxCommands: 1,
          maxRuntimeMs: 10,
        },
      }),
    ).toThrow(ShellPathDeniedError);

    const session = worker.openSession({
      tenantId: "tenant-lifecycle",
      runId: "run-lifecycle",
      purpose: "lifecycle",
      cwd: "/workspace/project",
      allowedPaths: ["/workspace"],
      allowedCommands: ["npm"],
      budgets: {
        maxCommands: 1,
        maxRuntimeMs: 10,
      },
    });

    worker.closeSession(session.id);

    await expect(
      worker.execute({
        sessionId: session.id,
        command: ["npm", "run", "build"],
      }),
    ).rejects.toBeInstanceOf(ShellSessionStateError);

    expect(
      ShellSessionSpecSchema.parse({
        tenantId: "tenant-schema",
        runId: "run-schema",
        purpose: "schema validation",
        cwd: "/workspace",
        allowedPaths: ["/workspace"],
        allowedCommands: ["npm"],
        allowedCommandFamilies: [["git"]],
        budgets: {
          maxCommands: 1,
          maxRuntimeMs: 10,
        },
      }),
    ).toBeTruthy();

    expect(
      ShellCommandRequestSchema.parse({
        sessionId: session.id,
        command: ["npm", "run", "build"],
        cwd: "/workspace/project",
      }),
    ).toBeTruthy();
  });
});
