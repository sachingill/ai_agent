import { z } from "zod";

export const tenantRoleValues = [
  "owner",
  "admin",
  "operator",
  "reviewer",
  "viewer",
] as const;

export type TenantRole = (typeof tenantRoleValues)[number];

export const tenantRoleSchema = z.enum(tenantRoleValues);

export const permissionKindValues = [
  "tenant:read",
  "tenant:write",
  "task:create",
  "task:read",
  "task:update",
  "task:cancel",
  "run:create",
  "run:read",
  "run:execute",
  "approval:grant",
  "policy:read",
  "policy:write",
  "secret:request",
  "connector:use",
] as const;

export type PermissionKind = (typeof permissionKindValues)[number];

export const permissionKindSchema = z.enum(permissionKindValues);

export const authMethodValues = [
  "password",
  "sso",
  "api-key",
  "service-account",
  "mfa",
] as const;

export type AuthMethod = (typeof authMethodValues)[number];

export const authMethodSchema = z.enum(authMethodValues);

const timestampSchema = z.string().datetime({ offset: true });

export const nonEmptyStringSchema = z.string().trim().min(1);

export const tenantIdSchema = nonEmptyStringSchema;
export const userIdSchema = nonEmptyStringSchema;
export const sessionIdSchema = nonEmptyStringSchema;

export type TenantId = z.infer<typeof tenantIdSchema>;
export type UserId = z.infer<typeof userIdSchema>;
export type SessionId = z.infer<typeof sessionIdSchema>;

export interface TenantMembership {
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  joinedAt: string;
  revokedAt: string | null;
  isActive: boolean;
}

export const tenantMembershipSchema = z
  .object({
    tenantId: tenantIdSchema,
    userId: userIdSchema,
    role: tenantRoleSchema,
    joinedAt: timestampSchema,
    revokedAt: timestampSchema.nullable().default(null),
    isActive: z.boolean(),
  })
  .strict();

export interface AuthPrincipal {
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  membership: TenantMembership;
}

export const authPrincipalSchema = z
  .object({
    tenantId: tenantIdSchema,
    userId: userIdSchema,
    role: tenantRoleSchema,
    membership: tenantMembershipSchema,
  })
  .strict();

export interface SessionIssuanceMetadata {
  sessionId: SessionId;
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  authMethod: AuthMethod;
  issuedAt: string;
  expiresAt: string;
  issuer: string;
  audience: string;
  scopes: PermissionKind[];
  ipAddress: string | null;
  userAgent: string | null;
  jti: string | null;
}

export const sessionIssuanceMetadataSchema = z
  .object({
    sessionId: sessionIdSchema,
    tenantId: tenantIdSchema,
    userId: userIdSchema,
    role: tenantRoleSchema,
    authMethod: authMethodSchema,
    issuedAt: timestampSchema,
    expiresAt: timestampSchema,
    issuer: nonEmptyStringSchema,
    audience: nonEmptyStringSchema,
    scopes: z.array(permissionKindSchema).default([]),
    ipAddress: z.string().min(1).nullable().default(null),
    userAgent: z.string().min(1).nullable().default(null),
    jti: z.string().min(1).nullable().default(null),
  })
  .strict();

export interface SessionContext {
  metadata: SessionIssuanceMetadata;
  principal: AuthPrincipal;
  issuedAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
  active: boolean;
}

export const sessionContextSchema = z
  .object({
    metadata: sessionIssuanceMetadataSchema,
    principal: authPrincipalSchema,
    issuedAtMs: z.number().int().nonnegative(),
    expiresAtMs: z.number().int().nonnegative(),
    revokedAtMs: z.number().int().nonnegative().nullable().default(null),
    active: z.boolean(),
  })
  .strict();

export interface PermissionCheck {
  permission: PermissionKind;
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
}

export const permissionCheckSchema = z
  .object({
    permission: permissionKindSchema,
    tenantId: tenantIdSchema,
    userId: userIdSchema,
    role: tenantRoleSchema,
  })
  .strict();

export interface SessionValidationResult {
  valid: boolean;
  reason: "expired" | "revoked" | "inactive" | "mismatched-tenant" | "mismatched-user" | "invalid-principal" | null;
  session?: SessionContext;
}

export const sessionValidationResultSchema = z
  .object({
    valid: z.boolean(),
    reason: z.enum([
      "expired",
      "revoked",
      "inactive",
      "mismatched-tenant",
      "mismatched-user",
      "invalid-principal",
    ]).nullable().default(null),
    session: sessionContextSchema.optional(),
  })
  .strict();

const roleRank: Record<TenantRole, number> = {
  owner: 5,
  admin: 4,
  operator: 3,
  reviewer: 2,
  viewer: 1,
};

const rolePermissions: Record<TenantRole, PermissionKind[]> = {
  owner: [
    "tenant:read",
    "tenant:write",
    "task:create",
    "task:read",
    "task:update",
    "task:cancel",
    "run:create",
    "run:read",
    "run:execute",
    "approval:grant",
    "policy:read",
    "policy:write",
    "secret:request",
    "connector:use",
  ],
  admin: [
    "tenant:read",
    "tenant:write",
    "task:create",
    "task:read",
    "task:update",
    "task:cancel",
    "run:create",
    "run:read",
    "run:execute",
    "approval:grant",
    "policy:read",
    "policy:write",
    "secret:request",
    "connector:use",
  ],
  operator: [
    "tenant:read",
    "task:create",
    "task:read",
    "task:update",
    "task:cancel",
    "run:create",
    "run:read",
    "run:execute",
    "connector:use",
  ],
  reviewer: [
    "tenant:read",
    "task:read",
    "run:read",
    "approval:grant",
    "policy:read",
  ],
  viewer: [
    "tenant:read",
    "task:read",
    "run:read",
    "policy:read",
  ],
};

