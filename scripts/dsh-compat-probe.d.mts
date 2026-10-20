/**
 * Type declarations for scripts/dsh-compat-probe.mjs.
 *
 * The probe is plain ESM JavaScript on purpose: the M2 adapter has to call it
 * at startup without a build step, and it has to stay runnable straight from
 * a checkout. This file exists only so the TypeScript test suite (strict
 * mode) can import it.
 */

export interface ProbeRequirement {
  readonly id: string;
  readonly interface: string;
  readonly spec: string;
  readonly kind: "export" | "service" | "event" | "file";
  readonly package: string;
  readonly symbol: string;
  readonly surface: string;
}

export interface ProbeCheckResult {
  id: string;
  interface: string;
  spec: string;
  kind: string;
  package: string;
  symbol: string;
  surface: string;
  status: "pass" | "fail" | "not-verified" | "not-applicable";
  detail: string;
  evidence: { file?: string; line?: number; kind?: string; sha256?: string; bytes?: number } | null;
}

export interface ProbeMissing {
  id: string;
  interface: string;
  kind: string;
  package: string;
  symbol: string;
  surface: string;
  detail: string;
}

export interface ProbeReceipt {
  receiptVersion: number;
  kind: string;
  generatedAt: string;
  probe: { path: string; sha256: string };
  spec: { document: string; section: string; requirements: string[] };
  command: string | null;
  projectRoot: string;
  resolution: {
    packageName: string;
    candidatePath: string | null;
    resolvedPath: string | null;
    resolvedWithinProjectRoot: boolean;
    globalFallbackUsed: boolean;
    globalFallbackPolicy: string;
    status: string;
    error?: { code: string; message: string };
  };
  package: {
    name: string;
    declaredVersion: string | null;
    installedVersion: string | null;
    versionIdentity: { status: string; detail: string };
    executable: { path: string | null; sha256: string | null; bytes: number | null; error?: string };
    packageSha256: string;
    packageSha256Definition: string;
    dependencySetPackages: readonly string[];
    dependencySetSha256: string | null;
    lockfile: Record<string, unknown> | null;
    integrity: {
      source: string | null;
      status: string;
      expected: string | null;
      tarballFound: boolean;
      recomputed: string | null;
      tarballPath: string | null;
      detail: string;
    };
    subPackageVersions: Record<string, string | null>;
  } | null;
  requirements: ProbeCheckResult[];
  missing: ProbeMissing[];
  identityChecks?: { status: string; detail: string }[];
  capabilityVerdict: string;
  identityVerdict: string;
  verdict: string;
  errors: { code: string; message: string; package?: string }[];
  exitStatus?: number;
}

export interface ProbeOptions {
  projectRoot?: string;
  expectVersion?: string;
  lockfile?: string;
  expectedIntegrity?: string;
  integritySource?: string;
  npmCache?: string;
  now?: string;
  requirements?: ProbeRequirement[];
  command?: string;
}

export declare const DSH_PACKAGE: string;
export declare const DEFAULT_PROJECT_ROOT: string;
export declare const PROBE_VERSION: number;
export declare const ADAPTER_REQUIREMENTS: readonly ProbeRequirement[];
export declare const ADAPTER_DEPENDENCY_PACKAGES: readonly string[];

export declare class DshProbeError extends Error {
  constructor(code: string, message: string, details?: Record<string, unknown>);
  code: string;
  details: Record<string, unknown>;
}

export declare function isUnder(root: string, target: string): boolean;
export declare function resolveDshPackage(projectRoot: string): { root: string; packageDir: string; candidate: string };
export declare function resolveSubPackageDir(fromDir: string, packageName: string, projectRoot: string): string;
export declare function readPackageJson(packageDir: string): Record<string, unknown>;
export declare function packageEntryFile(packageDir: string, pkg: Record<string, unknown>): string;
export declare function listPackageFiles(packageDir: string): [string, string][];
export declare function packageContentHash(packageDir: string): string;
export declare function dependencySetHash(packageDirs: string[]): string;
export declare function npmCacheBlobPath(integrity: string, cacheDir: string): string | null;
export declare function verifyTarballIntegrity(
  expectedIntegrity: string,
  cacheDir: string,
): {
  status: string;
  expected: string;
  tarballFound: boolean;
  recomputed: string | null;
  tarballPath: string | null;
  detail: string;
};
export declare function readDeclaredPin(projectRoot: string): string | null;
export declare function runProbe(options?: ProbeOptions): Promise<ProbeReceipt>;
export declare function formatFailure(receipt: ProbeReceipt): string;
export declare function formatSummary(receipt: ProbeReceipt): string;
export declare function main(argv?: string[]): Promise<number>;
