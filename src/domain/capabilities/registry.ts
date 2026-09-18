/**
 * Role and capability contracts (N8/A16/A17, deny-by-default).
 * RoleManifest and CapabilityManifest are persisted types (schemaVersion 1).
 * Capability grants live in the kernel-owned registry; repository/model text
 * can never grant or widen them.
 */
import { KernelError } from "../errors/kernel-error.js";

export type CapabilityId =
  | "propose_plan"
  | "produce_implementation_artifact"
  | "produce_verification_artifact"
  | "produce_review_artifact"
  | "produce_documentation"
  | "screen_policy"
  | "conduct_reconnaissance"
  | "challenge_plan";

export interface RoleManifest {
  schemaVersion: 1;
  roleId: string;
  roleVersion: number;
  /** Exactly the explicitly granted capabilities; deny-by-default. */
  capabilities: readonly CapabilityId[];
  /** Roles this role may never act as (separation of duties). */
  mayNotApproveOwnOutput: true;
}

export interface CapabilityManifest {
  schemaVersion: 1;
  capabilityId: CapabilityId;
  /** Artifact types this capability may produce. */
  producesArtifactTypes: readonly string[];
  /** Capabilities are bound to artifact scope; verifier cannot touch impl bytes. */
  scope: "plan" | "implementation" | "verification" | "review" | "documentation" | "policy";
}

export interface RoleRegistryView {
  role(roleId: string): RoleManifest;
  /** Deny-by-default check; unknown role fails closed. */
  hasCapability(roleId: string, capabilityId: CapabilityId): boolean;
  /** Structural ban: a role can never mutate its own manifest or self-grant. */
  assertNoSelfMutation(roleId: string, mutation: { roleId: string }): void;
}

export class RoleRegistry implements RoleRegistryView {
  private readonly roles: ReadonlyMap<string, RoleManifest>;

  constructor(roles: readonly RoleManifest[]) {
    const map = new Map<string, RoleManifest>();
    for (const role of roles) {
      if (map.has(role.roleId)) {
        throw new KernelError("INTEGRITY_FAILURE", `duplicate role ownership ${role.roleId}`, {});
      }
      map.set(role.roleId, role);
    }
    this.roles = map;
  }

  role(roleId: string): RoleManifest {
    const role = this.roles.get(roleId);
    if (role === undefined) {
      throw new KernelError("UNAUTHORIZED", `unknown role ${roleId}`, { roleId });
    }
    return role;
  }

  hasCapability(roleId: string, capabilityId: CapabilityId): boolean {
    const role = this.roles.get(roleId);
    if (role === undefined) return false; // deny by default, fail closed
    return role.capabilities.includes(capabilityId);
  }

  assertCapability(roleId: string, capabilityId: CapabilityId): void {
    if (!this.hasCapability(roleId, capabilityId)) {
      throw new KernelError("CAPABILITY_DENIED", `role ${roleId} lacks capability ${capabilityId}`, {
        roleId,
        capabilityId,
      });
    }
  }

  assertNoSelfMutation(roleId: string, mutation: { roleId: string }): void {
    if (mutation.roleId === roleId) {
      throw new KernelError("UNAUTHORIZED", `role ${roleId} cannot mutate its own manifest or grants`, {
        roleId,
      });
    }
  }
}

/** M1A test roles (mission §10). No publication capability exists anywhere. */
export function testRoleRegistry(): RoleRegistry {
  return new RoleRegistry([
    {
      schemaVersion: 1,
      roleId: "first-mate",
      roleVersion: 1,
      capabilities: ["screen_policy", "conduct_reconnaissance", "propose_plan", "challenge_plan", "produce_documentation"],
      mayNotApproveOwnOutput: true,
    },
    {
      schemaVersion: 1,
      roleId: "craftsman",
      roleVersion: 1,
      capabilities: ["produce_implementation_artifact"],
      mayNotApproveOwnOutput: true,
    },
    {
      schemaVersion: 1,
      roleId: "verifier",
      roleVersion: 1,
      capabilities: ["produce_verification_artifact"],
      mayNotApproveOwnOutput: true,
    },
    {
      schemaVersion: 1,
      roleId: "reviewer",
      roleVersion: 1,
      capabilities: ["challenge_plan", "produce_review_artifact"],
      mayNotApproveOwnOutput: true,
    },
  ]);
}

export const CAPABILITY_MANIFESTS: readonly CapabilityManifest[] = [
  { schemaVersion: 1, capabilityId: "propose_plan", producesArtifactTypes: ["plan"], scope: "plan" },
  { schemaVersion: 1, capabilityId: "challenge_plan", producesArtifactTypes: ["plan_challenge"], scope: "review" },
  { schemaVersion: 1, capabilityId: "screen_policy", producesArtifactTypes: [], scope: "policy" },
  { schemaVersion: 1, capabilityId: "conduct_reconnaissance", producesArtifactTypes: ["recon_brief"], scope: "policy" },
  { schemaVersion: 1, capabilityId: "produce_implementation_artifact", producesArtifactTypes: ["implementation_candidate"], scope: "implementation" },
  { schemaVersion: 1, capabilityId: "produce_verification_artifact", producesArtifactTypes: ["verification_report"], scope: "verification" },
  { schemaVersion: 1, capabilityId: "produce_review_artifact", producesArtifactTypes: ["technical_review"], scope: "review" },
  { schemaVersion: 1, capabilityId: "produce_documentation", producesArtifactTypes: ["documentation_bundle"], scope: "documentation" },
];
