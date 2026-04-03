import { describe, expect, it } from "vitest";

import { InMemorySecretsBroker, SecretLeaseError, createSecretsBroker } from "./index.js";

describe("secrets broker", () => {
  it("issues, lists, and gets scoped leases", () => {
    const broker = createSecretsBroker();
    const lease = broker.issue(
      {
        tenantId: "tenant-alpha",
        toolName: "browser",
        runId: "run-123",
        secretName: "openai-api-key",
        requestedBy: "user-123",
        ttlMs: 60_000,
        scopes: ["read", "write"],
        metadata: { purpose: "test" },
      },
      { now: new Date("2026-04-02T10:00:00.000Z"), idFactory: () => "lease-1" },
    );

    expect(lease.state).toBe("active");
    expect(lease.expiresAt).toBe("2026-04-02T10:01:00.000Z");
    expect(broker.list({ tenantId: "tenant-alpha" })).toHaveLength(1);
    expect(broker.get("lease-1")?.secretName).toBe("openai-api-key");
    expect(broker.list({ runId: "run-123" })[0]?.id).toBe("lease-1");
  });

  it("revokes and expires leases with safe state transitions", () => {
    const broker = new InMemorySecretsBroker();
    const lease = broker.issue(
      {
        tenantId: "tenant-alpha",
        toolName: "shell",
        runId: "run-234",
        secretName: "database-password",
        requestedBy: "user-123",
        ttlMs: 1_000,
      },
      { now: new Date("2026-04-02T10:00:00.000Z"), idFactory: () => "lease-2" },
    );

    const revoked = broker.revoke(lease.id, {
      now: new Date("2026-04-02T10:00:30.000Z"),
    });

    expect(revoked.state).toBe("revoked");
    expect(revoked.revokedAt).toBe("2026-04-02T10:00:30.000Z");

    expect(() => broker.revoke(lease.id)).toThrow(SecretLeaseError);

    const expiringBroker = new InMemorySecretsBroker();
    expiringBroker.issue(
      {
        tenantId: "tenant-alpha",
        toolName: "browser",
        runId: "run-345",
        secretName: "service-token",
        requestedBy: "user-123",
        ttlMs: 1_000,
      },
      { now: new Date("2026-04-02T10:00:00.000Z"), idFactory: () => "lease-3" },
    );

    const expired = expiringBroker.expire(new Date("2026-04-02T10:00:01.000Z"));

    expect(expired).toHaveLength(1);
    expect(expiringBroker.get("lease-3")?.state).toBe("expired");
  });

  it("rejects invalid requests", () => {
    const broker = new InMemorySecretsBroker();

    expect(() =>
      broker.issue({
        tenantId: "",
        toolName: "browser",
        runId: "run-1",
        secretName: "api-key",
        requestedBy: "user-1",
        ttlMs: 60_000,
      }),
    ).toThrow();

    expect(() =>
      broker.issue({
        tenantId: "tenant-alpha",
        toolName: "browser",
        runId: "run-1",
        secretName: "api-key",
        requestedBy: "user-1",
        ttlMs: 0,
      }),
    ).toThrow();

    expect(() => broker.revoke("missing")).toThrow(/not found/i);
  });
});
