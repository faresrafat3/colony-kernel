/**
 * Single source of truth for the v0.1.1 state machine (N10 + audit edge table
 * E01–E36). Runtime validation, the human-readable table and the Mermaid
 * diagram are all generated from these definitions. Default deny: any edge not
 * derivable from this table is illegal.
 */
import { KernelError } from "../errors/kernel-error.js";
import type { EventType } from "../events/vocabulary.js";
import { EventType as ET, PUBLIC_ACTION_EVENT_TYPES } from "../events/vocabulary.js";
import { MissionStage as S, TERMINAL_STAGES, PAUSE_STAGES, COUNTER_LIMITS } from "./stages.js";
import type { MissionStage, CounterName } from "./stages.js";
import type { MissionState } from "./mission-state.js";

export interface Edge {
  id: string;
  from: MissionStage;
  event: EventType;
  to: MissionStage;
  requiresApproval: boolean;
  /** Bounded counter consumed by traversing this edge. */
  consumesCounter?: CounterName;
  /** Narrowing predicate over (state, payload) for multi-exit event types. */
  matches?: (state: MissionState, payload: Record<string, unknown>) => boolean;
  /** Rendering label (never used for decisions). */
  guardLabel?: string;
}

/** Exit labels for guard-narrowed event types. */
const V = { allowed: "allowed", rejected: "rejected", unenforceable: "unenforceable" } as const;
const APPROVED = (_s: MissionState, payload: Record<string, unknown>): boolean => payload["decision"] === "APPROVED";
const REJECTED = (_s: MissionState, payload: Record<string, unknown>): boolean => payload["decision"] === "REJECTED";

