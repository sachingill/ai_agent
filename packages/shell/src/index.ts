import path from "node:path";
import { randomUUID } from "node:crypto";

import { z } from "zod";

export const ShellSessionStateValues = ["open", "closed"] as const;
export const ShellSessionStateSchema = z.enum(ShellSessionStateValues);
export type ShellSessionState = z.infer<typeof ShellSessionStateSchema>;

export const ShellExecutionStatusValues = [
  "succeeded",
  "failed",
  "timeout",
  "denied",
] as const;
export const ShellExecutionStatusSchema = z.enum(ShellExecutionStatusValues);
export type ShellExecutionStatus = z.infer<typeof ShellExecutionStatusSchema>;

export const ShellBudgetSchema = z.object({
  maxCommands: z.number().int().positive(),
  maxRuntimeMs: z.number().int().positive(),
});
export type ShellBudget = z.infer<typeof ShellBudgetSchema>;
export type ShellBudgetInput = z.input<typeof ShellBudgetSchema>;

export const ShellSessionSpecSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  purpose: z.string().min(1).max(500),
  cwd: z.string().min(1),
  allowedPaths: z.array(z.string().min(1)).min(1),
  allowedCommands: z.array(z.string().min(1)).default([]),
  allowedCommandFamilies: z.array(z.array(z.string().min(1)).min(1)).default([]),
  budgets: ShellBudgetSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ShellSessionSpec = z.infer<typeof ShellSessionSpecSchema>;
export type ShellSessionSpecInput = z.input<typeof ShellSessionSpecSchema>;

export const ShellCommandRequestSchema = z.object({
  sessionId: z.string().min(1),
  command: z.array(z.string().min(1)).min(1),
  cwd: z.string().min(1).optional(),
  stdin: z.string().optional(),
  environment: z.record(z.string(), z.string()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ShellCommandRequest = z.infer<typeof ShellCommandRequestSchema>;
export type ShellCommandRequestInput = z.input<typeof ShellCommandRequestSchema>;

export const ShellExecutionRecordSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  command: z.array(z.string().min(1)),
  commandLine: z.string().min(1),
  cwd: z.string().min(1),
  status: ShellExecutionStatusSchema,
  exitCode: z.number().int().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  durationMs: z.number().int().nonnegative(),
  reason: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ShellExecutionRecord = z.infer<typeof ShellExecutionRecordSchema>;

export const ShellSessionRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  purpose: z.string().min(1),
  cwd: z.string().min(1),
  allowedPaths: z.array(z.string().min(1)),
  allowedCommands: z.array(z.string().min(1)),
  allowedCommandFamilies: z.array(z.array(z.string().min(1)).min(1)),
  budgets: ShellBudgetSchema,
  state: ShellSessionStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  totalCommands: z.number().int().nonnegative(),
  totalRuntimeMs: z.number().int().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type ShellSessionRecord = z.infer<typeof ShellSessionRecordSchema>;

export type ShellWorkerIsolation = {
  workerId: string;
  sessionId: string;
  tenantId: string;
  runId: string;
  purpose: string;
  cwd: string;
  allowedPaths: string[];
  allowedCommands: string[];
  allowedCommandFamilies: string[][];
};

export type ShellExecutorRequest = {
  session: ShellWorkerIsolation;
  command: string[];
  cwd: string;
  stdin?: string;
  environment: Record<string, string>;
};

export type ShellExecutorResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
};

export type ShellExecutor = {
  execute: (request: ShellExecutorRequest) => Promise<ShellExecutorResult> | ShellExecutorResult;
};

export type ShellWorkerOptions = {
  executor?: ShellExecutor;
  idFactory?: () => string;
  now?: () => Date;
  workerId?: string;
};

export class ShellWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellWorkerError";
  }
}

export class ShellSessionNotFoundError extends ShellWorkerError {
  constructor(sessionId: string) {
    super(`Shell session not found: ${sessionId}`);
    this.name = "ShellSessionNotFoundError";
  }
}

