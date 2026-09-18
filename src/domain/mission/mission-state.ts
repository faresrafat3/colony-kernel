/** MissionState — persisted type (schemaVersion 1, N5/N10). */
import type { MissionStage } from "./stages.js";

export interface MissionState {
  schemaVersion: 1;
  missionId: string;
  stage: MissionStage;
  /** Every accepted event increments exactly once (N2 req 8). */
  stateVersion: number;
  /** Highest applied missionSequence (events are 1-based, monotone). */
  missionSequence: number;
  title: string;
  /** Stage recorded before entering a pause state (E34/E36 re-entry). */
  resumeStage: MissionStage | null;
  /** Bounded rework counters (N6). Monotone within a mission; never reset. */
  counters: {
    revisionCount: number;
    planReworkCount: number;
    gateReissueCount: number;
    verificationInfraRetryCount: number;
    textOnlyPackageReworkCount: number;
    humanResumptionCount: number;
  };
  /** Digests of the currently bound plan/candidate/verification subjects. */
  boundPlanSha256: string | null;
  boundCandidateSha256: string | null;
  boundVerificationSha256: string | null;
  /** Consumed approval subject hashes (at-most-once enforcement). */
  consumedApprovalSubjectHashes: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export function emptyCounters(): MissionState["counters"] {
  return {
    revisionCount: 0,
    planReworkCount: 0,
    gateReissueCount: 0,
    verificationInfraRetryCount: 0,
    textOnlyPackageReworkCount: 0,
    humanResumptionCount: 0,
  };
}

export function initialMissionState(input: {
  missionId: string;
  title: string;
  createdAt: string;
}): MissionState {
  return {
    schemaVersion: 1,
    missionId: input.missionId,
    stage: "CREATED",
    stateVersion: 0,
    missionSequence: 0,
    title: input.title,
    resumeStage: null,
    counters: emptyCounters(),
    boundPlanSha256: null,
    boundCandidateSha256: null,
    boundVerificationSha256: null,
    consumedApprovalSubjectHashes: [],
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}