export function createMembership(input: {
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  joinedAt?: string;
  revokedAt?: string | null;
  isActive?: boolean;
}): TenantMembership {
  return tenantMembershipSchema.parse({
    tenantId: input.tenantId,
    userId: input.userId,
    role: input.role,
    joinedAt: input.joinedAt ?? new Date().toISOString(),
    revokedAt: input.revokedAt ?? null,
    isActive: input.isActive ?? true,
  });
}

export function createPrincipal(membership: TenantMembership): AuthPrincipal {
  if (!isActiveMembership(membership)) {
    throw new Error("membership is inactive");
  }

  return authPrincipalSchema.parse({
    tenantId: membership.tenantId,
    userId: membership.userId,
    role: membership.role,
    membership,
  });
}

export function hasMinimumRole(role: TenantRole, minimum: TenantRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}

export function isActiveMembership(membership: TenantMembership): boolean {
  return membership.isActive && membership.revokedAt == null;
}

export function canRolePerform(role: TenantRole, permission: PermissionKind): boolean {
  return rolePermissions[role].includes(permission);
}

export function principalCanPerform(principal: AuthPrincipal, permission: PermissionKind): boolean {
  return isActiveMembership(principal.membership) && canRolePerform(principal.role, permission);
}

export function sessionHasPermission(session: SessionContext, permission: PermissionKind): boolean {
  return session.active && principalCanPerform(session.principal, permission) && session.metadata.scopes.includes(permission);
}

export function issueSessionMetadata(input: {
  sessionId: SessionId;
  tenantId: TenantId;
  userId: UserId;
  role: TenantRole;
  authMethod: AuthMethod;
  issuer: string;
  audience: string;
  scopes?: PermissionKind[];
  ttlMs: number;
  now?: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  jti?: string | null;
}): SessionIssuanceMetadata {
  if (input.ttlMs <= 0) {
    throw new Error("ttlMs must be positive");
  }

  const now = input.now ?? new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + input.ttlMs).toISOString();

  return sessionIssuanceMetadataSchema.parse({
    sessionId: input.sessionId,
    tenantId: input.tenantId,
    userId: input.userId,
    role: input.role,
    authMethod: input.authMethod,
    issuedAt,
    expiresAt,
    issuer: input.issuer,
    audience: input.audience,
    scopes: input.scopes ?? [],
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    jti: input.jti ?? null,
  });
}

export function createSessionContext(metadata: SessionIssuanceMetadata, principal: AuthPrincipal): SessionContext {
  if (metadata.tenantId !== principal.tenantId || metadata.userId !== principal.userId || metadata.role !== principal.role) {
    throw new Error("metadata principal mismatch");
  }

  const issuedAtMs = Date.parse(metadata.issuedAt);
  const expiresAtMs = Date.parse(metadata.expiresAt);

  if (Number.isNaN(issuedAtMs) || Number.isNaN(expiresAtMs)) {
    throw new Error("invalid session timestamps");
  }

  return sessionContextSchema.parse({
    metadata,
    principal,
    issuedAtMs,
    expiresAtMs,
    active: true,
    revokedAtMs: null,
  });
}

export function validateSession(session: SessionContext, now: Date = new Date()): SessionValidationResult {
  if (!session.active) {
    return { valid: false, reason: "inactive" };
  }

  if (!isActiveMembership(session.principal.membership)) {
    return { valid: false, reason: "revoked" };
  }

  if (session.metadata.tenantId !== session.principal.tenantId) {
    return { valid: false, reason: "mismatched-tenant" };
  }

  if (session.metadata.userId !== session.principal.userId) {
    return { valid: false, reason: "mismatched-user" };
  }

  if (now.getTime() >= session.expiresAtMs) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true, reason: null, session };
}

export function revokeSession(session: SessionContext, revokedAt: Date = new Date()): SessionContext {
  return sessionContextSchema.parse({
    ...session,
    active: false,
    revokedAtMs: revokedAt.getTime(),
  });
}

export function canAccessTenant(principal: AuthPrincipal, tenantId: TenantId): boolean {
  return isActiveMembership(principal.membership) && principal.tenantId === tenantId;
}

export function canCreateTask(principal: AuthPrincipal): boolean {
  return principalCanPerform(principal, "task:create");
}

export function canApproveRun(principal: AuthPrincipal): boolean {
  return principalCanPerform(principal, "approval:grant");
}

export function canRequestSecret(principal: AuthPrincipal): boolean {
  return principalCanPerform(principal, "secret:request");
}

export function canUseConnector(principal: AuthPrincipal): boolean {
  return principalCanPerform(principal, "connector:use");
}

export function buildPermissionCheck(
  principal: AuthPrincipal,
  permission: PermissionKind,
): PermissionCheck {
  return permissionCheckSchema.parse({
    permission,
    tenantId: principal.tenantId,
    userId: principal.userId,
    role: principal.role,
  });
}

export function assertPermission(principal: AuthPrincipal, permission: PermissionKind): void {
  if (!principalCanPerform(principal, permission)) {
    throw new Error(`principal lacks permission: ${permission}`);
  }
}
