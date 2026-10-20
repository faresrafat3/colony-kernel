#!/usr/bin/env node
/**
 * dsh-compat-probe.mjs — the DSH startup compatibility probe (spec v0.1.1 §N9).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `docs/colony-kernel-v0.1.1.md` §N9 states, verbatim:
 *
 *   1. Adapter declares the exact tested DSH package version.
 *   2. Adapter records executable and package hashes.
 *   3. Startup executes a compatibility probe (required symbols/services/events present).
 *   4. Missing expected symbol/service/event → startup fails.
 *
 * The adapter itself (`colony-dsh-adapter`) is M2 work and does not exist yet,
 * so the probe is built here as a standalone, reusable module: the adapter
 * calls it at startup, and the pin decision rests on its output.
 *
 * TWO MODES
 *   --require            run the probe; exit non-zero with a loud, named
 *                        failure when a required symbol/service/event is missing
 *                        (this is the "startup fails" behaviour of §N9 req. 4)
 *   --json <path>        write the machine-readable receipt (version, hashes,
 *                        every requirement with its status, the verdict, the
 *                        timestamp)
 *
 * The process exits non-zero whenever the verdict is not PASS, in either mode.
 * `--require` additionally prints the loud failure block on stderr.
 *
 * WHAT COUNTS AS A REQUIRED SYMBOL / SERVICE / EVENT
 * ----------------------------------------------------
 * The requirement set below is derived from two normative sources and from
 * nothing else:
 *   - §N9's adapter contract: "Adapter exposes Colony-owned interfaces:
 *     `AgentRuntime`, `PromptAssembler`, `ToolDispatcher`, `SessionRecorder`,
 *     `SubagentSpawner`, `HumanApprovalTransport`, `LifecycleController`,
 *     `TelemetrySink`."
 *   - the DSH runtime's own public surface in the installed package: the
 *     exported symbol, the Cordis service name, and the wire event name that
 *     each Colony-owned interface needs from DSH.
 *
 * The DSH-mapping reference M08 named by the specification is NOT in this
 * repository — `docs/colony-kernel-v0.1.1-to-v0.1.1-delta.md` records the
 * section-by-section semantic mapping as an open, unwritten item. The probe
 * therefore reads the DSH surface from the installed package itself rather
 * than from a mapping document that does not exist. This is recorded as a
 * finding in `docs/dsh-compatibility-evidence.md`, not worked around.
 *
 * HOW EACH REQUIREMENT IS CHECKED
 * -------------------------------
 *   export   dynamic `import()` of the owning DSH package's entry point; the
 *            named export must exist on the module namespace. A runtime check.
 *   service  the owning package's installed source must register the Cordis
 *            service under that name (`super(ctx, "<name>")`). A source
 *            declaration check: it proves the name is declared by the
 *            installed build, not that a live context was booted.
 *   event    the owning package's installed source must contain the event
 *            name as a string literal. A source declaration check, for the
 *            same reason.
 *   file     the named file must exist inside the owning package, and its
 *            SHA-256 is recorded.
 *   identity the installed package version must equal the declared version.
 *   hash     the executable/package hashes are computed and recorded.
 *   integrity the tarball the lockfile (or a manually recorded `npm view`)
 *            names is re-hashed from the LOCAL npm cache and compared. No
 *            network access. "Unknown" is never reported as a pass.
 *
 * RESOLUTION RULE (no global fallback)
 * -------------------------------------
 * The DSH package is resolved ONLY from the project's own `node_modules`:
 * `<projectRoot>/node_modules/@deepseek-ai/dsh`. The resolved path — and the
 * path of every sub-package the probe loads — must stay under the project
 * root. A missing local install is a startup failure, never a reason to load
 * whatever the host happens to have installed globally. The probe never
 * consults a global install, so it cannot fall back to one.
 *
 * DETERMINISM
 * -----------
 * The probe performs no network access and no randomisation. The receipt's
 * timestamp is injectable (`--timestamp`, or `runProbe({ now })`), so a test
 * can run the whole gate path without touching the wall clock.
 *
 * Usage:
 *   node scripts/dsh-compat-probe.mjs --require
 *   node scripts/dsh-compat-probe.mjs --json reports/dsh-compat-probe-<v>.json
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The DSH package this kernel pins. */
export const DSH_PACKAGE = "@deepseek-ai/dsh";

/** The default project root: the repository that owns this script. */
export const DEFAULT_PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** The probe's own version, so a receipt states which probe produced it. */
export const PROBE_VERSION = 1;

/**
 * The required DSH surfaces, one record per check.
 *
 * `interface` is the Colony-owned interface from §N9 that needs the surface.
 * `package`   is the DSH package that owns the surface.
 * `symbol`    is the exported name / service name / event name.
 * `spec`      is the §N9 requirement the check answers.
 */
