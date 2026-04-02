import { describe, expect, it } from "vitest";

import { SandboxManager, SandboxStateError, createSandboxManager } from "./index.js";

const baseSpec = {
  tenantId: "tenant-alpha",
  runId: "run-123",
  purpose: "Run browser-based security validation in isolation.",
  resourceLimits: {
    cpu: {
      millicores: 500,
      maxBurstMillicores: 1000,
    },
    memory: {
      megabytes: 1024,
      maxBurstMegabytes: 1536,
    },
    filesystem: {
      rootPath: "/workspace",
      writablePaths: ["/workspace/output"],
      readonlyPaths: ["/workspace/input"],
      tempPaths: ["/tmp"],
      allowHostMounts: false,
    },
    network: {
      allowOutbound: true,
      allowedDomains: ["example.com"],
      allowedPorts: [443],
      blockPrivateRanges: true,
    },
    maxProcessCount: 20,
    maxRuntimeMs: 30_000,
  },
  labels: ["browser", "secure"],
} as const;

describe("sandbox manager", () => {
  it("provisions, lists, gets, and destroys a sandbox with safe state transitions", () => {
    const manager = createSandboxManager();
    const created = manager.provision(baseSpec, {
      now: new Date("2026-04-02T10:00:00.000Z"),
      idFactory: () => "sandbox-1",
    });

    expect(created.state).toBe("ready");
    expect(created.readyAt).toBe("2026-04-02T10:00:00.000Z");
    expect(manager.list()).toHaveLength(1);
    expect(manager.get("sandbox-1")?.id).toBe("sandbox-1");

    const destroying = manager.markDestroying("sandbox-1");
    expect(destroying.state).toBe("destroying");

    const destroyed = manager.destroy("sandbox-1", {
      now: new Date("2026-04-02T10:05:00.000Z"),
    });

    expect(destroyed.state).toBe("destroyed");
    expect(destroyed.destroyedAt).toBe("2026-04-02T10:05:00.000Z");
  });

  it("rejects invalid lifecycle transitions and teardown errors", () => {
    const manager = new SandboxManager();

    expect(() => manager.destroy("missing")).toThrow(SandboxStateError);

    const sandbox = manager.provision(baseSpec, {
      idFactory: () => "sandbox-2",
    });

    manager.destroy(sandbox.id);

    expect(() => manager.destroy(sandbox.id)).toThrow(/already destroyed/i);
    expect(() => manager.markDestroying(sandbox.id)).toThrow(/cannot transition/i);
  });

  it("rejects invalid resource restrictions", () => {
    const manager = new SandboxManager();

    expect(() =>
      manager.provision(
        {
          ...baseSpec,
          resourceLimits: {
            ...baseSpec.resourceLimits,
            cpu: {
              millicores: 0,
            },
          },
        },
        { idFactory: () => "sandbox-3" },
      ),
    ).toThrow(/cpu\.millicores/);

    expect(() =>
      manager.provision(
        {
          ...baseSpec,
          resourceLimits: {
            ...baseSpec.resourceLimits,
            filesystem: {
              ...baseSpec.resourceLimits.filesystem,
              allowHostMounts: true,
            },
          },
        },
        { idFactory: () => "sandbox-4" },
      ),
    ).toThrow(/allowHostMounts/);
  });
});
