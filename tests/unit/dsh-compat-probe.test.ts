/**
 * The §N9 DSH startup compatibility probe: the trip case, the allow case, and
 * the no-global-fallback rule.
 *
 * These are the three assertions the probe has to survive:
 *
 *   1. TRIP  — a fixture that is missing one required symbol / service / event
 *              makes the probe exit non-zero, and the failure NAMES the
 *              missing item. A probe that cannot fail is not a gate.
 *   2. ALLOW — a fixture that satisfies every requirement passes.
 *   3. NO GLOBAL FALLBACK — the DSH package is resolved from the project's own
 *              node_modules or not at all. Pointing the resolver at a root
 *              with no local install must fail loudly, and a symlink that
 *              escapes the project root must fail loudly too.
 *
 * The fixtures are materialised on disk because the probe's export check is a
 * real dynamic `import()` of the installed package — an ESM import needs real
 * files. The fixtures are byte-fixed, live in a private temporary directory,
 * and are the only thing the assertions depend on: no network, no wall clock
 * (the receipt's timestamp is injected), no randomness, and nothing outside
 * the fixture root is read.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADAPTER_REQUIREMENTS,
  DshProbeError,
  formatFailure,
  resolveDshPackage,
  runProbe,
} from "../../scripts/dsh-compat-probe.mjs";

/** The receipt timestamp used everywhere: the gate path never reads a clock. */
const FIXED_TIMESTAMP = "2026-10-20T00:00:00.000Z";

/** The version the fixture declares and the probe is told to expect. */
const FIXTURE_VERSION = "0.1.1-rc.2";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PROBE_PATH = join(REPO_ROOT, "scripts", "dsh-compat-probe.mjs");

/** How a fixture requirement is broken on purpose. */
type Break = "export" | "service" | "event";

let fixtureRoot = "";

beforeEach(() => {
  fixtureRoot = mkdtempSync(join(tmpdir(), "colony-dsh-probe-"));
});

afterEach(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents, "utf8");
}

/**
 * Build a fixture tree that mirrors the shape of a real DSH install: the
 * `@deepseek-ai/dsh` package plus the sub-packages the requirement set names.
 *
 * @param breaks requirement id → which kind of surface is removed
 */
function buildFixture(breaks: ReadonlyMap<string, Break> = new Map()): void {
  const byPackage = new Map<string, typeof ADAPTER_REQUIREMENTS[number][]>();
  for (const requirement of ADAPTER_REQUIREMENTS) {
    const list = byPackage.get(requirement.package) ?? [];
    list.push(requirement);
    byPackage.set(requirement.package, list);
  }

  // The DSH package itself: a version, an entry point and an executable.
  const dshDir = join(fixtureRoot, "node_modules", "@deepseek-ai", "dsh");
  writeFile(
    join(dshDir, "package.json"),
    `${JSON.stringify(
      {
        name: "@deepseek-ai/dsh",
        version: FIXTURE_VERSION,
        type: "module",
        main: "lib/index.js",
        bin: { dsh: "lib/bin.js" },
      },
      null,
      2,
    )}\n`,
  );
  writeFile(join(dshDir, "lib", "index.js"), "export const PACKAGE = '@deepseek-ai/dsh';\n");
  writeFile(join(dshDir, "lib", "bin.js"), "#!/usr/bin/env node\n// fixture executable\n");

  // The project's own declaration of the pin, so §N9 req. 1 has something to
  // compare the installed version against.
  writeFile(
    join(fixtureRoot, "package.json"),
    `${JSON.stringify({ name: "colony-kernel-fixture", version: "0.1.0", private: true, dependencies: { "@deepseek-ai/dsh": FIXTURE_VERSION } }, null, 2)}\n`,
  );

  for (const [packageName, requirements] of byPackage) {
    const packageDir = join(fixtureRoot, "node_modules", ...packageName.split("/"));
    const exportLines: string[] = [];
    const classExports: string[] = [];
    const serviceClasses: string[] = [];
    const services: string[] = [];
    const events: string[] = [];
    let serviceIndex = 0;

    for (const requirement of requirements) {
      const broken = breaks.get(requirement.id);
      if (requirement.kind === "export") {
        if (broken === "export") continue; // the symbol is never exported
        const symbol = requirement.symbol;
        if (/^[A-Z][A-Z0-9_]*$/.test(symbol)) {
          exportLines.push(`export const ${symbol} = Object.freeze({});`);
        } else {
          exportLines.push(`class ${symbol} extends FixtureService { constructor(ctx) { super(ctx); } }`);
          classExports.push(symbol);
        }
      } else if (requirement.kind === "service") {
        // A broken service is registered under a different name, so the probe's
        // `super(ctx, "<name>")` needle cannot match it.
        const name = broken === "service" ? `${requirement.symbol}-renamed` : requirement.symbol;
        services.push(name);
        serviceIndex += 1;
        serviceClasses.push(
          `class FixtureService${serviceIndex} extends FixtureService { constructor(ctx) { super(ctx, "${name}"); } }`,
        );
      } else if (requirement.kind === "event") {
        if (broken === "event") continue; // the event name is never declared
        events.push(requirement.symbol);
      }
    }

    const source = [
      "class FixtureService { constructor(ctx, name) { this.ctx = ctx; this.name = name; } }",
      ...exportLines,
      ...serviceClasses,
      `export { ${classExports.join(", ")} };`,
      `export const SERVICE_NAMES = Object.freeze({ ${services.map((s) => `"${s}": "${s}"`).join(", ")} });`,
      `export const EVENT_NAMES = Object.freeze({ ${events.map((e) => `"${e}": null`).join(", ")} });`,
      "",
    ].join("\n");

    writeFile(
      join(packageDir, "package.json"),
      `${JSON.stringify({ name: packageName, version: FIXTURE_VERSION, type: "module", main: "lib/index.js" }, null, 2)}\n`,
    );
    writeFile(join(packageDir, "lib", "index.js"), source);
  }
}