/** The declarative edge table. Order among `matches` rows is irrelevant. */
export const EDGES: readonly Edge[] = [
  { id: "E02", from: S.CREATED, event: ET.POLICY_SCREEN_STARTED, to: S.POLICY_SCREENING, requiresApproval: false },
  { id: "E03", from: S.POLICY_SCREENING, event: ET.POLICY_SCREEN_COMPLETED, to: S.RECONNAISSANCE, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.allowed, guardLabel: `verdict=${V.allowed}` },
  { id: "E04", from: S.POLICY_SCREENING, event: ET.POLICY_SCREEN_COMPLETED, to: S.POLICY_REJECTED, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.rejected, guardLabel: `verdict=${V.rejected}` },
  { id: "E05", from: S.POLICY_SCREENING, event: ET.POLICY_SCREEN_COMPLETED, to: S.HUMAN_REVIEW_REQUIRED, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.unenforceable, guardLabel: `verdict=${V.unenforceable}` },
  { id: "E06", from: S.RECONNAISSANCE, event: ET.RECON_STARTED, to: S.RECONNAISSANCE, requiresApproval: false },
  { id: "E06b", from: S.RECONNAISSANCE, event: ET.RECON_COMPLETED, to: S.PLANNING, requiresApproval: false },
  { id: "E07", from: S.PLANNING, event: ET.PLAN_PROPOSED, to: S.CHALLENGE, requiresApproval: false },
  { id: "E08", from: S.CHALLENGE, event: ET.PLAN_CHALLENGED, to: S.AWAITING_PLAN_APPROVAL, requiresApproval: false },
  { id: "E09", from: S.CHALLENGE, event: ET.PLAN_REVISED, to: S.PLANNING, requiresApproval: false, consumesCounter: "planReworkCount" },
  { id: "E09p", from: S.PLANNING, event: ET.PLAN_REVISED, to: S.PLANNING, requiresApproval: false, consumesCounter: "planReworkCount" },
  { id: "E10", from: S.AWAITING_PLAN_APPROVAL, event: ET.APPROVAL_RECORDED, to: S.IMPLEMENTATION, requiresApproval: true, matches: (_s, p) => APPROVED(_s, p), guardLabel: "decision=APPROVED" },
  { id: "E11", from: S.AWAITING_PLAN_APPROVAL, event: ET.APPROVAL_RECORDED, to: S.PLANNING, requiresApproval: true, consumesCounter: "gateReissueCount", matches: (_s, p) => REJECTED(_s, p) && p["requestedChange"] === true, guardLabel: "rejected+request-change" },
  { id: "E12", from: S.AWAITING_PLAN_APPROVAL, event: ET.MISSION_CLOSED, to: S.CLOSED, requiresApproval: true, matches: (_s, p) => REJECTED(_s, p), guardLabel: "plan rejected" },
  { id: "E13", from: S.AWAITING_PLAN_APPROVAL, event: ET.APPROVAL_EXPIRED, to: S.HUMAN_REVIEW_REQUIRED, requiresApproval: false },
  { id: "E13b", from: S.AWAITING_PLAN_APPROVAL, event: ET.APPROVAL_REQUESTED, to: S.AWAITING_PLAN_APPROVAL, requiresApproval: false },
  { id: "E10i", from: S.IMPLEMENTATION, event: ET.IMPLEMENTATION_STARTED, to: S.IMPLEMENTATION, requiresApproval: false },
  { id: "E14b", from: S.IMPLEMENTATION, event: ET.ARTIFACT_FINALIZED, to: S.IMPLEMENTATION, requiresApproval: false },
  { id: "E14v", from: S.VERIFICATION, event: ET.ARTIFACT_FINALIZED, to: S.VERIFICATION, requiresApproval: false },
  { id: "E14", from: S.IMPLEMENTATION, event: ET.IMPLEMENTATION_COMPLETED, to: S.VERIFICATION, requiresApproval: false },
  { id: "E15", from: S.VERIFICATION, event: ET.VERIFICATION_COMPLETED, to: S.TECHNICAL_REVIEW, requiresApproval: false },
  { id: "E16", from: S.VERIFICATION, event: ET.REVISION_REQUESTED, to: S.REVISION, requiresApproval: false },
  { id: "E17", from: S.TECHNICAL_REVIEW, event: ET.TECHNICAL_REVIEW_COMPLETED, to: S.DOCUMENTATION, requiresApproval: false },
  { id: "E18", from: S.TECHNICAL_REVIEW, event: ET.REVISION_REQUESTED, to: S.REVISION, requiresApproval: false },
  { id: "E19i", from: S.REVISION, event: ET.REVISION_COMPLETED, to: S.IMPLEMENTATION, requiresApproval: false, consumesCounter: "revisionCount", matches: (s) => s.resumeStage === S.IMPLEMENTATION },
  { id: "E19v", from: S.REVISION, event: ET.REVISION_COMPLETED, to: S.VERIFICATION, requiresApproval: false, consumesCounter: "revisionCount", matches: (s) => s.resumeStage === S.VERIFICATION },
  { id: "E19t", from: S.REVISION, event: ET.REVISION_COMPLETED, to: S.TECHNICAL_REVIEW, requiresApproval: false, consumesCounter: "revisionCount", matches: (s) => s.resumeStage === S.TECHNICAL_REVIEW },
  { id: "E21", from: S.DOCUMENTATION, event: ET.DOCUMENTATION_COMPLETED, to: S.FINAL_POLICY_GATE, requiresApproval: false },
  { id: "E22", from: S.DOCUMENTATION, event: ET.REVISION_REQUESTED, to: S.REVISION, requiresApproval: false },
  { id: "E23", from: S.FINAL_POLICY_GATE, event: ET.FINAL_GATE_COMPLETED, to: S.AWAITING_PUBLISH_APPROVAL, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.allowed, guardLabel: `verdict=${V.allowed}` },
  { id: "E24", from: S.FINAL_POLICY_GATE, event: ET.FINAL_GATE_COMPLETED, to: S.POLICY_REJECTED, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.rejected, guardLabel: `verdict=${V.rejected}` },
  { id: "E25", from: S.FINAL_POLICY_GATE, event: ET.FINAL_GATE_COMPLETED, to: S.HUMAN_REVIEW_REQUIRED, requiresApproval: false, matches: (_s, p) => p["verdict"] === V.unenforceable, guardLabel: `verdict=${V.unenforceable}` },
  { id: "E26", from: S.AWAITING_PUBLISH_APPROVAL, event: ET.APPROVAL_RECORDED, to: S.READY_TO_PUBLISH, requiresApproval: true, matches: (_s, p) => APPROVED(_s, p), guardLabel: "decision=APPROVED" },
  { id: "E28", from: S.AWAITING_PUBLISH_APPROVAL, event: ET.APPROVAL_RECORDED, to: S.REVISION, requiresApproval: true, consumesCounter: "textOnlyPackageReworkCount", matches: (_s, p) => REJECTED(_s, p) && p["requestedChange"] === true, guardLabel: "rejected+request-change" },
  { id: "E27", from: S.AWAITING_PUBLISH_APPROVAL, event: ET.MISSION_CLOSED, to: S.CLOSED, requiresApproval: true, matches: (_s, p) => REJECTED(_s, p), guardLabel: "package rejected" },
  { id: "E29", from: S.AWAITING_PUBLISH_APPROVAL, event: ET.APPROVAL_EXPIRED, to: S.HUMAN_REVIEW_REQUIRED, requiresApproval: false },
  { id: "E26b", from: S.AWAITING_PUBLISH_APPROVAL, event: ET.APPROVAL_REQUESTED, to: S.AWAITING_PUBLISH_APPROVAL, requiresApproval: false },
  { id: "E30", from: S.READY_TO_PUBLISH, event: ET.MISSION_CLOSED, to: S.CLOSED, requiresApproval: true },
  { id: "E31", from: S.CREATED, event: ET.MISSION_ABORTED, to: S.ABORTED, requiresApproval: false },
];