export class ShellSessionStateError extends ShellWorkerError {
  constructor(message: string) {
    super(message);
    this.name = "ShellSessionStateError";
  }
}

export class ShellCommandDeniedError extends ShellWorkerError {
  readonly command: string[];

  constructor(message: string, command: string[]) {
    super(message);
    this.name = "ShellCommandDeniedError";
    this.command = [...command];
  }
}

export class ShellPathDeniedError extends ShellWorkerError {
  readonly cwd: string;

  constructor(cwd: string) {
    super(`Working directory is outside the allowed shell paths: ${cwd}`);
    this.name = "ShellPathDeniedError";
    this.cwd = cwd;
  }
}

export class ShellBudgetExceededError extends ShellWorkerError {
  constructor(message: string) {
    super(message);
    this.name = "ShellBudgetExceededError";
  }
}

const createIso = (now: Date): string => now.toISOString();

const defaultExecutor: ShellExecutor = {
  execute(request) {
    const commandLine = request.command.join(" ");
    return {
      stdout: [
        `executed: ${commandLine}`,
        `cwd: ${request.cwd}`,
        request.stdin ? `stdin: ${request.stdin}` : null,
      ]
        .filter((value): value is string => value !== null)
        .join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
      metadata: {
        workerId: request.session.workerId,
      },
    };
  },
};

const normalizeAbsolutePath = (value: string): string => {
  if (!path.isAbsolute(value)) {
    throw new ShellPathDeniedError(value);
  }

  return path.resolve(value);
};

const isPathWithin = (candidate: string, allowedPath: string): boolean => {
  const normalizedCandidate = normalizeAbsolutePath(candidate);
  const normalizedAllowed = normalizeAbsolutePath(allowedPath);

  return (
    normalizedCandidate === normalizedAllowed ||
    normalizedCandidate.startsWith(`${normalizedAllowed}${path.sep}`)
  );
};

const isCommandAllowed = (
  command: readonly string[],
  allowedCommands: readonly string[],
  allowedFamilies: readonly (readonly string[])[],
): boolean => {
  if (allowedCommands.includes(command[0] ?? "")) {
    return true;
  }

  return allowedFamilies.some((family) => {
    if (family.length > command.length) {
      return false;
    }

    return family.every((segment, index) => command[index] === segment);
  });
};

const commandLine = (command: readonly string[]): string => command.join(" ");

const cloneExecution = (execution: ShellExecutionRecord): ShellExecutionRecord =>
  ShellExecutionRecordSchema.parse({
    ...execution,
    command: [...execution.command],
    metadata: { ...execution.metadata },
  });

const cloneSession = (session: ShellSessionRecord): ShellSessionRecord =>
  ShellSessionRecordSchema.parse({
    ...session,
    allowedPaths: [...session.allowedPaths],
    allowedCommands: [...session.allowedCommands],
    allowedCommandFamilies: session.allowedCommandFamilies.map((family) => [...family]),
    metadata: { ...session.metadata },
  });

export class InMemoryShellWorker {
  private readonly workerId: string;
  private readonly executor: ShellExecutor;
  private readonly idFactory: () => string;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, ShellSessionRecord>();
  private readonly executions = new Map<string, ShellExecutionRecord>();

  constructor(options: ShellWorkerOptions = {}) {
    this.workerId = options.workerId ?? "shell-worker";
    this.executor = options.executor ?? defaultExecutor;
    this.idFactory = options.idFactory ?? randomUUID;
    this.now = options.now ?? (() => new Date());
  }

