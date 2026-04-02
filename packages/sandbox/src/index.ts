export type SandboxCpuLimits = {
  millicores: number;
  maxBurstMillicores?: number;
};

export type SandboxMemoryLimits = {
  megabytes: number;
  maxBurstMegabytes?: number;
};

export type SandboxFilesystemPolicy = {
  rootPath: string;
  writablePaths: ReadonlyArray<string>;
  readonlyPaths: ReadonlyArray<string>;
  tempPaths: ReadonlyArray<string>;
  allowHostMounts: boolean;
};

export type SandboxNetworkPolicy = {
  allowOutbound: boolean;
  allowedDomains: ReadonlyArray<string>;
  allowedPorts: ReadonlyArray<number>;
  blockPrivateRanges: boolean;
};

export type SandboxResourceLimits = {
  cpu: SandboxCpuLimits;
  memory: SandboxMemoryLimits;
  filesystem: SandboxFilesystemPolicy;
  network: SandboxNetworkPolicy;
  maxProcessCount: number;
  maxRuntimeMs: number;
};

export type SandboxProvisionSpec = {
  tenantId: string;
  runId: string;
  purpose: string;
  resourceLimits: SandboxResourceLimits;
  labels?: ReadonlyArray<string>;
};

export type SandboxLifecycleState =
  | "provisioning"
  | "ready"
  | "destroying"
  | "destroyed";

export type SandboxRecord = {
  id: string;
  tenantId: string;
  runId: string;
  purpose: string;
  resourceLimits: SandboxResourceLimits;
  labels: string[];
  state: SandboxLifecycleState;
  createdAt: string;
  readyAt: string | null;
  destroyedAt: string | null;
};

export type ProvisionOptions = {
  now?: Date;
  idFactory?: () => string;
};

export type DestroyOptions = {
  now?: Date;
};

export class SandboxStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxStateError";
  }
}

export class SandboxManager {
  private readonly sandboxes = new Map<string, SandboxRecord>();

  provision(spec: SandboxProvisionSpec, options: ProvisionOptions = {}): SandboxRecord {
    this.assertPositiveNumber(spec.resourceLimits.cpu.millicores, "cpu.millicores");
    this.assertPositiveNumber(spec.resourceLimits.memory.megabytes, "memory.megabytes");
    this.assertPositiveNumber(spec.resourceLimits.maxProcessCount, "maxProcessCount");
    this.assertPositiveNumber(spec.resourceLimits.maxRuntimeMs, "maxRuntimeMs");
    this.assertReadOnlyFilesystem(spec.resourceLimits.filesystem);
    this.assertNetworkPolicy(spec.resourceLimits.network);

    const now = options.now ?? new Date();
    const record: SandboxRecord = {
      id: options.idFactory?.() ?? `sandbox_${this.sandboxes.size + 1}`,
      tenantId: spec.tenantId,
      runId: spec.runId,
      purpose: spec.purpose,
      resourceLimits: spec.resourceLimits,
      labels: [...(spec.labels ?? [])],
      state: "ready",
      createdAt: now.toISOString(),
      readyAt: now.toISOString(),
      destroyedAt: null,
    };

    this.sandboxes.set(record.id, record);
    return record;
  }

  get(id: string): SandboxRecord | null {
    const sandbox = this.sandboxes.get(id);
    return sandbox ? { ...sandbox, labels: [...sandbox.labels] } : null;
  }

  list(): SandboxRecord[] {
    return [...this.sandboxes.values()]
      .map((sandbox) => ({ ...sandbox, labels: [...sandbox.labels] }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  destroy(id: string, options: DestroyOptions = {}): SandboxRecord {
    const current = this.sandboxes.get(id);

    if (!current) {
      throw new SandboxStateError(`Sandbox not found: ${id}`);
    }

    if (current.state === "destroyed") {
      throw new SandboxStateError(`Sandbox already destroyed: ${id}`);
    }

    const now = options.now ?? new Date();
    const destroyed: SandboxRecord = {
      ...current,
      state: "destroyed",
      destroyedAt: now.toISOString(),
    };

    this.sandboxes.set(id, destroyed);
    return { ...destroyed, labels: [...destroyed.labels] };
  }

  markDestroying(id: string): SandboxRecord {
    const current = this.sandboxes.get(id);

    if (!current) {
      throw new SandboxStateError(`Sandbox not found: ${id}`);
    }

    if (current.state !== "ready") {
      throw new SandboxStateError(`Sandbox cannot transition to destroying from ${current.state}`);
    }

    const next: SandboxRecord = {
      ...current,
      state: "destroying",
    };

    this.sandboxes.set(id, next);
    return { ...next, labels: [...next.labels] };
  }

  private assertPositiveNumber(value: number, fieldName: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new SandboxStateError(`${fieldName} must be a positive number`);
    }
  }

  private assertReadOnlyFilesystem(filesystem: SandboxFilesystemPolicy): void {
    if (filesystem.allowHostMounts !== false) {
      throw new SandboxStateError("filesystem.allowHostMounts must be false");
    }

    if (!filesystem.rootPath.startsWith("/")) {
      throw new SandboxStateError("filesystem.rootPath must be absolute");
    }
  }

  private assertNetworkPolicy(network: SandboxNetworkPolicy): void {
    if (!Array.isArray(network.allowedDomains) || !Array.isArray(network.allowedPorts)) {
      throw new SandboxStateError("network policy must list allowed domains and ports");
    }
  }
}

export const createSandboxManager = () => new SandboxManager();
