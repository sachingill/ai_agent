import { randomUUID } from "node:crypto";

import { z } from "zod";

export const BrowserSessionStateValues = ["open", "closed"] as const;
export const BrowserSessionStateSchema = z.enum(BrowserSessionStateValues);
export type BrowserSessionState = z.infer<typeof BrowserSessionStateSchema>;

export const BrowserEventTypeValues = [
  "session.opened",
  "navigation.requested",
  "navigation.completed",
  "navigation.denied",
  "screenshot.captured",
  "session.closed",
] as const;
export const BrowserEventTypeSchema = z.enum(BrowserEventTypeValues);
export type BrowserEventType = z.infer<typeof BrowserEventTypeSchema>;

export const BrowserSessionSpecSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  purpose: z.string().min(1).max(500),
  allowedDomains: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BrowserSessionSpec = z.infer<typeof BrowserSessionSpecSchema>;
export type BrowserSessionSpecInput = z.input<typeof BrowserSessionSpecSchema>;

export const BrowserNavigationRequestSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
  reason: z.string().min(1).max(500).optional(),
});
export type BrowserNavigationRequest = z.infer<typeof BrowserNavigationRequestSchema>;

export const BrowserTraceEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  eventType: BrowserEventTypeSchema,
  occurredAt: z.string().datetime({ offset: true }),
  url: z.string().url().optional(),
  domain: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BrowserTraceEvent = z.infer<typeof BrowserTraceEventSchema>;

export const BrowserTraceArtifactSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  createdAt: z.string().datetime({ offset: true }),
  currentUrl: z.string().url().optional(),
  events: z.array(BrowserTraceEventSchema),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BrowserTraceArtifact = z.infer<typeof BrowserTraceArtifactSchema>;

export const BrowserScreenshotArtifactSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  capturedAt: z.string().datetime({ offset: true }),
  url: z.string().url(),
  mimeType: z.literal("image/png"),
  base64Content: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BrowserScreenshotArtifact = z.infer<typeof BrowserScreenshotArtifactSchema>;

export const BrowserSessionRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  runId: z.string().min(1),
  purpose: z.string().min(1),
  allowedDomains: z.array(z.string().min(1)),
  currentUrl: z.string().url().optional(),
  title: z.string().min(1).optional(),
  state: BrowserSessionStateSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type BrowserSessionRecord = z.infer<typeof BrowserSessionRecordSchema>;

export type BrowserWorkerIsolation = {
  workerId: string;
  sessionId: string;
  tenantId: string;
  runId: string;
  purpose: string;
  allowedDomains: string[];
};

export type BrowserNavigationResult = {
  session: BrowserSessionRecord;
  trace: BrowserTraceArtifact;
  screenshot: BrowserScreenshotArtifact;
};

export type BrowserAdapterPageSnapshot = {
  title: string;
  base64Screenshot: string;
  metadata?: Record<string, unknown>;
};

export type BrowserAdapterSession = {
  visit: (url: string) => BrowserAdapterPageSnapshot;
  close: () => void;
};

export type BrowserAdapter = {
  openSession: (input: {
    session: BrowserWorkerIsolation;
    openedAt: Date;
  }) => BrowserAdapterSession;
};

export type BrowserWorkerOptions = {
  adapter?: BrowserAdapter;
  idFactory?: () => string;
  now?: () => Date;
  workerId?: string;
};

export class BrowserWorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserWorkerError";
  }
}

export class BrowserDomainDeniedError extends BrowserWorkerError {
  readonly url: string;
  readonly allowedDomains: string[];

  constructor(url: string, allowedDomains: string[]) {
    super(`Navigation denied for disallowed domain: ${url}`);
    this.name = "BrowserDomainDeniedError";
    this.url = url;
    this.allowedDomains = [...allowedDomains];
  }
}

export class BrowserSessionNotFoundError extends BrowserWorkerError {
  constructor(sessionId: string) {
    super(`Browser session not found: ${sessionId}`);
    this.name = "BrowserSessionNotFoundError";
  }
}

export class BrowserSessionStateError extends BrowserWorkerError {
  constructor(message: string) {
    super(message);
    this.name = "BrowserSessionStateError";
  }
}

const createIso = (now: Date): string => now.toISOString();

const defaultAdapter: BrowserAdapter = {
  openSession({ session }) {
    return {
      visit(url: string) {
        const parsed = new URL(url);
        return {
          title: `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`,
          base64Screenshot: Buffer.from(
            JSON.stringify({
              workerId: session.workerId,
              sessionId: session.sessionId,
              tenantId: session.tenantId,
              runId: session.runId,
              url,
            }),
          ).toString("base64"),
          metadata: {
            workerId: session.workerId,
          },
        };
      },
      close() {
        return;
      },
    };
  },
};

const isAllowedDomain = (hostname: string, allowedDomains: readonly string[]): boolean => {
  if (allowedDomains.length === 0) {
    return false;
  }

  return allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
};

