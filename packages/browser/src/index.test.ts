import { describe, expect, it } from "vitest";

import {
  BrowserDomainDeniedError,
  BrowserSessionStateError,
  BrowserSessionStateSchema,
  BrowserTraceArtifactSchema,
  BrowserScreenshotArtifactSchema,
  BrowserSessionSpecSchema,
  BrowserNavigationRequestSchema,
  createBrowserWorker,
} from "./index.js";

describe("browser worker", () => {
  it("opens sessions with isolation metadata and records typed artifacts", () => {
    const worker = createBrowserWorker({
      workerId: "browser-worker-test",
      idFactory: (() => {
        let count = 0;
        return () => `browser-id-${++count}`;
      })(),
      now: (() => {
        const times: Date[] = [
          new Date("2026-04-03T05:00:00.000Z"),
          new Date("2026-04-03T05:00:01.000Z"),
        ];
        let index = 0;
        return () => times[Math.min(index++, times.length - 1)]!;
      })(),
    });

    const session = worker.openSession({
      tenantId: "tenant-alpha",
      runId: "run-alpha",
      purpose: "capture browser proof",
      allowedDomains: ["example.com"],
      metadata: { source: "unit-test" },
    });

    expect(BrowserSessionStateSchema.parse(session.state)).toBe("open");
    expect(session.metadata.workerId).toBe("browser-worker-test");

    const navigation = worker.navigate(session.id, "https://example.com/docs");

    expect(navigation.session.currentUrl).toBe("https://example.com/docs");
    expect(navigation.session.title).toBe("example.com/docs");
    expect(BrowserTraceArtifactSchema.parse(navigation.trace).sessionId).toBe(session.id);
    expect(BrowserScreenshotArtifactSchema.parse(navigation.screenshot).sessionId).toBe(session.id);

    const trace = worker.getTrace(session.id);
    expect(trace.events.map((event) => event.eventType)).toEqual([
      "session.opened",
      "navigation.requested",
      "navigation.completed",
    ]);

    const screenshot = worker.captureScreenshot(session.id);
    expect(screenshot.mimeType).toBe("image/png");
    expect(screenshot.url).toBe("https://example.com/docs");

    const closed = worker.closeSession(session.id);
    expect(closed.state).toBe("closed");
    expect(worker.getTrace(session.id).events.at(-1)?.eventType).toBe("session.closed");
  });

  it("rejects navigation outside the allowed domain list", () => {
    const worker = createBrowserWorker({
      idFactory: (() => {
        let count = 0;
        return () => `browser-id-${++count}`;
      })(),
    });

    const session = worker.openSession({
      tenantId: "tenant-beta",
      runId: "run-beta",
      purpose: "negative proof",
      allowedDomains: ["allowed.example"],
    });

    expect(() => worker.navigate(session.id, "https://evil.example")).toThrow(BrowserDomainDeniedError);

    const trace = worker.getTrace(session.id);
    expect(trace.events.map((event) => event.eventType)).toContain("navigation.denied");
  });

  it("keeps sessions isolated and blocks invalid lifecycle transitions", () => {
    const worker = createBrowserWorker({
      idFactory: (() => {
        let count = 0;
        return () => `browser-id-${++count}`;
      })(),
    });

    const sessionA = worker.openSession({
      tenantId: "tenant-a",
      runId: "run-a",
      purpose: "session a",
      allowedDomains: ["example.com"],
    });
    const sessionB = worker.openSession({
      tenantId: "tenant-b",
      runId: "run-b",
      purpose: "session b",
      allowedDomains: ["example.org"],
    });

    worker.navigate(sessionA.id, "https://example.com");
    worker.navigate(sessionB.id, "https://example.org");

    expect(worker.listSessions().map((session) => session.runId).sort()).toEqual(["run-a", "run-b"]);

    worker.closeSession(sessionA.id);

    expect(() => worker.navigate(sessionA.id, "https://example.com")).toThrow(BrowserSessionStateError);
    expect(() => worker.captureScreenshot(sessionA.id)).toThrow(BrowserSessionStateError);
  });

  it("parses session and navigation request schemas", () => {
    expect(
      BrowserSessionSpecSchema.parse({
        tenantId: "tenant-schema",
        runId: "run-schema",
        purpose: "schema validation",
        allowedDomains: ["example.com"],
      }),
    ).toBeTruthy();

    expect(
      BrowserNavigationRequestSchema.parse({
        sessionId: "browser-id-1",
        url: "https://example.com/path",
      }),
    ).toBeTruthy();
  });
});
