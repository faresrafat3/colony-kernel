/**
 * Deterministic M1A demo: one mission through the full legal path
 * CREATED → … → AWAITING_PLAN_APPROVAL → IMPLEMENTATION → … →
 * AWAITING_PUBLISH_APPROVAL → READY_TO_PUBLISH → CLOSED, with both human
 * approvals simulated by a deterministic test authority. No publication
 * states are entered (A33); no live model, network or DSH runtime is touched.
 *
 * Same seed ⇒ byte-identical JSON output.
 */
import { ColonyKernel } from "../application/colony-kernel.js";
import { InMemoryColonyStorage } from "../adapters/in-memory-storage.js";
import { DeterministicClock, DeterministicIdGenerator, InMemoryTelemetry } from "../adapters/kernel-adapters.js";
import { FakeAgentRuntime, type ScriptedResponse } from "../adapters/fake-agent-runtime.js";
import { approvalSubjectHash } from "../domain/approvals/approval.js";
import { applyEvent } from "../domain/events/apply-event.js";
import { initialMissionState } from "../domain/mission/mission-state.js";

export interface DemoOutput {
  missionId: string;
  title: string;
  seed: string;
  acceptedTransitions: { seq: number; event: string; from: string; to: string; stateVersion: number }[];
  artifacts: { artifactId: string; artifactType: string; contentSha256: string }[];
  approvalSubjectHashes: { purpose: string; approvalSubjectHash: string; decision: string }[];
  finalStage: string;
  finalStateVersion: number;
  eventLogHash: string;
}

