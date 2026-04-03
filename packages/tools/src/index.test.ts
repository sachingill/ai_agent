import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ToolInvocationValidationError,
  ToolPolicyDeniedError,
  ToolRegistrationError,
  createToolDefinition,
  createToolGateway,
  createToolManifest,
  type ToolInvocationContext,
  ToolInvocationRequestSchema,
} from "./index.js";

const context: ToolInvocationContext = {
  tenantId: "tenant-alpha",
  subjectId: "user-123",
  roles: ["operator"],
  authMethod: "service_account",
  environment: "dev",
  runId: "run-123",
  stepId: "step-1",
  taskSensitivity: "medium",
  tags: ["automation"],
  metadata: {},
};

describe("tool gateway", () => {
  it("registers tools and invokes them through policy approval", async () => {
    const gateway = createToolGateway({
      evaluatePolicy: () => ({
        decision: "allow",
        reason: "Tool access approved.",
        matchedRuleIds: ["rule-1"],
        metadata: {},
      }),
      redactOutput: (output) =>
        ({
          ...(output as Record<string, unknown>),
          secret: "[redacted]",
        }) as typeof output,
    });

    gateway.register(
      createToolDefinition({
        manifest: createToolManifest({
          name: "browser.read",
          description: "Read content from approved browser targets.",
          risk: "low",
          allowedTargets: [{ kind: "domain", domain: "example.com" }],
          inputSchema: z.object({
            url: z.string().url(),
          }),
          outputSchema: z.object({
            title: z.string(),
            secret: z.string(),
          }),
          redactKeys: ["secret"],
        }),
        inputSchema: z.object({
          url: z.string().url(),
        }),
        outputSchema: z.object({
          title: z.string(),
          secret: z.string(),
        }),
        handler: async ({ input }) => ({
          title: `Read ${input.url}`,
          secret: "token-123",
        }),
      }),
    );

    const result = await gateway.invoke("browser.read", {
      target: { kind: "tool", toolName: "browser.read" },
      input: { url: "https://example.com" },
      context,
    });

    expect(result.manifest.name).toBe("browser.read");
    expect(result.policyDecision.decision).toBe("allow");
    expect(result.output).toEqual({
      title: "Read https://example.com",
      secret: "[redacted]",
    });
  });

  it("rejects duplicate registrations and invalid invocation input", async () => {
    const gateway = createToolGateway({
      evaluatePolicy: () => ({
        decision: "allow",
        reason: "approved",
        matchedRuleIds: ["rule-1"],
        metadata: {},
      }),
    });

    const definition = createToolDefinition({
      manifest: {
        name: "shell.exec",
        description: "Run approved shell commands.",
        risk: "high",
        inputSchema: z.object({
          command: z.string().min(1),
        }),
        outputSchema: z.object({
          stdout: z.string(),
        }),
      },
      inputSchema: z.object({
        command: z.string().min(1),
      }),
      outputSchema: z.object({
        stdout: z.string(),
      }),
      handler: async () => ({
        stdout: "ok",
      }),
    });

    gateway.register(definition);

    expect(() => gateway.register(definition)).toThrow(ToolRegistrationError);

    await expect(
      gateway.invoke("shell.exec", {
        target: { kind: "tool", toolName: "shell.exec" },
        input: { command: "" },
        context,
      }),
    ).rejects.toBeInstanceOf(ToolInvocationValidationError);
  });

  it("denies invocation when policy blocks the tool", async () => {
    const gateway = createToolGateway({
      evaluatePolicy: () => ({
        decision: "deny",
        reason: "Tool execution is not allowed.",
        matchedRuleIds: ["deny-all"],
        metadata: {},
      }),
    });

    gateway.register(
      createToolDefinition({
        manifest: {
          name: "browser.read",
          description: "Read content from approved browser targets.",
          risk: "low",
          inputSchema: z.object({
            url: z.string().url(),
          }),
          outputSchema: z.object({
            title: z.string(),
          }),
        },
        inputSchema: z.object({
          url: z.string().url(),
        }),
        outputSchema: z.object({
          title: z.string(),
        }),
        handler: async () => ({
          title: "should not execute",
        }),
      }),
    );

    await expect(
      gateway.invoke("browser.read", {
        target: { kind: "tool", toolName: "browser.read" },
        input: { url: "https://example.com" },
        context,
      }),
    ).rejects.toBeInstanceOf(ToolPolicyDeniedError);
  });

  it("rejects targets outside the tool manifest scope", async () => {
    const gateway = createToolGateway({
      evaluatePolicy: () => ({
        decision: "allow",
        reason: "approved",
        matchedRuleIds: ["rule-1"],
        metadata: {},
      }),
    });

    gateway.register(
      createToolDefinition({
        manifest: {
          name: "browser.read",
          description: "Read content from approved browser targets.",
          risk: "low",
          allowedTargets: [{ kind: "domain", domain: "example.com" }],
          inputSchema: z.object({
            url: z.string().url(),
          }),
          outputSchema: z.object({
            title: z.string(),
          }),
        },
        inputSchema: z.object({
          url: z.string().url(),
        }),
        outputSchema: z.object({
          title: z.string(),
        }),
        handler: async () => ({
          title: "should not execute",
        }),
      }),
    );

    await expect(
      gateway.invoke("browser.read", {
        target: { kind: "domain", domain: "example.org" },
        input: { url: "https://example.com" },
        context,
      }),
    ).rejects.toBeInstanceOf(ToolPolicyDeniedError);
  });

  it("parses invocation requests with schema-backed context and target shapes", () => {
    expect(
      ToolInvocationRequestSchema.parse({
        target: { kind: "tool", toolName: "browser.read" },
        input: { url: "https://example.com" },
        context,
      }),
    ).toBeTruthy();
  });

  it("exposes registered tool manifests", () => {
    const gateway = createToolGateway();

    gateway.register(
      createToolDefinition({
        manifest: {
          name: "doc.create",
          description: "Create a document.",
          risk: "medium",
          inputSchema: z.object({
            title: z.string(),
          }),
          outputSchema: z.object({
            id: z.string(),
          }),
        },
        inputSchema: z.object({
          title: z.string(),
        }),
        outputSchema: z.object({
          id: z.string(),
        }),
        handler: async () => ({
          id: "doc-1",
        }),
      }),
    );

    expect(gateway.list()).toEqual([
      expect.objectContaining({
        name: "doc.create",
        risk: "medium",
      }),
    ]);
  });
});