/**
 * Stage-agnostic legality for nonterminal stages. Pause states reject these
 * (pause states execute no automatic work): from a pause only the pause-exit
 * block below applies.
 */
const NONTERMINAL_COMMON: readonly { event: EventType; to: MissionStage | "SELF"; consumesCounter?: CounterName; requiresApproval?: boolean }[] = [
  { event: ET.MISSION_ABORTED, to: S.ABORTED },
  { event: ET.MISSION_FAILED, to: S.FAILED },
  { event: ET.CHECKPOINT_WRITTEN, to: "SELF" },
  { event: ET.ARTIFACT_FINALIZED, to: "SELF" },
  { event: ET.ARTIFACT_REJECTED, to: "SELF" },
  { event: ET.TOOL_INVOCATION_PREPARED, to: "SELF" },
  { event: ET.TOOL_INVOCATION_DISPATCHED, to: "SELF" },
  { event: ET.TOOL_INVOCATION_SETTLED, to: "SELF" },
  { event: ET.TOOL_INVOCATION_FAILED, to: "SELF" },
  { event: ET.TOOL_INVOCATION_OUTCOME_UNKNOWN, to: S.RECONCILIATION_REQUIRED },
  { event: ET.BUDGET_RESERVED, to: "SELF" },
  { event: ET.BUDGET_SETTLED, to: "SELF" },
  { event: ET.BUDGET_RELEASED, to: "SELF" },
  { event: ET.BUDGET_TOPUP_APPROVED, to: "SELF" },
  { event: ET.REVISION_REQUESTED, to: S.REVISION },
  { event: ET.RECOVERY_STARTED, to: S.HUMAN_REVIEW_REQUIRED },
];

/** Legal events from a pause stage (E31/E32 + human recovery exits). */
const PAUSE_COMMON: readonly { event: EventType; to: MissionStage | "SELF"; consumesCounter?: CounterName }[] = [
  { event: ET.MISSION_ABORTED, to: S.ABORTED },
  { event: ET.MISSION_FAILED, to: S.FAILED },
  { event: ET.RECOVERY_COMPLETED, to: "SELF" },
];

export const CREATION_EVENT = ET.MISSION_CREATED;

export interface TransitionDecision {
  edgeId: string;
  fromStage: MissionStage;
  toStage: MissionStage;
  informational: boolean;
  requiresApproval: boolean;
  consumesCounter: CounterName | null;
}

/**
 * Validate (stage, eventType, payload) legality. Default deny. Throws a
 * structured KernelError on any illegal combination; never mutates state.
 */
