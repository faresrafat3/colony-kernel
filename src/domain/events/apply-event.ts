/**
 * applyEvent — deterministic, side-effect-free event reduction (N2).
 * Every rejection is a structured KernelError with NO state mutation.
 * Validation order is fail-closed and cheap checks come first.
 */
import { KernelError } from "../errors/kernel-error.js";
import { canonicalJson } from "../canonical/jcs.js";
import { sha256Hex } from "../support/sha256.js";
import { EventType as ET, PUBLIC_ACTION_EVENT_TYPES } from "./vocabulary.js";
import type { EventEnvelope } from "./envelope.js";
import type { MissionState } from "../mission/mission-state.js";
import { COUNTER_LIMITS } from "../mission/stages.js";
import { decideTransition } from "../mission/state-machine.js";

const SUPPORTED_EVENT_SCHEMA_VERSION = 1;

export function canonicalPayloadHash(payload: Record<string, unknown>): string {
  return sha256Hex(canonicalJson(payload));
}

/**
 * Validate envelope integrity (schema version, closed vocabulary, mission,
 * sequence, state version, payload hash). Returns the decision when the event
 * is structurally appliable; throws otherwise.
 */
export function validateEnvelope(state: MissionState, event: EventEnvelope): void {
  if (event.schemaVersion !== SUPPORTED_EVENT_SCHEMA_VERSION) {
    throw new KernelError("UNSUPPORTED_SCHEMA_VERSION", `event schemaVersion ${String(event.schemaVersion)} unsupported`, {
      schemaVersion: event.schemaVersion,
      eventType: event.eventType,
    });
  }
  if (PUBLIC_ACTION_EVENT_TYPES.has(event.eventType) || event.eventType.startsWith("PUBLIC_ACTION_")) {
    throw new KernelError("PUBLICATION_DISABLED", `event type ${event.eventType} is disabled in v0.1.1`, {});
  }
  if (!(Object.values(ET) as string[]).includes(event.eventType)) {
    throw new KernelError("INVALID_SCHEMA", `unknown event type ${String(event.eventType)}`, {});
  }
  if (event.missionId !== state.missionId) {
    throw new KernelError("INVALID_EVENT", `event ${event.eventId} belongs to mission ${event.missionId}, not ${state.missionId}`, {
      eventMissionId: event.missionId,
    });
  }
  if (event.missionSequence !== state.missionSequence + 1) {
    throw new KernelError("SEQUENCE_CONFLICT", `expected missionSequence ${state.missionSequence + 1}, got ${event.missionSequence}`, {
      expected: state.missionSequence + 1,
      actual: event.missionSequence,
    });
  }
  if (event.expectedStateVersion !== state.stateVersion) {
    throw new KernelError("CONCURRENCY_CONFLICT", `expectedStateVersion ${event.expectedStateVersion} ≠ current ${state.stateVersion}`, {
      expected: event.expectedStateVersion,
      actual: state.stateVersion,
    });
  }
  const actualHash = canonicalPayloadHash(event.payload);
  if (event.payloadSha256 !== actualHash) {
    throw new KernelError("INVALID_SCHEMA", "payloadSha256 mismatch over canonical payload", {
      expected: event.payloadSha256,
      actual: actualHash,
    });
  }
}

/** Fully validate + reduce one event into the next state. Pure. */
export function applyEvent(state: MissionState, event: EventEnvelope): MissionState {
  validateEnvelope(state, event);

  // Creation: MISSION_CREATED applies only to the pristine (never-reduced) state.
  if (event.eventType === ET.MISSION_CREATED) {
    if (state.missionSequence !== 0 || state.stateVersion !== 0 || state.stage !== "CREATED") {
      throw new KernelError("ILLEGAL_TRANSITION", "MISSION_CREATED applies only to a fresh mission", {});
    }
    return advance(state, event, "CREATED");
  }

  const decision = decideTransition(state, event.eventType, event.payload);
  let next = advance(state, event, decision.toStage);

  if (decision.consumesCounter !== null) {
    const limit = COUNTER_LIMITS[decision.consumesCounter];
    const current = next.counters[decision.consumesCounter];
    if (current === undefined || current >= limit) {
      throw new KernelError("REVISION_LIMIT_EXCEEDED", `counter ${decision.consumesCounter} exhausted`, {});
    }
    next = {
      ...next,
      counters: { ...next.counters, [decision.consumesCounter]: current + 1 },
    };
  }

  const from = state.stage;
  const to = next.stage;
  const isPause = (st: MissionState["stage"]): boolean =>
    st === "HUMAN_REVIEW_REQUIRED" || st === "RECONCILIATION_REQUIRED";
  // Pause entry records the pre-pause stage for the recovery exit.
  if (isPause(to) && !isPause(from)) {
    next = { ...next, resumeStage: from };
  }
  // Pause exit clears the recorded pre-pause stage.
  if (isPause(from) && !isPause(to)) {
    next = { ...next, resumeStage: null };
  }
  // Revision entry records the returning stage (E19 target); re-entries keep it.
  if (to === "REVISION" && from !== "REVISION") {
    next = { ...next, resumeStage: from };
  }

  // Subject binding updates carried by payload (plan/candidate/verification).
  const bind = event.payload["bindSubjectSha256"];
  if (typeof bind === "string") {
    const slot = event.payload["bindSlot"];
    if (slot === "plan") next = { ...next, boundPlanSha256: bind };
    else if (slot === "candidate") next = { ...next, boundCandidateSha256: bind };
    else if (slot === "verification") next = { ...next, boundVerificationSha256: bind };
  }

  return next;
}

/** One accepted event: sequence +1, stateVersion exactly +1, timestamps updated. */
function advance(state: MissionState, event: EventEnvelope, toStage: MissionState["stage"]): MissionState {
  return {
    ...state,
    stage: toStage,
    stateVersion: state.stateVersion + 1,
    missionSequence: state.missionSequence + 1,
    updatedAt: event.occurredAt,
  };
}

/** Fold a full event stream from empty — recovery/replay path (A24). */
export function reduceAll(
  initialState: MissionState,
  events: readonly EventEnvelope[],
): MissionState {
  let state = initialState;
  for (const event of events) {
    state = applyEvent(state, event);
  }
  return state;
}