/** Run the probe against the fixture, with a fixed timestamp. */
function probeFixture(breaks: ReadonlyMap<string, Break> = new Map()) {
  buildFixture(breaks);
  return runProbe({ projectRoot: fixtureRoot, expectVersion: FIXTURE_VERSION, now: FIXED_TIMESTAMP });
}

describe("N9 probe — the compatibility gate", () => {
  it("N9-T1: ALLOW — a fixture that satisfies every requirement passes every check", async () => {
    const receipt = await probeFixture();

    expect(receipt.requirements).toHaveLength(ADAPTER_REQUIREMENTS.length);
    const failed = receipt.requirements.filter((r) => r.status !== "pass");
    expect(failed.map((r) => `${r.id}: ${r.detail}`)).toEqual([]);
    expect(receipt.missing).toEqual([]);
    expect(receipt.capabilityVerdict).toBe("pass");
    expect(receipt.identityVerdict).toBe("pass");
    expect(receipt.verdict).toBe("pass");
  });

  it("N9-T2: ALLOW — the receipt records the version, the hashes and the verdict", async () => {
    const receipt = await probeFixture();

    expect(receipt.package?.installedVersion).toBe(FIXTURE_VERSION);
    expect(receipt.package?.declaredVersion).toBe(FIXTURE_VERSION);
    expect(receipt.package?.versionIdentity.status).toBe("pass");
    expect(receipt.package?.executable.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.package?.packageSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.package?.dependencySetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.generatedAt).toBe(FIXED_TIMESTAMP);
    expect(receipt.resolution.globalFallbackUsed).toBe(false);
    expect(receipt.resolution.resolvedWithinProjectRoot).toBe(true);
  });

  it("N9-T3: TRIP — a missing required SYMBOL fails the probe and names the symbol", async () => {
    const receipt = await probeFixture(new Map([["tool-dispatcher.export.defineTool", "export"]]));

    expect(receipt.verdict).toBe("fail");
    expect(receipt.capabilityVerdict).toBe("fail");
    expect(receipt.missing.map((m) => m.id)).toEqual(["tool-dispatcher.export.defineTool"]);
    expect(receipt.missing[0]?.symbol).toBe("defineTool");
    expect(receipt.missing[0]?.interface).toBe("ToolDispatcher");

    const failure = formatFailure(receipt);
    expect(failure).toContain("tool-dispatcher.export.defineTool");
    expect(failure).toContain("defineTool");
    expect(failure).toContain("ToolDispatcher");
  });

  it("N9-T4: TRIP — a missing required SERVICE fails the probe and names the service", async () => {
    const receipt = await probeFixture(new Map([["telemetry.service.tokenMeter", "service"]]));

    expect(receipt.verdict).toBe("fail");
    expect(receipt.missing.map((m) => m.id)).toEqual(["telemetry.service.tokenMeter"]);
    expect(receipt.missing[0]?.symbol).toBe("tokenMeter");
    expect(formatFailure(receipt)).toContain("tokenMeter");
  });

  it("N9-T5: TRIP — a missing required EVENT fails the probe and names the event", async () => {
    const receipt = await probeFixture(new Map([["session-recorder.event.session-created", "event"]]));

    expect(receipt.verdict).toBe("fail");
    expect(receipt.missing.map((m) => m.id)).toEqual(["session-recorder.event.session-created"]);
    expect(receipt.missing[0]?.symbol).toBe("session/created");
    expect(formatFailure(receipt)).toContain("session/created");
  });

  it("N9-T6: TRIP — exactly one broken requirement fails exactly one check", async () => {
    const receipt = await probeFixture(new Map([["subagent-spawner.export.SubagentRunId", "export"]]));

    const failed = receipt.requirements.filter((r) => r.status !== "pass");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.id).toBe("subagent-spawner.export.SubagentRunId");
  });

  it("N9-T7: TRIP — the CLI exits non-zero and prints the named failure", async () => {
    buildFixture(new Map([["human-approval.export.ApprovalService", "export"]]));

    const run = spawnSync(
      process.execPath,
      [PROBE_PATH, "--require", "--project-root", fixtureRoot, "--expect-version", FIXTURE_VERSION, "--timestamp", FIXED_TIMESTAMP],
      { encoding: "utf8" },
    );

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("human-approval.export.ApprovalService");
    expect(run.stderr).toContain("ApprovalService");
    expect(run.stdout).toContain("VERDICT:    FAIL");
  });

  it("N9-T8: ALLOW — the CLI exits zero and writes a receipt for a complete fixture", async () => {
    buildFixture();
    const receiptPath = join(fixtureRoot, "receipt.json");

    const run = spawnSync(
      process.execPath,
      [
        PROBE_PATH,
        "--require",
        "--json",
        receiptPath,
        "--project-root",
        fixtureRoot,
        "--expect-version",
        FIXTURE_VERSION,
        "--timestamp",
        FIXED_TIMESTAMP,
      ],
      { encoding: "utf8" },
    );

    expect(run.status).toBe(0);
    expect(existsSync(receiptPath)).toBe(true);
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8")) as { verdict: string; generatedAt: string };
    expect(receipt.verdict).toBe("pass");
    expect(receipt.generatedAt).toBe(FIXED_TIMESTAMP);
  });

  it("N9-T9: NO GLOBAL FALLBACK — a root with no local install fails loudly and resolves nothing", async () => {
    // The fixture root deliberately has no node_modules/@deepseek-ai/dsh.
    const receipt = await runProbe({ projectRoot: fixtureRoot, expectVersion: FIXTURE_VERSION, now: FIXED_TIMESTAMP });

    expect(receipt.verdict).toBe("fail");
    expect(receipt.resolution.status).toBe("fail");
    expect(receipt.resolution.resolvedPath).toBeNull();
    expect(receipt.resolution.globalFallbackUsed).toBe(false);
    expect(receipt.resolution.error?.code).toBe("DSH_PACKAGE_NOT_RESOLVED");
    expect(receipt.resolution.error?.message).toContain(join("node_modules", "@deepseek-ai", "dsh"));
    expect(receipt.resolution.error?.message).toContain("global install is never used as a fallback");
  });

  it("N9-T10: NO GLOBAL FALLBACK — the resolver refuses a project root with no local install", () => {
    expect(() => resolveDshPackage(fixtureRoot)).toThrow(DshProbeError);
    try {
      resolveDshPackage(fixtureRoot);
      throw new Error("the resolver must not resolve anything");
    } catch (error) {
      expect(error).toBeInstanceOf(DshProbeError);
      const probeError = error as DshProbeError;
      expect(probeError.code).toBe("DSH_PACKAGE_NOT_RESOLVED");
      expect(probeError.details.globalFallbackUsed).toBe(false);
      expect(probeError.details.candidate).toBe(join(fixtureRoot, "node_modules", "@deepseek-ai", "dsh"));
    }
  });

  it("N9-T11: NO GLOBAL FALLBACK — a symlink that escapes the project root is refused", async () => {
    const outside = mkdtempSync(join(tmpdir(), "colony-dsh-probe-outside-"));
    try {
      const realPackage = join(outside, "dsh");
      mkdirSync(realPackage, { recursive: true });
      writeFileSync(join(realPackage, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: FIXTURE_VERSION }));

      const linkPath = join(fixtureRoot, "node_modules", "@deepseek-ai", "dsh");
      mkdirSync(dirname(linkPath), { recursive: true });
      symlinkSync(realPackage, linkPath, "dir");

      const receipt = await runProbe({ projectRoot: fixtureRoot, expectVersion: FIXTURE_VERSION, now: FIXED_TIMESTAMP });
      expect(receipt.verdict).toBe("fail");
      expect(receipt.resolution.status).toBe("fail");
      expect(receipt.resolution.error?.code).toBe("DSH_PACKAGE_OUTSIDE_PROJECT_ROOT");
      expect(receipt.resolution.globalFallbackUsed).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("N9-T12: the gate path reads no clock and touches no network", async () => {
    const source = readFileSync(PROBE_PATH, "utf8");
    expect(source).not.toMatch(/node:https?/);
    expect(source).not.toMatch(/node:net\b/);
    expect(source).not.toMatch(/node:dns/);
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toMatch(/Date\.now\s*\(/);
    expect(source).not.toMatch(/Math\.random\s*\(/);

    // The only clock reading in the probe is the default for the receipt
    // timestamp, and it is injectable — so the gate path never uses it.
    const receipt = await probeFixture();
    expect(receipt.generatedAt).toBe(FIXED_TIMESTAMP);
  });
});
