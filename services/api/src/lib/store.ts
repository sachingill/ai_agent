export type StoredTask = {
  id: string;
  tenantId: string;
  userId: string;
  goal: string;
  sensitivity: "low" | "medium" | "high";
  allowedTools: string[];
  createdAt: string;
};

export type StoredRun = {
  id: string;
  taskId: string;
  tenantId: string;
  userId: string;
  status: "pending" | "planning" | "blocked" | "running" | "completed" | "failed" | "canceled";
  createdAt: string;
  updatedAt: string;
};

export type StoredApproval = {
  id: string;
  tenantId: string;
  runId: string;
  stepId?: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decision: "pending" | "approved" | "denied";
  scope: "once" | "run";
  actionType: "read" | "write" | "create" | "update" | "delete" | "execute" | "approve" | "network";
  actionSummary: string;
  reason?: string;
  targetKind?: "task" | "run" | "step" | "tool" | "file" | "domain";
  targetLabel?: string;
  metadata: Record<string, unknown>;
};

export class InMemoryRunStore {
  private readonly tasks = new Map<string, StoredTask>();
  private readonly runs = new Map<string, StoredRun>();
  private readonly approvals = new Map<string, StoredApproval>();

  createTask(task: StoredTask): StoredTask {
    this.tasks.set(task.id, task);
    return task;
  }

  createRun(run: StoredRun): StoredRun {
    this.runs.set(run.id, run);
    return run;
  }

  createApproval(approval: StoredApproval): StoredApproval {
    this.approvals.set(approval.id, approval);
    return approval;
  }

  getTask(taskId: string): StoredTask | undefined {
    return this.tasks.get(taskId);
  }

  getRun(runId: string): StoredRun | undefined {
    return this.runs.get(runId);
  }

  getApproval(approvalId: string): StoredApproval | undefined {
    return this.approvals.get(approvalId);
  }

  listApprovals(filter: {
    tenantId: string;
    runId?: string;
    decision?: StoredApproval["decision"];
  }): StoredApproval[] {
    return [...this.approvals.values()]
      .filter((approval) => {
        if (approval.tenantId !== filter.tenantId) {
          return false;
        }

        if (filter.runId && approval.runId !== filter.runId) {
          return false;
        }

        if (filter.decision && approval.decision !== filter.decision) {
          return false;
        }

        return true;
      })
      .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
  }

  updateRun(runId: string, updater: (run: StoredRun) => StoredRun): StoredRun | undefined {
    const current = this.runs.get(runId);

    if (!current) {
      return undefined;
    }

    const next = updater(current);
    this.runs.set(runId, next);
    return next;
  }

  updateApproval(
    approvalId: string,
    updater: (approval: StoredApproval) => StoredApproval,
  ): StoredApproval | undefined {
    const current = this.approvals.get(approvalId);

    if (!current) {
      return undefined;
    }

    const next = updater(current);
    this.approvals.set(approvalId, next);
    return next;
  }
}
