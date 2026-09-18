/** Shared deterministic test kit: kernel builder + role/mission fixtures. */
import { ColonyKernel } from "../../application/colony-kernel.js";
import { InMemoryColonyStorage } from "../../adapters/in-memory-storage.js";
import type { SteppingClock } from "../../adapters/kernel-adapters.js";
import { DeterministicClock, DeterministicIdGenerator, InMemoryTelemetry } from "../../adapters/kernel-adapters.js";
import { FakeAgentRuntime, type ScriptedResponse } from "../../adapters/fake-agent-runtime.js";

export const FIXED_INSTANT = new Date(Date.UTC(2026, 8, 17, 12, 0, 0));
export const TEST_SEED = "colony-kernel-test-seed";

export interface TestKernel {
  kernel: ColonyKernel;
  storage: InMemoryColonyStorage;
  telemetry: InMemoryTelemetry;
  runtime: FakeAgentRuntime;
}

export function buildTestKernel(options?: { script?: ScriptedResponse[]; seed?: string; clock?: SteppingClock }): TestKernel {
  const storage = new InMemoryColonyStorage();
  const telemetry = new InMemoryTelemetry();
  const runtime = new FakeAgentRuntime(options?.script ?? []);
  const kernel = new ColonyKernel({
    storage,
    clock: options?.clock ?? new DeterministicClock(FIXED_INSTANT),
    ids: new DeterministicIdGenerator(options?.seed ?? TEST_SEED),
    telemetry,
    runtime,
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

function driveRecon(k: TestKernel, missionId: string): string {
  const recon = k.kernel.finalizeArtifact({
    missionId,
    roleId: "first-mate",
    artifactType: "recon_brief",
    content: { fields: { summary: "bug" } },
  });
  return recon.manifest.artifactId;
}