  openSession(spec: ShellSessionSpecInput): ShellSessionRecord {
    const parsed = ShellSessionSpecSchema.parse(spec);
    const normalizedCwd = normalizeAbsolutePath(parsed.cwd);
    const normalizedAllowedPaths = parsed.allowedPaths.map(normalizeAbsolutePath);

    if (!normalizedAllowedPaths.some((allowedPath) => isPathWithin(normalizedCwd, allowedPath))) {
      throw new ShellPathDeniedError(parsed.cwd);
    }

    const openedAt = this.now();
    const record = ShellSessionRecordSchema.parse({
      id: this.idFactory(),
      tenantId: parsed.tenantId,
      runId: parsed.runId,
      purpose: parsed.purpose,
      cwd: normalizedCwd,
      allowedPaths: normalizedAllowedPaths,
      allowedCommands: [...parsed.allowedCommands],
      allowedCommandFamilies: parsed.allowedCommandFamilies.map((family) => [...family]),
      budgets: parsed.budgets,
      state: "open",
      createdAt: createIso(openedAt),
      updatedAt: createIso(openedAt),
      totalCommands: 0,
      totalRuntimeMs: 0,
      metadata: {
        ...parsed.metadata,
        workerId: this.workerId,
      },
    });

    this.sessions.set(record.id, record);
    return cloneSession(record);
  }

  getSession(sessionId: string): ShellSessionRecord {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ShellSessionNotFoundError(sessionId);
    }

