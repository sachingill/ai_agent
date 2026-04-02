import { describe, expect, it } from "vitest";

import {
  buildPermissionCheck,
  canApproveRun,
  canCreateTask,
  canRequestSecret,
  canUseConnector,
  createMembership,
  createPrincipal,
  createSessionContext,
  hasMinimumRole,
  issueSessionMetadata,
  principalCanPerform,
  revokeSession,
  sessionHasPermission,
  validateSession,
} from "./index.js";

describe("auth foundation", () => {
  const membership = createMembership({
    tenantId: "tenant-1",
    userId: "user-1",
    role: "operator",
    joinedAt: "2026-04-02T00:00:00.000Z",
  });

  const principal = createPrincipal(membership);

  it("recognizes role hierarchy", () => {
    expect(hasMinimumRole("owner", "reviewer")).toBe(true);
    expect(hasMinimumRole("viewer", "operator")).toBe(false);
  });

  it("derives principal permissions from role and membership", () => {
    expect(canCreateTask(principal)).toBe(true);
    expect(canApproveRun(principal)).toBe(false);
    expect(canRequestSecret(principal)).toBe(false);
    expect(canUseConnector(principal)).toBe(true);
    expect(principalCanPerform(principal, "run:execute")).toBe(true);
  });

  it("builds scoped session metadata and validates live sessions", () => {
    const metadata = issueSessionMetadata({
      sessionId: "session-1",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator",
      authMethod: "sso",
      issuer: "https://auth.example.test",
      audience: "self-agent",
      scopes: ["task:create", "run:execute"],
      ttlMs: 60_000,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    const session = createSessionContext(metadata, principal);
    const result = validateSession(session, new Date("2026-04-02T00:00:30.000Z"));

    expect(result.valid).toBe(true);
    expect(result.session?.metadata.sessionId).toBe("session-1");
    expect(sessionHasPermission(session, "task:create")).toBe(true);
    expect(sessionHasPermission(session, "approval:grant")).toBe(false);
  });

  it("rejects expired or revoked sessions", () => {
    const metadata = issueSessionMetadata({
      sessionId: "session-2",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator",
      authMethod: "mfa",
      issuer: "https://auth.example.test",
      audience: "self-agent",
      ttlMs: 1_000,
      now: new Date("2026-04-02T00:00:00.000Z"),
    });

    const session = createSessionContext(metadata, principal);
    const expired = validateSession(session, new Date("2026-04-02T00:00:02.000Z"));

    expect(expired.valid).toBe(false);
    expect(expired.reason).toBe("expired");

    const revoked = validateSession(revokeSession(session), new Date("2026-04-02T00:00:00.500Z"));
    expect(revoked.valid).toBe(false);
    expect(revoked.reason).toBe("inactive");
  });

  it("exposes permission checks for downstream policy enforcement", () => {
    const check = buildPermissionCheck(principal, "run:execute");
    expect(check).toEqual({
      permission: "run:execute",
      tenantId: "tenant-1",
      userId: "user-1",
      role: "operator",
    });
  });
});
