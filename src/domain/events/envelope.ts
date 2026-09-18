/** EventEnvelope — persisted type (schemaVersion 1, N2). */
import type { EventType } from "./vocabulary.js";

export type ActorType =
  | "CAPTAIN_TRANSPORT"
  | "TRUSTED_SCHEDULER"
  | "KERNEL_POLICY"
  | "RUNTIME_ADAPTER"
  | "TRUSTED_RUNNER"
  | "ADMITTED_INVOCATION";

export interface EventActor {
  actorType: ActorType;
  actorId: string;
  roleId: string | null;
  roleVersion: number | null;
}

export interface EventEnvelope<P extends Record<string, unknown> = Record<string, unknown>> {
  schemaVersion: 1;
  eventId: string;
  eventType: EventType;
  missionId: string;
  /** Per-mission monotone, starts at 1. */
  missionSequence: number;
  /** Mission state version immediately before application. */
  expectedStateVersion: number;
  actor: EventActor;
  causationId: string | null;
  correlationId: string;
  /** Scope-qualified idempotency key (unique within its scope). */
  idempotencyKey: string;
  occurredAt: string;
  recordedAt: string;
  /** Closed per-type payload. */
  payload: P;
  /** SHA-256 over the canonical (JCS) payload bytes. */
  payloadSha256: string;
}
