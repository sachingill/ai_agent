import { randomUUID } from "node:crypto";

import { z } from "zod";

export const SecretLeaseStateValues = ["active", "revoked", "expired"] as const;
export const SecretLeaseStateSchema = z.enum(SecretLeaseStateValues);
export type SecretLeaseState = z.infer<typeof SecretLeaseStateSchema>;

export const SecretLeaseRequestSchema = z.object({
  tenantId: z.string().min(1),
  toolName: z.string().min(1),
  runId: z.string().min(1),
  secretName: z.string().min(1),
  requestedBy: z.string().min(1),
  ttlMs: z.number().int().positive(),
  scopes: z.array(z.string().min(1)).default([]),
  now: z.date().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type SecretLeaseRequestInput = z.input<typeof SecretLeaseRequestSchema>;
export type SecretLeaseRequest = z.infer<typeof SecretLeaseRequestSchema>;

export const SecretLeaseRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  toolName: z.string().min(1),
  runId: z.string().min(1),
  secretName: z.string().min(1),
  requestedBy: z.string().min(1),
  scopes: z.array(z.string().min(1)),
  issuedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  state: SecretLeaseStateSchema,
  revokedAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.string(), z.unknown()),
});
export type SecretLeaseRecord = z.infer<typeof SecretLeaseRecordSchema>;

export type SecretLeaseListFilter = {
  tenantId?: string;
  toolName?: string;
  runId?: string;
  secretName?: string;
  state?: SecretLeaseState;
};

export type SecretLeaseIssueOptions = {
  idFactory?: () => string;
  now?: Date;
};

export type SecretLeaseRevokeOptions = {
  now?: Date;
};

export type SecretLeaseExpireOptions = {
  now?: Date;
};

export class SecretLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretLeaseError";
  }
}

const toIso = (value: Date): string => value.toISOString();

const cloneLease = (lease: SecretLeaseRecord): SecretLeaseRecord =>
  SecretLeaseRecordSchema.parse({
    ...lease,
    scopes: [...lease.scopes],
    metadata: { ...lease.metadata },
  });

export class InMemorySecretsBroker {
  private readonly leases = new Map<string, SecretLeaseRecord>();

  issue(request: SecretLeaseRequestInput, options: SecretLeaseIssueOptions = {}): SecretLeaseRecord {
    const parsed = SecretLeaseRequestSchema.parse(request);
    const now = options.now ?? parsed.now ?? new Date();
    const issuedAt = toIso(now);
    const expiresAt = toIso(new Date(now.getTime() + parsed.ttlMs));

    const lease: SecretLeaseRecord = SecretLeaseRecordSchema.parse({
      id: options.idFactory?.() ?? randomUUID(),
      tenantId: parsed.tenantId,
      toolName: parsed.toolName,
      runId: parsed.runId,
      secretName: parsed.secretName,
      requestedBy: parsed.requestedBy,
      scopes: parsed.scopes,
      issuedAt,
      expiresAt,
      state: "active",
      metadata: parsed.metadata,
    });

    this.leases.set(lease.id, lease);
    return cloneLease(lease);
  }

  get(id: string, options: SecretLeaseExpireOptions = {}): SecretLeaseRecord | null {
    this.expire(options.now);
    const lease = this.leases.get(id);
    return lease ? cloneLease(lease) : null;
  }

  list(filter: SecretLeaseListFilter = {}, options: SecretLeaseExpireOptions = {}): SecretLeaseRecord[] {
    this.expire(options.now);

    return [...this.leases.values()]
      .filter((lease) => {
        if (filter.tenantId && lease.tenantId !== filter.tenantId) {
          return false;
        }
        if (filter.toolName && lease.toolName !== filter.toolName) {
          return false;
        }
        if (filter.runId && lease.runId !== filter.runId) {
          return false;
        }
        if (filter.secretName && lease.secretName !== filter.secretName) {
          return false;
        }
        if (filter.state && lease.state !== filter.state) {
          return false;
        }
        return true;
      })
      .map(cloneLease);
  }

  revoke(id: string, options: SecretLeaseRevokeOptions = {}): SecretLeaseRecord {
    this.expire(options.now);
    const current = this.leases.get(id);

    if (!current) {
      throw new SecretLeaseError(`Secret lease not found: ${id}`);
    }
    if (current.state === "revoked") {
      throw new SecretLeaseError(`Secret lease already revoked: ${id}`);
    }

    const now = options.now ?? new Date();
    const revoked: SecretLeaseRecord = SecretLeaseRecordSchema.parse({
      ...current,
      state: "revoked",
      revokedAt: toIso(now),
    });

    this.leases.set(id, revoked);
    return cloneLease(revoked);
  }

  expire(now: Date = new Date()): SecretLeaseRecord[] {
    const expired: SecretLeaseRecord[] = [];

    for (const [id, lease] of this.leases.entries()) {
      if (lease.state !== "active") {
        continue;
      }

      if (Date.parse(lease.expiresAt) <= now.getTime()) {
        const next: SecretLeaseRecord = SecretLeaseRecordSchema.parse({
          ...lease,
          state: "expired",
        });

        this.leases.set(id, next);
        expired.push(cloneLease(next));
      }
    }

    return expired;
  }
}

export const createSecretsBroker = () => new InMemorySecretsBroker();
