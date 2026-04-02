import {
  PolicyDecisionSchema,
  PolicyInputSchema,
  type PolicyAction,
  type PolicyDecision,
  type PolicyInput,
  type Role,
  type TaskSensitivity,
} from "@self-agent/contracts";

export type PolicyEffect = "allow" | "deny" | "require_approval";

export type PolicyRule = {
  id: string;
  description: string;
  effect: PolicyEffect;
  priority: number;
  matches: (input: PolicyInput) => boolean;
  reason: string;
};

export type PolicyEngine = {
  rules: readonly PolicyRule[];
  evaluate: (input: PolicyInput) => PolicyDecision;
};

type RuleOptions = {
  id: string;
  description: string;
  priority?: number;
  reason: string;
};

const asSet = <T extends string>(values: readonly T[]) => new Set(values);

const matchesAny = <T extends string>(expected: readonly T[], actual?: readonly T[]) => {
  if (expected.length === 0) {
    return true;
  }

  if (!actual || actual.length === 0) {
    return false;
  }

  const actualSet = asSet(actual);
  return expected.some((value) => actualSet.has(value));
};

const matchesTargetKind = (
  kinds: readonly PolicyInput["target"]["kind"][],
  input: PolicyInput,
) => kinds.length === 0 || kinds.includes(input.target.kind);

const normalize = (input: PolicyInput): PolicyInput => PolicyInputSchema.parse(input);

export const createRule = (
  effect: PolicyEffect,
  options: RuleOptions,
  matches: (input: PolicyInput) => boolean,
): PolicyRule => ({
  id: options.id,
  description: options.description,
  effect,
  priority: options.priority ?? 0,
  reason: options.reason,
  matches,
});

export const allowRoles = (options: RuleOptions & {
  roles: readonly Role[];
  actions?: readonly PolicyAction[];
  targetKinds?: readonly PolicyInput["target"]["kind"][];
}) =>
  createRule("allow", options, (input) => {
    const actionMatch = matchesAny(options.actions ?? [], [input.action]);
    const roleMatch = matchesAny(options.roles, input.actor.roles);
    const targetMatch = matchesTargetKind(options.targetKinds ?? [], input);
    return actionMatch && roleMatch && targetMatch;
  });

export const denyTargets = (options: RuleOptions & {
  actions?: readonly PolicyAction[];
  targetKinds?: readonly PolicyInput["target"]["kind"][];
  targetNames?: readonly string[];
}) =>
  createRule("deny", options, (input) => {
    const actionMatch = matchesAny(options.actions ?? [], [input.action]);
    const targetKindMatch = matchesTargetKind(options.targetKinds ?? [], input);
    let targetNameMatch = true;

    if (options.targetNames && options.targetNames.length > 0) {
      switch (input.target.kind) {
        case "tool":
          targetNameMatch = options.targetNames.includes(input.target.toolName);
          break;
        case "domain":
          targetNameMatch = options.targetNames.includes(input.target.domain);
          break;
        case "file": {
          const filePath = input.target.path;
          targetNameMatch = options.targetNames.some((name) => filePath.startsWith(name));
          break;
        }
        default:
          targetNameMatch = false;
          break;
      }
    }

    return actionMatch && targetKindMatch && targetNameMatch;
  });

export const requireApprovalForSensitivity = (options: RuleOptions & {
  sensitivities: readonly TaskSensitivity[];
  actions?: readonly PolicyAction[];
  targetKinds?: readonly PolicyInput["target"]["kind"][];
}) =>
  createRule("require_approval", options, (input) => {
    const actionMatch = matchesAny(options.actions ?? [], [input.action]);
    const targetMatch = matchesTargetKind(options.targetKinds ?? [], input);
    const sensitivityMatch = options.sensitivities.includes(
      input.context.taskSensitivity ?? "medium",
    );
    return actionMatch && targetMatch && sensitivityMatch;
  });

export const createPolicyEngine = (rules: readonly PolicyRule[] = []): PolicyEngine => {
  const ordered = [...rules].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    rules: ordered,
    evaluate(input: PolicyInput) {
      const normalized = normalize(input);
      const matched = ordered.find((rule) => rule.matches(normalized));

      if (!matched) {
        return PolicyDecisionSchema.parse({
          decision: "deny",
          reason: "Default deny: no policy rule matched.",
          matchedRuleIds: [],
          metadata: {},
        });
      }

      return PolicyDecisionSchema.parse({
        decision: matched.effect,
        reason: matched.reason,
        matchedRuleIds: [matched.id],
        metadata: {
          ruleDescription: matched.description,
          rulePriority: matched.priority,
        },
      });
    },
  };
};

export const createDefaultPolicyEngine = () =>
  createPolicyEngine([
    denyTargets({
      id: "deny-secrets",
      description: "Deny direct secret access by default.",
      priority: 100,
      reason: "Secret access requires an explicit elevated policy.",
      targetKinds: ["secret"],
    }),
    requireApprovalForSensitivity({
      id: "approval-high-sensitivity",
      description: "High-sensitivity actions require approval.",
      priority: 90,
      reason: "High-sensitivity work requires explicit approval.",
      sensitivities: ["high"],
      actions: ["write", "delete", "execute", "network", "approve"],
    }),
    allowRoles({
      id: "allow-viewers-read",
      description: "Allow read-only actions for viewer and above.",
      priority: 10,
      reason: "Read-only access is permitted for operational visibility.",
      roles: ["viewer", "member", "operator", "approver", "admin", "owner"],
      actions: ["read"],
    }),
    allowRoles({
      id: "allow-operators-browser-read",
      description: "Allow operators to read approved browser and file targets.",
      priority: 20,
      reason: "Operator read access on approved targets is permitted.",
      roles: ["operator", "approver", "admin", "owner"],
      actions: ["read"],
      targetKinds: ["tool", "file", "domain", "task", "run", "step"],
    }),
    allowRoles({
      id: "allow-admin-approve",
      description: "Allow approvers and admins to approve pending actions.",
      priority: 30,
      reason: "Approval-capable roles may resolve gated actions.",
      roles: ["approver", "admin", "owner"],
      actions: ["approve"],
    }),
  ]);

export const evaluatePolicy = (
  input: PolicyInput,
  rules: readonly PolicyRule[] = [],
): PolicyDecision => createPolicyEngine(rules).evaluate(input);
