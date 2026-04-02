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

export class InMemoryRunStore {
  private readonly tasks = new Map<string, StoredTask>();
  private readonly runs = new Map<string, StoredRun>();

  createTask(task: StoredTask): StoredTask {
    this.tasks.set(task.id, task);
    return task;
  }

  createRun(run: StoredRun): StoredRun {
    this.runs.set(run.id, run);
    return run;
  }

  getTask(taskId: string): StoredTask | undefined {
    return this.tasks.get(taskId);
  }

  getRun(runId: string): StoredRun | undefined {
    return this.runs.get(runId);
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
}
