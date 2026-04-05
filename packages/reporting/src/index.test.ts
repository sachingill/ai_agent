import { describe, expect, it } from "vitest";

import {
  FinalReportSchema,
  ProgressReportSchema,
  ValidationResultSchema,
  createFinalReport,
  createProgressReport,
  summarizeRun,
  validateRunSummary,
} from "./index.js";

describe("reporting", () => {
  it("summarizes runs with approvals, blockers, and extracted artifacts", () => {
    const summary = summarizeRun({
      run: {
        id: "run-123",
        tenantId: "tenant-alpha",
        taskId: "task-123",
        status: "blocked",
        createdAt: "2026-04-05T03:00:00.000Z",
        updatedAt: "2026-04-05T03:05:00.000Z",
      },
      task: {
        id: "task-123",
        goal: "Review secure runtime launch readiness",
        sensitivity: "high",
        allowedTools: ["browser.read", "shell.exec"],
      },
      approvals: [
        {
          id: "approval-1",
          decision: "pending",
          scope: "run",
          actionType: "execute",
          actionSummary: "Approve shell.exec for smoke test",
          requestedAt: "2026-04-05T03:01:00.000Z",
        },
      ],
      auditEvents: [
        {
          eventType: "tool.completed",
          occurredAt: "2026-04-05T03:02:00.000Z",
          payload: {
            artifact: {
              title: "Smoke Test Log",
              kind: "log",
              url: "https://artifacts.local/log-1",
            },
          },
        },
      ],
    });

    expect(summary.blockers).toHaveLength(1);
    expect(summary.artifacts[0]?.title).toBe("Smoke Test Log");

    const validation = validateRunSummary(summary);
    expect(ValidationResultSchema.parse(validation).decision).toBe("approval_needed");

    const progress = createProgressReport(summary);
    expect(ProgressReportSchema.parse(progress).approvalsPending).toBe(1);
  });

  it("creates final pass reports for completed runs", () => {
    const summary = summarizeRun({
      run: {
        id: "run-456",
        tenantId: "tenant-beta",
        taskId: "task-456",
        status: "completed",
        createdAt: "2026-04-05T04:00:00.000Z",
        updatedAt: "2026-04-05T04:10:00.000Z",
      },
      task: {
        id: "task-456",
        goal: "Prepare launch report",
        sensitivity: "medium",
        allowedTools: ["browser.read"],
      },
      approvals: [
        {
          id: "approval-2",
          decision: "approved",
          scope: "once",
          actionType: "read",
          actionSummary: "Approve browser trace capture",
          requestedAt: "2026-04-05T04:01:00.000Z",
          decidedAt: "2026-04-05T04:02:00.000Z",
        },
      ],
      auditEvents: [
        {
          eventType: "tool.completed",
          payload: {
            artifacts: [
              {
                title: "Trace Archive",
                kind: "trace",
                url: "https://artifacts.local/trace-1",
              },
            ],
          },
        },
      ],
    });

    const validation = validateRunSummary(summary);
    expect(validation.decision).toBe("pass");

    const finalReport = createFinalReport(summary);
    expect(FinalReportSchema.parse(finalReport).artifacts[0]).toContain("Trace Archive");
  });
});