export function decideTransition(
  state: MissionState,
  eventType: EventType,
  payload: Record<string, unknown>,
): TransitionDecision {
  if (PUBLIC_ACTION_EVENT_TYPES.has(eventType)) {
    throw new KernelError("PUBLICATION_DISABLED", `event ${eventType} is disabled in v0.1.1`, {
      stage: state.stage,
      eventType,
    });
  }
  if (eventType === CREATION_EVENT) {
    throw new KernelError("ILLEGAL_TRANSITION", "MISSION_CREATED is applied only at mission creation", {});
  }

  const from = state.stage;
  if (TERMINAL_STAGES.has(from)) {
    throw new KernelError("ILLEGAL_TRANSITION", `terminal stage ${from} has no exits`, { stage: from, eventType });
  }

  const candidates = EDGES.filter((e) => e.from === from && e.event === eventType);
  const narrowed = candidates.filter((e) => e.matches === undefined || e.matches(state, payload));
  if (narrowed.length === 1) {
    const edge = narrowed[0] as Edge;
    assertNotReserved(edge.to, eventType);
    if (edge.consumesCounter !== undefined) assertCounterWithinLimit(state, edge.consumesCounter, eventType);
    return {
      edgeId: edge.id,
      fromStage: from,
      toStage: edge.to,
      informational: edge.to === from,
      requiresApproval: edge.requiresApproval,
      consumesCounter: edge.consumesCounter ?? null,
    };
  }
  if (narrowed.length > 1) {
    throw new KernelError("INTERNAL_INVARIANT_VIOLATION", `ambiguous edges for ${eventType} from ${from}`, {
      edges: narrowed.map((e) => e.id),
    });
  }

  // RECOVERY_COMPLETED from a pause re-enters the pre-pause stage (E34/E36).
  if (eventType === ET.RECOVERY_COMPLETED && PAUSE_STAGES.has(from)) {
    const target = state.resumeStage;
    if (target === null || PAUSE_STAGES.has(target)) {
      throw new KernelError("ILLEGAL_TRANSITION", "recovery edge without a resumable pre-pause stage", {
        resumeStage: target,
      });
    }
    assertCounterWithinLimit(state, "humanResumptionCount", eventType);
    return { edgeId: "E36", fromStage: from, toStage: target, informational: false, requiresApproval: true, consumesCounter: "humanResumptionCount" };
  }

  if (PAUSE_STAGES.has(from)) {
    const pauseEdge = PAUSE_COMMON.find((a) => a.event === eventType);
    if (pauseEdge !== undefined) {
      const toStage = pauseEdge.to === "SELF" ? from : pauseEdge.to;
      return {
        edgeId: pauseEdge.event === ET.MISSION_ABORTED ? "E31" : pauseEdge.event === ET.MISSION_FAILED ? "E32" : "SELF",
        fromStage: from,
        toStage,
        informational: toStage === from,
        requiresApproval: false,
        consumesCounter: null,
      };
    }
    throw new KernelError("ILLEGAL_TRANSITION", `pause stage ${from} executes no automatic work; ${eventType} denied`, {
      stage: from,
      eventType,
    });
  }

  const common = NONTERMINAL_COMMON.find((a) => a.event === eventType);
  if (common !== undefined) {
    const toStage = common.to === "SELF" ? from : common.to;
    assertNotReserved(toStage, eventType);
    return {
      edgeId:
        common.event === ET.MISSION_ABORTED
          ? "E31"
          : common.event === ET.MISSION_FAILED
            ? "E32"
            : common.event === ET.RECOVERY_STARTED
              ? "E33"
              : "COMMON",
      fromStage: from,
      toStage,
      informational: toStage === from,
      requiresApproval: common.requiresApproval === true,
      consumesCounter: common.consumesCounter ?? null,
    };
  }

  throw new KernelError("ILLEGAL_TRANSITION", `event ${eventType} is not legal from stage ${from}`, {
    stage: from,
    eventType,
  });
}

function assertNotReserved(toStage: MissionStage, eventType: EventType): void {
  if (toStage === S.PUBLIC_ACTION_PENDING || toStage === S.PUBLISHED) {
    throw new KernelError("PUBLICATION_DISABLED", `edge to ${toStage} is disabled in v0.1.1`, { eventType });
  }
}

function assertCounterWithinLimit(state: MissionState, counter: CounterName, eventType: EventType): void {
  const current = state.counters[counter];
  const limit = COUNTER_LIMITS[counter];
  if (current === undefined || limit === undefined) {
    throw new KernelError("INTERNAL_INVARIANT_VIOLATION", `unknown counter ${counter}`, {});
  }
  if (current >= limit) {
    throw new KernelError("REVISION_LIMIT_EXCEEDED", `counter ${counter} exhausted (limit ${limit})`, {
      counter,
      current,
      eventType,
    });
  }
}

/** Human-readable transition table generated from the same source of truth. */
export function renderTransitionTable(): string {
  const lines = ["| Edge | From | Event | To | Guard | Approval | Counter |", "|---|---|---|---|---|---|---|"];
  for (const e of EDGES) {
    lines.push(
      `| ${e.id} | ${e.from} | ${e.event} | ${e.to} | ${e.guardLabel ?? "-"} | ${e.requiresApproval ? "required" : "-"} | ${e.consumesCounter ?? "-"} |`,
    );
  }
  lines.push("| E31* | any nonterminal | MISSION_ABORTED | ABORTED | - | - | - |");
  lines.push("| E32* | any nonterminal | MISSION_FAILED | FAILED | - | - | - |");
  lines.push("| E33* | any nonterminal | RECOVERY_STARTED | HUMAN_REVIEW_REQUIRED | - | - | - |");
  lines.push("| E36* | pause stage | RECOVERY_COMPLETED | pre-pause stage | humanResumptionCount | required | humanResumptionCount |");
  lines.push("| COMMON* | any nonterminal | informational recordings | same stage | - | - | - |");
  lines.push("| — | any stage | PUBLIC_ACTION_* | rejected | PUBLICATION_DISABLED | - | - |");
  return lines.join("\n");
}

/** Mermaid state diagram generated from the same source of truth. */
export function renderMermaidStateDiagram(): string {
  const lines = ["stateDiagram-v2"];
  for (const e of EDGES) {
    lines.push(`  ${e.from} --> ${e.to}: ${e.id} ${e.event}${e.guardLabel ? ` (${e.guardLabel})` : ""}`);
  }
  return lines.join("\n");
}