export function runDemo(seed: string): DemoOutput {
  const fixedInstant = new Date(Date.UTC(2026, 8, 17, 12, 0, 0)); // fixed clock (mission §12)
  const kernel = new ColonyKernel({
    storage: new InMemoryColonyStorage(),
    clock: new DeterministicClock(fixedInstant),
    ids: new DeterministicIdGenerator(seed),
    telemetry: new InMemoryTelemetry(),
    runtime: new FakeAgentRuntime(demoScript()),
  });

  const { missionId } = kernel.createMission({ title: "Fix a controlled bug in a disposable calculator fixture" });

  kernel.startMission(missionId);
  kernel.completePolicyScreen(missionId, "allowed", { policyVersion: "v0.1.1" });

  const recon = kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "first-mate",
    roleVersion: 1,
    capabilityId: "conduct_reconnaissance",
    input: { objective: "recon calculator bug", inputArtifactIds: [], parameters: {} },
    idempotencyKey: `mission:${missionId}:recon`,
  });
  const reconArtifact = kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "recon_brief",
    content: recon.artifact ?? { fields: {} },
    slot: undefined,
  });
  kernel.completeRecon(missionId, reconArtifact.manifest.artifactId);

  const plan = kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "first-mate",
    roleVersion: 1,
    capabilityId: "propose_plan",
    input: { objective: "plan calculator fix", inputArtifactIds: [reconArtifact.manifest.artifactId], parameters: {} },
    idempotencyKey: `mission:${missionId}:plan`,
  });
  const planArtifact = kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "plan",
    content: plan.artifact ?? { fields: {} },
    slot: "plan",
  });
  kernel.proposePlan(missionId, planArtifact.contentSha256);

  const challenge = kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "reviewer",
    roleVersion: 1,
    capabilityId: "challenge_plan",
    input: { objective: "challenge plan", inputArtifactIds: [planArtifact.manifest.artifactId], parameters: {} },
    idempotencyKey: `mission:${missionId}:challenge`,
  });
  const challengeArtifact = kernel.finalizeArtifact({
    missionId,
    roleId: "reviewer",
    artifactType: "plan_challenge",
    content: challenge.artifact ?? { fields: {} },
  });
  kernel.challengePlan(missionId, challengeArtifact.manifest.artifactId);

  // Gate 1: PLAN_APPROVAL (simulated deterministic human authority).
  const planRequest = kernel.requestPlanApproval({
    missionId,
    artifactSubjects: [
      { artifactId: planArtifact.manifest.artifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planArtifact.contentSha256, finalizedAt: planArtifact.manifest.finalizedAt },
    ],
    requestedByRole: { roleId: "first-mate", roleVersion: 1 },
    ttlMs: 60_000,
  });
  kernel.recordApprovalDecision({ approvalRequestId: planRequest.approvalRequestId, decision: "APPROVED", decidedBy: "captain", reason: "deterministic demo approval" });

  kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "craftsman",
    roleVersion: 1,
    capabilityId: "produce_implementation_artifact",
    input: { objective: "fix calculator bug", inputArtifactIds: [planArtifact.manifest.artifactId], parameters: {} },
    idempotencyKey: `mission:${missionId}:impl`,
  });
  const candidate = kernel.finalizeArtifact({
    missionId,
    roleId: "craftsman",
    artifactType: "implementation_candidate",
    content: { fields: { patch: "guard division-by-zero in calculator divide()", language: "typescript", tests: ["divide-by-zero-guard"] } },
    slot: "candidate",
  });

  const verification = kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "verifier",
    roleVersion: 1,
    capabilityId: "produce_verification_artifact",
    input: { objective: "verify candidate", inputArtifactIds: [candidate.manifest.artifactId], parameters: {} },
    idempotencyKey: `mission:${missionId}:verify`,
  });
  const verificationArtifact = kernel.finalizeArtifact({
    missionId,
    roleId: "verifier",
    artifactType: "verification_report",
    content: verification.artifact ?? { fields: {} },
    slot: "verification",
  });
  kernel.completeImplementation(missionId);
  kernel.completeVerification(missionId);

  const review = kernel.invokeAgent({
    invocationId: kernel.ids.nextId("inv"),
    missionId,
    roleId: "reviewer",
    roleVersion: 1,
    capabilityId: "produce_review_artifact",
    input: { objective: "technical review", inputArtifactIds: [candidate.manifest.artifactId, verificationArtifact.manifest.artifactId], parameters: {} },
    idempotencyKey: `mission:${missionId}:review`,
  });
  kernel.finalizeArtifact({
    missionId,
    roleId: "reviewer",
    artifactType: "technical_review",
    content: review.artifact ?? { fields: {} },
  });
  kernel.completeTechnicalReview(missionId);

  kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "documentation_bundle",
    content: { fields: { changelog: "guard division by zero; document behavior" } },
  });
  kernel.completeDocumentation(missionId);
  kernel.completeFinalPolicyGate(missionId, "allowed");

  // Gate 2: PACKAGE_APPROVAL. No public action follows (A33).
  const artifacts = kernel.storage.listArtifacts(missionId);
  if (!artifacts.ok) throw artifacts.error;
  const packageSubjects = artifacts.value.map((a) => ({
    artifactId: a.artifactId,
    artifactType: a.artifactType,
    artifactSchemaVersion: 1,
    contentSha256: a.contentSha256,
    finalizedAt: a.finalizedAt,
  }));
  const packageRequest = kernel.requestPackageApproval({
    missionId,
    artifactSubjects: packageSubjects,
    requestedByRole: { roleId: "first-mate", roleVersion: 1 },
    ttlMs: 60_000,
  });
  kernel.recordApprovalDecision({ approvalRequestId: packageRequest.approvalRequestId, decision: "APPROVED", decidedBy: "captain", reason: "deterministic demo package approval" });

  kernel.closeMission(missionId);

  const events = kernel.getEvents(missionId);
  const final = kernel.getMission(missionId);
  if (final === undefined) throw new Error("demo mission state missing");
  const transitions: DemoOutput["acceptedTransitions"] = [];
  {
    // Replay stages deterministically with the domain reducer (single truth).
    const seed = initialMissionState({ missionId, title: final.title, createdAt: events[0]?.occurredAt ?? "" });
    let stage = seed.stage;
    let version = 0;
    for (const e of events) {
      const next = applyEvent({ ...seed, stage, stateVersion: version, missionSequence: e.missionSequence - 1 }, e);
      transitions.push({ seq: e.missionSequence, event: e.eventType, from: stage, to: next.stage, stateVersion: e.expectedStateVersion + 1 });
      stage = next.stage;
      version = next.stateVersion;
    }
  }
  const artifactsOut = artifacts.value.map((a) => ({ artifactId: a.artifactId, artifactType: a.artifactType, contentSha256: a.contentSha256 }));
  return {
    missionId,
    title: final.title,
    seed,
    acceptedTransitions: transitions,
    artifacts: artifactsOut,
    approvalSubjectHashes: [
      { purpose: "PLAN_APPROVAL", approvalSubjectHash: approvalSubjectHash(planRequest), decision: "APPROVED" },
      { purpose: "PACKAGE_APPROVAL", approvalSubjectHash: approvalSubjectHash(packageRequest), decision: "APPROVED" },
    ],
    finalStage: final.stage,
    finalStateVersion: final.stateVersion,
    eventLogHash: kernel.eventLogHash(missionId),
  };
}

function demoScript(): ScriptedResponse[] {
  const recon = { fields: { summary: "division-by-zero reachable from divide(a,b) with b=0", branches: ["reproduce", "isolate", "map-callers"] } };
  const plan = { fields: { steps: ["add guard", "add test", "document"], scope: "calculator divide()" } };
  const challenge = { fields: { verdict: "no-blocking-findings" } };
  const verification = { fields: { result: "pass", testsRun: 3, testsFailed: 0, candidateSha256: "bound-by-kernel" } };
  const review = { fields: { verdict: "approved", comments: "guard minimal and tested" } };
  return [
    { kind: "success", artifact: recon, artifactType: "recon_brief" },
    { kind: "success", artifact: plan, artifactType: "plan" },
    { kind: "success", artifact: challenge, artifactType: "plan_challenge" },
    { kind: "success", artifact: { fields: { patch: "guard division-by-zero in calculator divide()", language: "typescript", tests: ["divide-by-zero-guard"] } }, artifactType: "implementation_candidate" },
    { kind: "success", artifact: verification, artifactType: "verification_report" },
    { kind: "success", artifact: review, artifactType: "technical_review" },
  ];
}

const isMain = process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  const seed = process.argv[2] ?? "colony-kernel-m1a-seed-001";
  process.stdout.write(`${JSON.stringify(runDemo(seed), null, 2)}\n`);
}
