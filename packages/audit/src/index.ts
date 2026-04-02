import { randomUUID } from "node:crypto";

import {
  AuditEventSchema,
  type AuditEvent,
  type AuditEventType,
  type Metadata,
  createTimestamp,
} from "@self-agent/contracts";

export type AuditEventInput = {
  tenantId: string;
  eventType: AuditEventType;
  actorSubjectId?: string;
  occurredAt?: string | Date;
  runId?: string;
  stepId?: string;
  targetKind?: string;
  targetId?: string;
  payload?: Metadata;
};

export type AuditListFilter = {
  tenantId?: string;
  runId?: string;
  stepId?: string;
};

export type AuditRecorder = {
  record: (input: AuditEventInput) => AuditEvent;
  list: (filter?: AuditListFilter) => AuditEvent[];
};

const cloneEvent = (event: AuditEvent): AuditEvent =>
  AuditEventSchema.parse({
    ...event,
    payload: { ...event.payload },
  });

export const createAuditEvent = (input: AuditEventInput): AuditEvent =>
  AuditEventSchema.parse({
    id: randomUUID(),
    tenantId: input.tenantId,
    actorSubjectId: input.actorSubjectId,
    eventType: input.eventType,
    occurredAt: createTimestamp(input.occurredAt ?? new Date()),
    runId: input.runId,
    stepId: input.stepId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    payload: input.payload ?? {},
  });

export class InMemoryAuditRecorder implements AuditRecorder {
  private readonly events: AuditEvent[] = [];

  record(input: AuditEventInput): AuditEvent {
    const event = createAuditEvent(input);
    this.events.push(event);
    return cloneEvent(event);
  }

  list(filter: AuditListFilter = {}): AuditEvent[] {
    return this.events
      .filter((event) => {
        if (filter.tenantId && event.tenantId !== filter.tenantId) {
          return false;
        }

        if (filter.runId && event.runId !== filter.runId) {
          return false;
        }

        if (filter.stepId && event.stepId !== filter.stepId) {
          return false;
        }

        return true;
      })
      .map(cloneEvent);
  }
}

export const createAuditRecorder = (): AuditRecorder => new InMemoryAuditRecorder();
