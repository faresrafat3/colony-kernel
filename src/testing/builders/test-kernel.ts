/** Shared deterministic test kit: kernel builder + role/mission fixtures. */
import { ColonyKernel } from "../../application/colony-kernel.js";
import { InMemoryColonyStorage } from "../../adapters/in-memory-storage.js";
import type { Clock } from "../../ports/kernel-ports.js";
import { DeterministicClock, DeterministicIdGenerator, InMemoryTelemetry } from "../../adapters/kernel-adapters.js";
import { FakeAgentRuntime, type ScriptedResponse } from "../../adapters/fake-agent-runtime.js";
import type { ApprovalRequest } from "../../domain/approvals/approval.js";
import type { RoleRegistry } from "../../domain/capabilities/registry.js";
import type { ColonyStorage } from "../../ports/storage.js";

export const FIXED_INSTANT = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));
export const TEST_SEED = "colony-kernel-test-seed";

export interface TestKernel {
  kernel: ColonyKernel;
  storage: InMemoryColonyStorage;
  telemetry: InMemoryTelemetry;
  runtime: FakeAgentRuntime;
}

export function buildTestKernel(options?: { script?: ScriptedResponse[]; seed?: string; clock?: Clock; roles?: RoleRegistry; storage?: InMemoryColonyStorage }): TestKernel {
  const clock = options?.clock ?? new DeterministicClock(FIXED_INSTANT);
  const storage = options?.storage ?? new InMemoryColonyStorage(clock);
  const telemetry = new InMemoryTelemetry();
  const runtime = new FakeAgentRuntime(options?.script ?? []);
  const kernel = new ColonyKernel({
    storage,
    clock,
    ids: new DeterministicIdGenerator(options?.seed ?? TEST_SEED),
    telemetry,
    runtime,
    ...(options?.roles === undefined ? {} : { roles: options.roles }),
  });
  return { kernel, storage, telemetry, runtime };
}

/** Drive a mission to AWAITING_PLAN_APPROVAL with a bound plan artifact. */
export function toPlanGate(k: TestKernel, missionTitle = "test mission"): { missionId: string; planArtifactId: string; planSha: string } {
  const { kernel } = k;
  const { missionId } = kernel.createMission({ title: missionTitle });
  kernel.startMission(missionId);
  kernel.completePolicyScreen(missionId, "allowed");
  kernel.completeRecon(missionId, driveRecon(k, missionId));
  const plan = kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "plan",
    content: { fields: { steps: ["s1", "s2"] } },
    slot: "plan",
  });
  kernel.proposePlan(missionId, plan.contentSha256);
  kernel.challengePlan(missionId, plan.manifest.artifactId);
  return { missionId, planArtifactId: plan.manifest.artifactId, planSha: plan.contentSha256 };
}

/** Drive a mission past gate 1 into IMPLEMENTATION with a bound candidate. */
export function toImplementation(k: TestKernel): { missionId: string; planArtifactId: string; planSha: string; candidateArtifactId: string; candidateSha: string } {
  const { missionId, planArtifactId, planSha } = toPlanGate(k);
  const { kernel } = k;
  const request = kernel.requestPlanApproval({
    missionId,
    artifactSubjects: [{ artifactId: planArtifactId, artifactType: "plan", artifactSchemaVersion: 1, contentSha256: planSha, finalizedAt: FIXED_INSTANT.toISOString() }],
    requestedByRole: { roleId: "first-mate", roleVersion: 1 },
    ttlMs: 60_000,
  });
  kernel.recordApprovalDecision({ approvalRequestId: request.approvalRequestId, decision: "APPROVED", decidedBy: "captain" });
  const candidate = kernel.finalizeArtifact({
    missionId,
    roleId: "craftsman",
    artifactType: "implementation_candidate",
    content: { fields: { patch: "guard" } },
    slot: "candidate",
  });
  return { missionId, planArtifactId, planSha, candidateArtifactId: candidate.manifest.artifactId, candidateSha: candidate.contentSha256 };
}

/** Advance an existing IMPLEMENTATION mission to AWAITING_PUBLISH_APPROVAL. */
export function driveToPublishGate(k: TestKernel, missionId: string): void {
  const { kernel } = k;
  kernel.finalizeArtifact({
    missionId,
    roleId: "verifier",
    artifactType: "verification_report",
    content: { fields: { result: "pass" } },
    slot: "verification",
  });
  kernel.completeImplementation(missionId);
  kernel.completeVerification(missionId);
  kernel.finalizeArtifact({
    missionId,
    roleId: "reviewer",
    artifactType: "technical_review",
    content: { fields: { verdict: "approved" } },
  });
  kernel.completeTechnicalReview(missionId);
  kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "documentation_bundle",
    content: { fields: { changelog: "test fixture" } },
  });
  kernel.completeDocumentation(missionId);
  kernel.completeFinalPolicyGate(missionId, "allowed");
}

/**
 * Drive a mission to AWAITING_PUBLISH_APPROVAL (no gate request yet).
 * Split from toPackageGate so a test can issue its own requests at that gate.
 */
export function toPublishGate(k: TestKernel): { missionId: string } {
  const { missionId } = toImplementation(k);
  driveToPublishGate(k, missionId);
  return { missionId };
}

/**
 * Drive a mission to AWAITING_PUBLISH_APPROVAL and issue the package request.
 * Binds to a real subject set, so the gate's request is bound to what the
 * mission actually produced (no hand-built subjects).
 */
export function toPackageGate(k: TestKernel): { missionId: string; request: ApprovalRequest } {
  const { kernel } = k;
  const { missionId } = toPublishGate(k);
  // Read through the port, not the concrete adapter: only the port declares the
  // failure branch, and a test kit must exercise the shape callers really see.
  const port: ColonyStorage = k.storage;
  const artifacts = port.listArtifacts(missionId);
  if (!artifacts.ok) throw artifacts.error;
  const request = kernel.requestPackageApproval({
    missionId,
    artifactSubjects: artifacts.value.map((a) => ({
      artifactId: a.artifactId,
      artifactType: a.artifactType,
      artifactSchemaVersion: 1,
      contentSha256: a.contentSha256,
      finalizedAt: a.finalizedAt,
    })),
    requestedByRole: { roleId: "first-mate", roleVersion: 1 },
    ttlMs: 60_000,
  });
  return { missionId, request };
}

function driveRecon(k: TestKernel, missionId: string): string {
  const recon = k.kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "recon_brief",
    content: { fields: { summary: "bug" } },
  });
  return recon.manifest.artifactId;
}