    return cloneSession(session);
  }

  listSessions(): ShellSessionRecord[] {
    return [...this.sessions.values()]
      .map(cloneSession)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getExecution(executionId: string): ShellExecutionRecord {
    const execution = this.executions.get(executionId);

    if (!execution) {
      throw new ShellWorkerError(`Shell execution not found: ${executionId}`);
    }

    return cloneExecution(execution);
  }

  listExecutions(sessionId?: string): ShellExecutionRecord[] {
    return [...this.executions.values()]
      .filter((execution) => (sessionId ? execution.sessionId === sessionId : true))
      .map(cloneExecution)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
  }

  async execute(request: ShellCommandRequestInput): Promise<ShellExecutionRecord> {
    const parsed = ShellCommandRequestSchema.parse(request);
    const session = this.sessions.get(parsed.sessionId);

    if (!session) {
      throw new ShellSessionNotFoundError(parsed.sessionId);
    }

    if (session.state !== "open") {
      throw new ShellSessionStateError(`Session ${parsed.sessionId} is ${session.state}`);
    }

    const cwd = normalizeAbsolutePath(parsed.cwd ?? session.cwd);

    if (!session.allowedPaths.some((allowedPath) => isPathWithin(cwd, allowedPath))) {
      const denied = this.recordExecution(session, {
        command: parsed.command,
        commandLine: commandLine(parsed.command),
        cwd,
        startedAt: this.now(),
        finishedAt: this.now(),
        durationMs: 0,
        status: "denied",
        exitCode: null,
        stdout: "",
        stderr: "",
        reason: "Working directory is outside the allowed shell paths.",
        metadata: {
          ...parsed.metadata,
          requestDenied: true,
        },
      });

      throw new ShellPathDeniedError(cwd);
    }

    if (
      !isCommandAllowed(
        parsed.command,
        session.allowedCommands,
        session.allowedCommandFamilies,
      )
    ) {
      const denied = this.recordExecution(session, {
        command: parsed.command,
        commandLine: commandLine(parsed.command),
        cwd,
        startedAt: this.now(),
        finishedAt: this.now(),
        durationMs: 0,
        status: "denied",
        exitCode: null,
        stdout: "",
        stderr: "",
        reason: `Command is outside the allowed shell list: ${commandLine(parsed.command)}`,
        metadata: {
          ...parsed.metadata,
          requestDenied: true,
        },
      });

      throw new ShellCommandDeniedError(denied.reason ?? "Command denied.", parsed.command);
    }

    if (session.totalCommands >= session.budgets.maxCommands) {
      const denied = this.recordExecution(session, {
        command: parsed.command,
        commandLine: commandLine(parsed.command),
        cwd,
        startedAt: this.now(),
        finishedAt: this.now(),
        durationMs: 0,
        status: "denied",
        exitCode: null,
        stdout: "",
        stderr: "",
        reason: "Command budget exceeded.",
        metadata: {
          ...parsed.metadata,
          budgetExceeded: true,
        },
      });

      throw new ShellBudgetExceededError(denied.reason ?? "Command budget exceeded.");
    }

    const startedAt = this.now();
    const result = await this.executor.execute({
      session: {
        workerId: this.workerId,
        sessionId: session.id,
        tenantId: session.tenantId,
        runId: session.runId,
        purpose: session.purpose,
        cwd: session.cwd,
        allowedPaths: [...session.allowedPaths],
        allowedCommands: [...session.allowedCommands],
        allowedCommandFamilies: session.allowedCommandFamilies.map((family) => [...family]),
      },
      command: [...parsed.command],
      cwd,
      ...(parsed.stdin ? { stdin: parsed.stdin } : {}),
      environment: { ...parsed.environment },
    });
    const finishedAt = this.now();
    const durationMs = Number.isFinite(result.durationMs) ? Math.max(0, Math.trunc(result.durationMs)) : 0;
    const nextTotalRuntimeMs = session.totalRuntimeMs + durationMs;

    if (nextTotalRuntimeMs > session.budgets.maxRuntimeMs) {
      const timeoutRecord = this.recordExecution(session, {
        command: parsed.command,
        commandLine: commandLine(parsed.command),
        cwd,
        startedAt,
        finishedAt,
        durationMs,
        status: "timeout",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        reason: "Shell runtime budget exceeded.",
        metadata: {
          ...parsed.metadata,
          ...result.metadata,
          budgetExceeded: true,
        },
      });

      throw new ShellBudgetExceededError(timeoutRecord.reason ?? "Shell runtime budget exceeded.");
    }

    const status: ShellExecutionStatus = result.exitCode === 0 ? "succeeded" : "failed";
    const execution = this.recordExecution(session, {
      command: parsed.command,
      commandLine: commandLine(parsed.command),
      cwd,
      startedAt,
      finishedAt,
      durationMs,
      status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      metadata: {
        ...parsed.metadata,
        ...result.metadata,
      },
    });

    this.sessions.set(session.id, {
      ...session,
      totalCommands: session.totalCommands + 1,
      totalRuntimeMs: nextTotalRuntimeMs,
      updatedAt: createIso(finishedAt),
    });

    return cloneExecution(execution);
  }

  closeSession(sessionId: string): ShellSessionRecord {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new ShellSessionNotFoundError(sessionId);
    }

    if (session.state === "closed") {
      throw new ShellSessionStateError(`Session ${sessionId} is already closed`);
    }

    const closedAt = this.now();
    const next = ShellSessionRecordSchema.parse({
      ...session,
      state: "closed",
      updatedAt: createIso(closedAt),
      metadata: {
        ...session.metadata,
        closedAt: createIso(closedAt),
      },
    });

    this.sessions.set(session.id, next);
    return cloneSession(next);
  }

  private recordExecution(
    session: ShellSessionRecord,
    execution: Omit<ShellExecutionRecord, "id" | "sessionId" | "tenantId" | "runId" | "startedAt" | "finishedAt"> & {
      startedAt: Date;
      finishedAt: Date;
    },
  ): ShellExecutionRecord {
    const record = ShellExecutionRecordSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      command: [...execution.command],
      commandLine: commandLine(execution.command),
      cwd: execution.cwd,
      status: execution.status,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      startedAt: createIso(execution.startedAt),
      finishedAt: createIso(execution.finishedAt),
      durationMs: execution.durationMs,
      ...(execution.reason ? { reason: execution.reason } : {}),
      metadata: { ...execution.metadata },
    });

    this.executions.set(record.id, record);
    return record;
  }
}

export const createShellWorker = (options: ShellWorkerOptions = {}) =>
  new InMemoryShellWorker(options);