const cloneEvent = (event: BrowserTraceEvent): BrowserTraceEvent =>
  BrowserTraceEventSchema.parse({
    ...event,
    metadata: { ...event.metadata },
  });

const cloneSession = (session: BrowserSessionRecord): BrowserSessionRecord =>
  BrowserSessionRecordSchema.parse({
    ...session,
    allowedDomains: [...session.allowedDomains],
    metadata: { ...session.metadata },
  });

export class InMemoryBrowserWorker {
  private readonly workerId: string;
  private readonly adapter: BrowserAdapter;
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly sessions = new Map<string, BrowserSessionRecord>();
  private readonly adapters = new Map<string, BrowserAdapterSession>();
  private readonly traces = new Map<string, BrowserTraceArtifact>();
  private readonly screenshots = new Map<string, BrowserScreenshotArtifact[]>();

  constructor(options: BrowserWorkerOptions = {}) {
    this.workerId = options.workerId ?? "browser-worker";
    this.adapter = options.adapter ?? defaultAdapter;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? randomUUID;
  }

  openSession(spec: BrowserSessionSpecInput): BrowserSessionRecord {
    const parsed = BrowserSessionSpecSchema.parse(spec);
    const openedAt = this.now();
    const sessionId = this.idFactory();
    const session = BrowserSessionRecordSchema.parse({
      id: sessionId,
      tenantId: parsed.tenantId,
      runId: parsed.runId,
      purpose: parsed.purpose,
      allowedDomains: [...parsed.allowedDomains],
      state: "open",
      createdAt: createIso(openedAt),
      updatedAt: createIso(openedAt),
      metadata: {
        ...parsed.metadata,
        workerId: this.workerId,
      },
    });

    const trace = BrowserTraceArtifactSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      createdAt: createIso(openedAt),
      events: [
        BrowserTraceEventSchema.parse({
          id: this.idFactory(),
          sessionId: session.id,
          tenantId: session.tenantId,
          runId: session.runId,
          eventType: "session.opened",
          occurredAt: createIso(openedAt),
          metadata: {
            purpose: session.purpose,
            allowedDomains: [...session.allowedDomains],
            workerId: this.workerId,
          },
        }),
      ],
      metadata: {
        workerId: this.workerId,
      },
    });

    this.sessions.set(session.id, session);
    this.traces.set(session.id, trace);
    this.screenshots.set(session.id, []);

    const adapterSession = this.adapter.openSession({
      session: {
        workerId: this.workerId,
        sessionId: session.id,
        tenantId: session.tenantId,
        runId: session.runId,
        purpose: session.purpose,
        allowedDomains: [...session.allowedDomains],
      },
      openedAt,
    });

    this.adapters.set(session.id, adapterSession);

    return cloneSession(session);
  }

  getSession(sessionId: string): BrowserSessionRecord {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionNotFoundError(sessionId);
    }

    return cloneSession(session);
  }

  listSessions(): BrowserSessionRecord[] {
    return [...this.sessions.values()].map(cloneSession);
  }

  navigate(sessionId: string, url: string, reason?: string): BrowserNavigationResult {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionNotFoundError(sessionId);
    }

    if (session.state !== "open") {
      throw new BrowserSessionStateError(`Session ${sessionId} is ${session.state}`);
    }

    const parsedUrl = new URL(url);

    if (!isAllowedDomain(parsedUrl.hostname, session.allowedDomains)) {
      const deniedEvent = this.recordEvent(session, {
        eventType: "navigation.denied",
        url,
        domain: parsedUrl.hostname,
        metadata: {
          reason: reason ?? "Domain is outside the session allowlist.",
        },
      });
      const trace = this.traces.get(session.id)!;

      this.traces.set(session.id, {
        ...trace,
        events: [...trace.events, deniedEvent],
      });

      throw new BrowserDomainDeniedError(url, session.allowedDomains);
    }

    const requestedAt = this.now();
    const trace = this.traces.get(session.id);
    if (!trace) {
      throw new BrowserSessionStateError(`Trace missing for session ${sessionId}`);
    }

    const requestedEvent = BrowserTraceEventSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      eventType: "navigation.requested",
      occurredAt: createIso(requestedAt),
      url,
      domain: parsedUrl.hostname,
      metadata: {
        ...(reason ? { reason } : {}),
      },
    });

    const adapterSession = this.adapters.get(session.id);
    if (!adapterSession) {
      throw new BrowserSessionStateError(`Adapter session missing for ${sessionId}`);
    }

    const snapshot = adapterSession.visit(url);
    const completedAt = this.now();
    const updatedSession = BrowserSessionRecordSchema.parse({
      ...session,
      currentUrl: url,
      title: snapshot.title,
      updatedAt: createIso(completedAt),
      metadata: {
        ...session.metadata,
        lastNavigationAt: createIso(completedAt),
      },
    });

    this.sessions.set(session.id, updatedSession);

    const completedEvent = BrowserTraceEventSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      eventType: "navigation.completed",
      occurredAt: createIso(completedAt),
      url,
      domain: parsedUrl.hostname,
      metadata: {
        title: snapshot.title,
        workerId: this.workerId,
      },
    });

    const nextTrace = BrowserTraceArtifactSchema.parse({
      ...trace,
      currentUrl: url,
      events: [...trace.events, requestedEvent, completedEvent],
      metadata: {
        ...trace.metadata,
        lastNavigationAt: createIso(completedAt),
      },
    });
    this.traces.set(session.id, nextTrace);

    const screenshot = BrowserScreenshotArtifactSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      capturedAt: createIso(completedAt),
      url,
      mimeType: "image/png",
      base64Content: snapshot.base64Screenshot,
      metadata: {
        workerId: this.workerId,
        source: "navigation",
        ...(snapshot.metadata ?? {}),
      },
    });

    this.screenshots.set(session.id, [...(this.screenshots.get(session.id) ?? []), screenshot]);

    return {
      session: cloneSession(updatedSession),
      trace: BrowserTraceArtifactSchema.parse({
        ...nextTrace,
        events: nextTrace.events.map(cloneEvent),
        metadata: { ...nextTrace.metadata },
      }),
      screenshot: BrowserScreenshotArtifactSchema.parse({
        ...screenshot,
        metadata: { ...screenshot.metadata },
      }),
    };
  }

  captureScreenshot(sessionId: string): BrowserScreenshotArtifact {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionNotFoundError(sessionId);
    }

    if (session.state !== "open") {
      throw new BrowserSessionStateError(`Session ${sessionId} is ${session.state}`);
    }

    if (!session.currentUrl) {
      throw new BrowserSessionStateError(`Session ${sessionId} has no active page`);
    }

    const screenshots = this.screenshots.get(session.id) ?? [];
    const latest = screenshots.at(-1);

    if (latest) {
      return BrowserScreenshotArtifactSchema.parse({
        ...latest,
        metadata: { ...latest.metadata, source: "screenshot" },
      });
    }

    const screenshot = BrowserScreenshotArtifactSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      capturedAt: createIso(this.now()),
      url: session.currentUrl,
      mimeType: "image/png",
      base64Content: Buffer.from(
        JSON.stringify({
          sessionId: session.id,
          url: session.currentUrl,
          workerId: this.workerId,
        }),
      ).toString("base64"),
      metadata: {
        workerId: this.workerId,
        source: "screenshot",
      },
    });

    this.screenshots.set(session.id, [...screenshots, screenshot]);
    return screenshot;
  }

  closeSession(sessionId: string): BrowserSessionRecord {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new BrowserSessionNotFoundError(sessionId);
    }

    if (session.state === "closed") {
      throw new BrowserSessionStateError(`Session ${sessionId} is already closed`);
    }

    const closedAt = this.now();
    const next = BrowserSessionRecordSchema.parse({
      ...session,
      state: "closed",
      updatedAt: createIso(closedAt),
      metadata: {
        ...session.metadata,
        closedAt: createIso(closedAt),
      },
    });

    const adapterSession = this.adapters.get(session.id);
    if (adapterSession) {
      void adapterSession.close();
    }

    const trace = this.traces.get(session.id);
    if (trace) {
      this.traces.set(session.id, {
        ...trace,
        events: [
          ...trace.events,
          BrowserTraceEventSchema.parse({
            id: this.idFactory(),
            sessionId: session.id,
            tenantId: session.tenantId,
            runId: session.runId,
            eventType: "session.closed",
            occurredAt: createIso(closedAt),
            metadata: {
              workerId: this.workerId,
            },
          }),
        ],
      });
    }

    this.sessions.set(session.id, next);
    return cloneSession(next);
  }

  getTrace(sessionId: string): BrowserTraceArtifact {
    const trace = this.traces.get(sessionId);

    if (!trace) {
      throw new BrowserSessionNotFoundError(sessionId);
    }

    return BrowserTraceArtifactSchema.parse({
      ...trace,
      events: trace.events.map(cloneEvent),
      metadata: { ...trace.metadata },
    });
  }

  private recordEvent(
    session: BrowserSessionRecord,
    input: Omit<BrowserTraceEvent, "id" | "sessionId" | "tenantId" | "runId" | "occurredAt"> & {
      occurredAt?: string;
    },
  ): BrowserTraceEvent {
    return BrowserTraceEventSchema.parse({
      id: this.idFactory(),
      sessionId: session.id,
      tenantId: session.tenantId,
      runId: session.runId,
      occurredAt: input.occurredAt ?? createIso(this.now()),
      eventType: input.eventType,
      url: input.url,
      domain: input.domain,
      metadata: input.metadata ?? {},
    });
  }
}

export const createBrowserWorker = (options: BrowserWorkerOptions = {}) =>
  new InMemoryBrowserWorker(options);