export const ADAPTER_REQUIREMENTS = Object.freeze([
  // ---- AgentRuntime -------------------------------------------------------
  { id: "agent-runtime.export.AgentRegistry", interface: "AgentRuntime", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-agent", symbol: "AgentRegistry", surface: "exported symbol AgentRegistry" },
  { id: "agent-runtime.service.agents", interface: "AgentRuntime", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-agent", symbol: "agents", surface: "Cordis service name agents" },
  { id: "agent-runtime.event.agent-status", interface: "AgentRuntime", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-agent-loop", symbol: "agent/status", surface: "event name agent/status" },
  { id: "agent-runtime.export.AgentLoop", interface: "AgentRuntime", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-agent-loop", symbol: "AgentLoop", surface: "exported symbol AgentLoop" },
  { id: "agent-runtime.service.agentLoop", interface: "AgentRuntime", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-agent-loop", symbol: "agentLoop", surface: "Cordis service name agentLoop" },

  // ---- PromptAssembler ----------------------------------------------------
  { id: "prompt-assembler.export.SystemPrompt", interface: "PromptAssembler", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-system-prompt", symbol: "SystemPrompt", surface: "exported symbol SystemPrompt" },
  { id: "prompt-assembler.service.systemPrompt", interface: "PromptAssembler", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-system-prompt", symbol: "systemPrompt", surface: "Cordis service name systemPrompt" },
  { id: "prompt-assembler.event.system-prompt-assemble", interface: "PromptAssembler", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-system-prompt", symbol: "system-prompt/assemble", surface: "event name system-prompt/assemble" },

  // ---- ToolDispatcher -----------------------------------------------------
  { id: "tool-dispatcher.export.ToolRuntime", interface: "ToolDispatcher", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-tools", symbol: "ToolRuntime", surface: "exported symbol ToolRuntime" },
  { id: "tool-dispatcher.service.tools", interface: "ToolDispatcher", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-tools", symbol: "tools", surface: "Cordis service name tools" },
  { id: "tool-dispatcher.event.tools-change", interface: "ToolDispatcher", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-tools", symbol: "tools/change", surface: "event name tools/change" },
  { id: "tool-dispatcher.export.defineTool", interface: "ToolDispatcher", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-tools", symbol: "defineTool", surface: "exported symbol defineTool" },

  // ---- SessionRecorder ----------------------------------------------------
  { id: "session-recorder.export.SessionStore", interface: "SessionRecorder", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-session", symbol: "SessionStore", surface: "exported symbol SessionStore" },
  { id: "session-recorder.service.sessions", interface: "SessionRecorder", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-session", symbol: "sessions", surface: "Cordis service name sessions" },
  { id: "session-recorder.event.session-event", interface: "SessionRecorder", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-session", symbol: "session/event", surface: "event name session/event" },
  { id: "session-recorder.event.session-created", interface: "SessionRecorder", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-session", symbol: "session/created", surface: "event name session/created" },
  { id: "session-recorder.export.KNOWN_SESSION_EVENT_TYPES", interface: "SessionRecorder", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-session", symbol: "KNOWN_SESSION_EVENT_TYPES", surface: "exported symbol KNOWN_SESSION_EVENT_TYPES" },

  // ---- SubagentSpawner ----------------------------------------------------
  { id: "subagent-spawner.export.SubagentRuntime", interface: "SubagentSpawner", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-subagent", symbol: "SubagentRuntime", surface: "exported symbol SubagentRuntime" },
  { id: "subagent-spawner.service.subagents", interface: "SubagentSpawner", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-subagent", symbol: "subagents", surface: "Cordis service name subagents" },
  { id: "subagent-spawner.event.subagent-start", interface: "SubagentSpawner", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-subagent", symbol: "subagent/start", surface: "event name subagent/start" },
  { id: "subagent-spawner.export.SubagentRunId", interface: "SubagentSpawner", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-subagent", symbol: "SubagentRunId", surface: "exported symbol SubagentRunId" },

  // ---- HumanApprovalTransport --------------------------------------------
  { id: "human-approval.export.ApprovalService", interface: "HumanApprovalTransport", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-user-approval", symbol: "ApprovalService", surface: "exported symbol ApprovalService" },
  { id: "human-approval.service.approval", interface: "HumanApprovalTransport", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-user-approval", symbol: "approval", surface: "Cordis service name approval" },
  { id: "human-approval.export.APPROVAL_POLICIES", interface: "HumanApprovalTransport", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-user-approval", symbol: "APPROVAL_POLICIES", surface: "exported symbol APPROVAL_POLICIES" },
  { id: "human-approval.event.approval-request", interface: "HumanApprovalTransport", spec: "N9.3", kind: "event", package: "@deepseek-ai/dsh-user-approval", symbol: "approval/request", surface: "event name approval/request" },

  // ---- LifecycleController ------------------------------------------------
  { id: "lifecycle.export.boot", interface: "LifecycleController", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-app-boot", symbol: "boot", surface: "exported symbol boot" },
  { id: "lifecycle.export.installFailLoud", interface: "LifecycleController", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-app-boot", symbol: "installFailLoud", surface: "exported symbol installFailLoud" },
  { id: "lifecycle.export.initProfile", interface: "LifecycleController", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-app-boot", symbol: "initProfile", surface: "exported symbol initProfile" },
  { id: "lifecycle.export.Service", interface: "LifecycleController", spec: "N9.3", kind: "export", package: "@deepseek-ai/cordis", symbol: "Service", surface: "exported symbol Service (the disposer-owning service base every DSH service extends)" },

  // ---- TelemetrySink ------------------------------------------------------
  { id: "telemetry.export.SessionTelemetryCoordinator", interface: "TelemetrySink", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-session-telemetry", symbol: "SessionTelemetryCoordinator", surface: "exported symbol SessionTelemetryCoordinator" },
  { id: "telemetry.service.sessionTelemetry", interface: "TelemetrySink", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-session-telemetry", symbol: "sessionTelemetry", surface: "Cordis service name sessionTelemetry" },
  { id: "telemetry.export.TokenMeter", interface: "TelemetrySink", spec: "N9.3", kind: "export", package: "@deepseek-ai/dsh-token-meter", symbol: "TokenMeter", surface: "exported symbol TokenMeter" },
  { id: "telemetry.service.tokenMeter", interface: "TelemetrySink", spec: "N9.3", kind: "service", package: "@deepseek-ai/dsh-token-meter", symbol: "tokenMeter", surface: "Cordis service name tokenMeter" },
]);

/** The DSH packages the adapter depends on, in a stable order. */
export const ADAPTER_DEPENDENCY_PACKAGES = Object.freeze([
  ...new Set(ADAPTER_REQUIREMENTS.map((r) => r.package)),
].sort());

/** A probe failure that carries a machine-readable code. */
export class DshProbeError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "DshProbeError";
    this.code = code;
    this.details = details ?? {};
  }
}

function sha256Hex(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sha512Base64(buffer) {
  return createHash("sha512").update(buffer).digest("base64");
}

/** True when `target` is `root` itself or lives under it. */
export function isUnder(root, target) {
  if (target === root) return true;
  return target.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Resolve the DSH package from the project's own node_modules.
 *
 * There is no global fallback, by construction: this function only ever
 * looks at `<projectRoot>/node_modules/@deepseek-ai/dsh`. It never consults
 * the npm global prefix, PATH, or any other install.
 *
 * @param {string} projectRoot
 * @returns {{root: string, packageDir: string, candidate: string}}
 */
export function resolveDshPackage(projectRoot) {
  const root = realpathSync(resolve(projectRoot));
  const candidate = join(root, "node_modules", ...DSH_PACKAGE.split("/"));
  if (!existsSync(join(candidate, "package.json"))) {
    throw new DshProbeError(
      "DSH_PACKAGE_NOT_RESOLVED",
      `${DSH_PACKAGE} did not resolve from the project's own node_modules. ` +
        `Expected it at ${candidate}. ` +
        `A global install is never used as a fallback: a missing local install ` +
        `is a startup failure, not a reason to load whatever the host happens ` +
        `to have installed.`,
      { candidate, projectRoot: root, globalFallbackUsed: false },
    );
  }
  const packageDir = realpathSync(candidate);
  if (!isUnder(root, packageDir)) {
    throw new DshProbeError(
      "DSH_PACKAGE_OUTSIDE_PROJECT_ROOT",
      `${DSH_PACKAGE} resolved to ${packageDir}, which is outside the project root ${root}. ` +
        `The probe refuses to load a package from outside the project.`,
      { candidate, resolvedPath: packageDir, projectRoot: root, globalFallbackUsed: false },
    );
  }
  return { root, packageDir, candidate };
}

/**
 * Resolve a DSH sub-package the way Node does: walk up from the DSH package
 * directory, looking into each `node_modules`. The result must stay under
 * the project root, exactly like the DSH package itself.
 *
 * @param {string} fromDir directory the lookup starts from
 * @param {string} packageName
 * @param {string} projectRoot
 * @returns {string} the resolved package directory
 */
export function resolveSubPackageDir(fromDir, packageName, projectRoot) {
  let dir = resolve(fromDir);
  for (;;) {
    // Node's own rule: an ancestor directory that is itself named
    // "node_modules" is skipped, so `<x>/node_modules/node_modules` is never
    // a candidate. The walk below is that rule, not an approximation.
    if (basename(dir) !== "node_modules") {
      const candidate = join(dir, "node_modules", ...packageName.split("/"));
      if (existsSync(join(candidate, "package.json"))) {
        const real = realpathSync(candidate);
        if (!isUnder(projectRoot, real)) {
          throw new DshProbeError(
            "DSH_SUBPACKAGE_OUTSIDE_PROJECT_ROOT",
            `${packageName} resolved to ${real}, which is outside the project root ${projectRoot}.`,
            { packageName, resolvedPath: real, projectRoot },
          );
        }
        return real;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new DshProbeError(
    "DSH_SUBPACKAGE_NOT_RESOLVED",
    `${packageName} could not be resolved from ${fromDir} upwards.`,
    { packageName, fromDir },
  );
}

/** Read a package's `package.json`. */
export function readPackageJson(packageDir) {
  return JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
}

/** The entry file of a package, honouring `exports` then `main`. */
export function packageEntryFile(packageDir, pkg) {
  const exportsField = pkg.exports;
  let rel = null;
  if (typeof exportsField === "string") {
    rel = exportsField;
  } else if (exportsField && typeof exportsField === "object") {
    const root = exportsField["."];
    if (typeof root === "string") rel = root;
    else if (root && typeof root === "object") rel = root.default ?? root.import ?? root.node ?? null;
  }
  rel = rel ?? pkg.main ?? "index.js";
  return join(packageDir, rel.replace(/^\.\//, ""));
}

/** Every `.js`/`.mjs` file under `dir`, as absolute paths, sorted. */
function listSourceFiles(dir) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
}

/**
 * Every file under a package directory except nested `node_modules`, as
 * [relativePath, absolutePath] pairs, sorted by relative path.
 */
export function listPackageFiles(packageDir) {
  const out = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
      } else if (entry.isFile()) {
        out.push([relative(packageDir, full).split(sep).join("/"), full]);
      }
    }
  };
  walk(packageDir);
  out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return out;
}

/**
 * The content hash of a package: sha256 over the manifest lines
 * `"<sha256 of file>  <relative path>\n"` for every file of the package
 * except nested `node_modules`, in sorted relative-path order.
 *
 * The definition is part of the receipt, so the value is reproducible by a
 * reader without reading this file.
 */
export function packageContentHash(packageDir) {
  const hash = createHash("sha256");
  for (const [rel, abs] of listPackageFiles(packageDir)) {
    hash.update(`${sha256Hex(readFileSync(abs))}  ${rel}\n`);
  }
  return hash.digest("hex");
}

/** The same content hash, over several package directories at once. */
export function dependencySetHash(packageDirs) {
  const hash = createHash("sha256");
  for (const dir of [...packageDirs].sort()) {
    const pkg = readPackageJson(dir);
    hash.update(`${pkg.name}@${pkg.version}\n`);
    for (const [rel, abs] of listPackageFiles(dir)) {
      hash.update(`${sha256Hex(readFileSync(abs))}  ${pkg.name}/${rel}\n`);
    }
  }
  return hash.digest("hex");
}

/** Locate the npm cache's content-addressed blob for an integrity string. */
export function npmCacheBlobPath(integrity, cacheDir) {
  const match = /^([a-z0-9]+)-(.+)$/i.exec(integrity);
  if (!match) return null;
  const algorithm = match[1].toLowerCase();
  const hex = Buffer.from(match[2], "base64").toString("hex");
  return join(cacheDir, "_cacache", "content-v2", algorithm, hex.slice(0, 2), hex.slice(2, 4), hex.slice(4));
}

/**
 * Verify a tarball against a recorded integrity value using the LOCAL npm
 * cache. No network access is performed.
 *
 * @returns {{status: string, expected: string, tarballFound: boolean, recomputed: string|null, tarballPath: string|null, detail: string}}
 */
export function verifyTarballIntegrity(expectedIntegrity, cacheDir) {
  const blobPath = npmCacheBlobPath(expectedIntegrity, cacheDir);
  if (!blobPath) {
    return {
      status: "not-verified",
      expected: expectedIntegrity,
      tarballFound: false,
      recomputed: null,
      tarballPath: null,
      detail: `the recorded integrity string is not in a recognised "<algorithm>-<base64>" form`,
    };
  }
  if (!existsSync(blobPath)) {
    return {
      status: "not-verified",
      expected: expectedIntegrity,
      tarballFound: false,
      recomputed: null,
      tarballPath: blobPath,
      detail: `the tarball named by the recorded integrity is not in the local npm cache (${blobPath}); it cannot be re-hashed without the network`,
    };
  }
  const recomputed = sha512Base64(readFileSync(blobPath));
  const matches = recomputed === expectedIntegrity.split("-")[1];
  return {
    status: matches ? "pass" : "fail",
    expected: expectedIntegrity,
    tarballFound: true,
    recomputed: `sha512-${recomputed}`,
    tarballPath: blobPath,
    detail: matches
      ? "the cached tarball re-hashes to the recorded integrity"
      : "the cached tarball does NOT re-hash to the recorded integrity",
  };
}

/** Check one requirement against the installed packages. */
async function checkRequirement(requirement, context) {
  const base = {
    id: requirement.id,
    interface: requirement.interface,
    spec: requirement.spec,
    kind: requirement.kind,
    package: requirement.package,
    symbol: requirement.symbol,
    surface: requirement.surface,
  };
  let packageDir;
  try {
    packageDir = context.subPackages.get(requirement.package);
  } catch (error) {
    return {
      ...base,
      status: "fail",
      detail: `the owning package could not be resolved: ${error.message}`,
      evidence: null,
    };
  }
  if (!packageDir) {
    return {
      ...base,
      status: "fail",
      detail: `the owning package ${requirement.package} is not installed in this tree`,
      evidence: null,
    };
  }

  if (requirement.kind === "export") {
    const pkg = readPackageJson(packageDir);
    const entry = packageEntryFile(packageDir, pkg);
    try {
      const mod = await import(pathToFileURL(entry).href);
      if (requirement.symbol in mod) {
        return {
          ...base,
          status: "pass",
          detail: `the export ${requirement.symbol} is present on the module namespace of ${entry}`,
          evidence: { file: relative(context.packageDir, entry) || entry, kind: "runtime-import" },
        };
      }
      return {
        ...base,
        status: "fail",
        detail: `the export ${requirement.symbol} is ABSENT from the module namespace of ${entry}`,
        evidence: { file: relative(context.packageDir, entry) || entry, kind: "runtime-import" },
      };
    } catch (error) {
      return {
        ...base,
        status: "fail",
        detail: `importing ${entry} failed: ${error.message}`,
        evidence: { file: relative(context.packageDir, entry) || entry, kind: "runtime-import" },
      };
    }
  }

  if (requirement.kind === "service") {
    const needle = `super(ctx, "${requirement.symbol}")`;
    for (const file of listSourceFiles(packageDir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(needle)) {
          return {
            ...base,
            status: "pass",
            detail: `the Cordis service "${requirement.symbol}" is registered in ${relative(context.packageDir, file)}`,
            evidence: { file: relative(context.packageDir, file), line: i + 1, kind: "service-declaration" },
          };
        }
      }
    }
    return {
      ...base,
      status: "fail",
      detail: `the Cordis service "${requirement.symbol}" is NOT registered by ${requirement.package} (no \`${needle}\` in its installed source)`,
      evidence: null,
    };
  }

  if (requirement.kind === "event") {
    const needle = `"${requirement.symbol}"`;
    const alt = `'${requirement.symbol}'`;
    for (const file of listSourceFiles(packageDir)) {
      const lines = readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].includes(needle) || lines[i].includes(alt)) {
          return {
            ...base,
            status: "pass",
            detail: `the event "${requirement.symbol}" is declared in ${relative(context.packageDir, file)}`,
            evidence: { file: relative(context.packageDir, file), line: i + 1, kind: "event-declaration" },
          };
        }
      }
    }
    return {
      ...base,
      status: "fail",
      detail: `the event "${requirement.symbol}" is NOT declared by ${requirement.package} (the name does not appear in its installed source)`,
      evidence: null,
    };
  }

  if (requirement.kind === "file") {
    const target = join(packageDir, requirement.symbol);
    if (!existsSync(target)) {
      return { ...base, status: "fail", detail: `the file ${requirement.symbol} is missing from ${requirement.package}`, evidence: null };
    }
    const bytes = readFileSync(target);
    return {
      ...base,
      status: "pass",
      detail: `the file ${requirement.symbol} is present`,
      evidence: { file: relative(context.packageDir, target), sha256: sha256Hex(bytes), bytes: bytes.length, kind: "file-hash" },
    };
  }

  return { ...base, status: "fail", detail: `unknown requirement kind ${requirement.kind}`, evidence: null };
}

/**
 * Run the probe.
 *
 * @param {object} options
 * @param {string} [options.projectRoot]      root whose node_modules owns the DSH install
 * @param {string} [options.expectVersion]     the version the adapter declares (§N9 req. 1)
 * @param {string} [options.lockfile]         lockfile to read the recorded integrity from
 * @param {string} [options.expectedIntegrity] integrity to verify (used when the lockfile has no entry)
 * @param {string} [options.integritySource]   where that integrity came from ("lockfile" | "manual-npm-view")
 * @param {string} [options.npmCache]         npm cache directory (default: ~/.npm)
 * @param {string} [options.now]              receipt timestamp (injectable: no wall clock needed)
 * @param {Array}  [options.requirements]      the requirement set to check
 * @param {string} [options.command]           the command that produced this receipt
 * @returns {Promise<object>} the receipt
 */
export async function runProbe(options = {}) {
  const requirements = options.requirements ?? ADAPTER_REQUIREMENTS;
  const projectRootInput = options.projectRoot ?? DEFAULT_PROJECT_ROOT;
  const npmCache = options.npmCache ?? join(homedir(), ".npm");
  const now = options.now ?? new Date().toISOString();

  const receipt = {
    receiptVersion: PROBE_VERSION,
    kind: "dsh-compat-probe-receipt",
    generatedAt: now,
    probe: {
      path: "scripts/dsh-compat-probe.mjs",
      sha256: sha256Hex(readFileSync(fileURLToPath(import.meta.url))),
    },
    spec: {
      document: "docs/colony-kernel-v0.1.1.md",
      section: "N9",
      requirements: ["N9.1", "N9.2", "N9.3", "N9.4"],
    },
    command: options.command ?? null,
    projectRoot: null,
    resolution: null,
    package: null,
    requirements: [],
    missing: [],
    capabilityVerdict: "fail",
    identityVerdict: "fail",
    verdict: "fail",
    errors: [],
  };

  let resolved;
  try {
    resolved = resolveDshPackage(projectRootInput);
  } catch (error) {
    receipt.projectRoot = resolve(projectRootInput);
    receipt.resolution = {
      packageName: DSH_PACKAGE,
      candidatePath: error.details?.candidate ?? null,
      resolvedPath: null,
      resolvedWithinProjectRoot: false,
      globalFallbackUsed: false,
      globalFallbackPolicy:
        "The DSH package is resolved only from the project's own node_modules. A global install is never used as a fallback.",
      status: "fail",
      error: { code: error.code ?? "RESOLUTION_ERROR", message: error.message },
    };
    receipt.errors.push({ code: error.code ?? "RESOLUTION_ERROR", message: error.message });
    return receipt;
  }

  receipt.projectRoot = resolved.root;
  receipt.resolution = {
    packageName: DSH_PACKAGE,
    candidatePath: resolved.candidate,
    resolvedPath: resolved.packageDir,
    resolvedWithinProjectRoot: isUnder(resolved.root, resolved.packageDir),
    globalFallbackUsed: false,
    globalFallbackPolicy:
      "The DSH package is resolved only from the project's own node_modules. A global install is never used as a fallback.",
    status: "pass",
  };

  const pkg = readPackageJson(resolved.packageDir);
  const installedVersion = pkg.version ?? null;

  // --- §N9 req. 1: the declared version and the installed version -----------
  const declaredVersion = options.expectVersion ?? readDeclaredPin(resolved.root) ?? null;
  const versionIdentity =
    declaredVersion === null
      ? { status: "not-verified", detail: "no declared version was supplied and the project root states no pin" }
      : installedVersion === declaredVersion
        ? { status: "pass", detail: `the installed package version ${installedVersion} equals the declared version ${declaredVersion}` }
        : { status: "fail", detail: `the installed package version ${installedVersion} does NOT equal the declared version ${declaredVersion}` };

  // --- §N9 req. 2: executable and package hashes ---------------------------
  const binField = pkg.bin;
  const binTarget = typeof binField === "string" ? binField : binField?.dsh ?? null;
  let executable = null;
  if (binTarget) {
    const abs = join(resolved.packageDir, binTarget.replace(/^\.\//, ""));
    if (existsSync(abs)) {
      const bytes = readFileSync(abs);
      executable = { path: binTarget, sha256: sha256Hex(bytes), bytes: bytes.length };
    } else {
      executable = { path: binTarget, sha256: null, bytes: null, error: "the declared bin target does not exist" };
    }
  } else {
    executable = { path: null, sha256: null, bytes: null, error: "the package declares no bin target" };
  }
  const packageSha256 = packageContentHash(resolved.packageDir);

  // --- the lockfile's recorded integrity, verified without the network ------
  const lockfilePath = options.lockfile ?? defaultLockfile(resolved.root);
  let lockfileInfo = null;
  let expectedIntegrity = options.expectedIntegrity ?? null;
  let integritySource = options.integritySource ?? (options.expectedIntegrity ? "manual-npm-view" : null);
  if (lockfilePath && existsSync(lockfilePath)) {
    const lockBytes = readFileSync(lockfilePath);
    lockfileInfo = { path: lockfilePath, sha256: sha256Hex(lockBytes), bytes: lockBytes.length };
    let entry = null;
    try {
      const lock = JSON.parse(lockBytes.toString("utf8"));
      const key = `node_modules/${DSH_PACKAGE}`;
      entry = lock.packages?.[key] ?? null;
    } catch {
      entry = null;
    }
    if (entry) {
      lockfileInfo.entry = { version: entry.version, resolved: entry.resolved ?? null, integrity: entry.integrity ?? null };
      if (!expectedIntegrity && entry.integrity) {
        expectedIntegrity = entry.integrity;
        integritySource = "lockfile";
      }
    } else {
      lockfileInfo.entry = null;
    }
  } else {
    lockfileInfo = { path: lockfilePath ?? null, sha256: null, bytes: null, entry: null, error: "no lockfile was found" };
  }

  const integrity = expectedIntegrity
    ? { source: integritySource ?? "unknown", ...verifyTarballIntegrity(expectedIntegrity, npmCache) }
    : {
        source: null,
        status: "not-applicable",
        expected: null,
        tarballFound: false,
        recomputed: null,
        tarballPath: null,
        detail: "no integrity value is recorded for this version, so there is nothing to verify",
      };

  // --- §N9 req. 3 + 4: the required surfaces ------------------------------
  const subPackages = new Map();
  const subPackageErrors = [];
  for (const name of ADAPTER_DEPENDENCY_PACKAGES) {
    try {
      subPackages.set(name, resolveSubPackageDir(resolved.packageDir, name, resolved.root));
    } catch (error) {
      subPackages.set(name, null);
      subPackageErrors.push({ package: name, code: error.code ?? "RESOLUTION_ERROR", message: error.message });
    }
  }
  for (const error of subPackageErrors) receipt.errors.push({ code: error.code, message: error.message, package: error.package });

  const context = { packageDir: resolved.packageDir, subPackages };
  const results = [];
  for (const requirement of requirements) {
    results.push(await checkRequirement(requirement, context));
  }
  receipt.requirements = results;

  const dependencyDirs = [...subPackages.values()].filter((dir) => typeof dir === "string");
  let dependencySetSha256 = null;
  try {
    dependencySetSha256 = dependencySetHash([resolved.packageDir, ...dependencyDirs]);
  } catch (error) {
    receipt.errors.push({ code: "DEPENDENCY_SET_HASH_FAILED", message: error.message });
  }

  receipt.package = {
    name: pkg.name ?? DSH_PACKAGE,
    declaredVersion,
    installedVersion,
    versionIdentity,
    executable,
    packageSha256,
    packageSha256Definition:
      "sha256 over the manifest lines \"<sha256 of file>  <relative path>\\n\" for every file of the package except nested node_modules, in sorted relative-path order",
    dependencySetPackages: ADAPTER_DEPENDENCY_PACKAGES,
    dependencySetSha256,
    lockfile: lockfileInfo,
    integrity,
    subPackageVersions: Object.fromEntries(
      [...subPackages.entries()]
        .filter(([, dir]) => typeof dir === "string")
        .map(([name, dir]) => [name, readPackageJson(dir).version ?? null]),
    ),
  };

  // --- verdicts -------------------------------------------------------------
  const capabilityResults = results.filter((r) => r.spec === "N9.3");
  const capabilityFailures = capabilityResults.filter((r) => r.status !== "pass");
  const identityChecks = [versionIdentity, { status: executable?.sha256 ? "pass" : "fail", detail: executable?.error ?? "the executable hash was recorded" }, { status: packageSha256 ? "pass" : "fail", detail: "the package hash was recorded" }, integrity];
  const identityFailures = identityChecks.filter((c) => c.status !== "pass" && c.status !== "not-applicable");

  receipt.missing = capabilityFailures.map((r) => ({
    id: r.id,
    interface: r.interface,
    kind: r.kind,
    package: r.package,
    symbol: r.symbol,
    surface: r.surface,
    detail: r.detail,
  }));
  receipt.identityChecks = identityChecks;
  receipt.capabilityVerdict = capabilityFailures.length === 0 ? "pass" : "fail";
  receipt.identityVerdict = identityFailures.length === 0 ? "pass" : "fail";
  receipt.verdict = receipt.capabilityVerdict === "pass" && receipt.identityVerdict === "pass" ? "pass" : "fail";
  return receipt;
}

/** The version the project's package.json pins, if it states one. */
export function readDeclaredPin(projectRoot) {
  const file = join(projectRoot, "package.json");
  if (!existsSync(file)) return null;
  try {
    const pkg = JSON.parse(readFileSync(file, "utf8"));
    const declared = pkg.dependencies?.[DSH_PACKAGE] ?? pkg.devDependencies?.[DSH_PACKAGE] ?? null;
    return typeof declared === "string" ? declared : null;
  } catch {
    return null;
  }
}

function defaultLockfile(projectRoot) {
  const file = join(projectRoot, "package-lock.json");
  return existsSync(file) ? file : null;
}

/** The loud, named failure block §N9 req. 4 asks for. */
export function formatFailure(receipt) {
  const lines = [];
  lines.push("DSH COMPAT PROBE: FAILED — the DSH runtime does not satisfy the adapter contract.");
  lines.push(`  probe:   ${receipt.probe.path} (receipt v${receipt.receiptVersion})`);
  lines.push(`  package: ${receipt.package?.name ?? DSH_PACKAGE} ${receipt.package?.installedVersion ?? "not resolved"}`);
  lines.push(`  root:    ${receipt.projectRoot}`);
  if (receipt.resolution?.error) {
    lines.push(`  resolution error [${receipt.resolution.error.code}]: ${receipt.resolution.error.message}`);
  }
  if (receipt.missing.length > 0) {
    lines.push(`  missing ${receipt.missing.length} required item(s):`);
    for (const item of receipt.missing) {
      lines.push(`    - ${item.id}: ${item.surface} (${item.kind}) is required by ${item.interface} but ${item.detail}`);
    }
  }
  for (const error of receipt.errors ?? []) {
    lines.push(`  error [${error.code}]: ${error.message}`);
  }
  lines.push("  Startup must fail here. Do not fall back to another DSH install and do not continue with a degraded runtime.");
  return lines.join("\n");
}

/** A one-line human summary. */
export function formatSummary(receipt) {
  const passed = receipt.requirements.filter((r) => r.status === "pass").length;
  const total = receipt.requirements.length;
  return [
    `dsh-compat-probe: ${receipt.package?.name ?? DSH_PACKAGE} ${receipt.package?.installedVersion ?? "unresolved"}`,
    `  surfaces:   ${passed}/${total} pass`,
    `  capability: ${receipt.capabilityVerdict}`,
    `  identity:   ${receipt.identityVerdict}`,
    `  VERDICT:    ${receipt.verdict.toUpperCase()}`,
  ].join("\n");
}

function parseArgs(argv) {
  const args = {
    require: false,
    json: null,
    printJson: false,
    projectRoot: null,
    expectVersion: null,
    lockfile: null,
    expectedIntegrity: null,
    integritySource: null,
    npmCache: null,
    timestamp: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new DshProbeError("USAGE", `${arg} needs a value`);
      i += 1;
      return value;
    };
    switch (arg) {
      case "--require": args.require = true; break;
      case "--json": args.json = next(); break;
      case "--print-json": args.printJson = true; break;
      case "--project-root": args.projectRoot = next(); break;
      case "--expect-version": args.expectVersion = next(); break;
      case "--lockfile": args.lockfile = next(); break;
      case "--expected-integrity": args.expectedIntegrity = next(); break;
      case "--integrity-source": args.integritySource = next(); break;
      case "--npm-cache": args.npmCache = next(); break;
      case "--timestamp": args.timestamp = next(); break;
      case "--help":
      case "-h": args.help = true; break;
      default:
        throw new DshProbeError("USAGE", `unknown argument ${arg}`);
    }
  }
  return args;
}

const USAGE = `dsh-compat-probe — the §N9 startup compatibility probe.

  node scripts/dsh-compat-probe.mjs --require [options]
  node scripts/dsh-compat-probe.mjs --json <receipt.json> [options]

  --require               gate mode: exit non-zero with a loud, named failure
                          when a required symbol/service/event is missing
  --json <path>           write the machine-readable receipt to <path>
  --print-json            also print the receipt on stdout
  --project-root <dir>    root whose node_modules owns the DSH install
                          (default: the repository that owns this script)
  --expect-version <v>    the version the adapter declares (§N9 req. 1)
                          (default: the pin in <project-root>/package.json)
  --lockfile <path>       lockfile to read the recorded integrity from
  --expected-integrity <s>  integrity to verify when the lockfile has no entry
  --integrity-source <s>  where that value came from (e.g. "manual-npm-view")
  --npm-cache <dir>       npm cache directory (default: ~/.npm)
  --timestamp <iso>       receipt timestamp; injectable so no test needs a clock

The probe never falls back to a global DSH install.`;

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 2;
  }
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  if (!args.require && !args.json && !args.printJson) {
    process.stderr.write(`nothing to do: pass --require, --json <path> or --print-json.\n\n${USAGE}\n`);
    return 2;
  }

  const command = `node scripts/dsh-compat-probe.mjs ${argv.join(" ")}`.trim();
  const receipt = await runProbe({
    projectRoot: args.projectRoot ?? undefined,
    expectVersion: args.expectVersion ?? undefined,
    lockfile: args.lockfile ?? undefined,
    expectedIntegrity: args.expectedIntegrity ?? undefined,
    integritySource: args.integritySource ?? undefined,
    npmCache: args.npmCache ?? undefined,
    now: args.timestamp ?? undefined,
    command,
  });
  receipt.exitStatus = receipt.verdict === "pass" ? 0 : 1;

  if (args.json) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const dir = dirname(resolve(args.json));
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(args.json, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (args.printJson) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`${formatSummary(receipt)}\n`);
  if (receipt.verdict !== "pass" && args.require) process.stderr.write(`${formatFailure(receipt)}\n`);
  return receipt.exitStatus;
}

const invokedDirectly = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = await main();
}
