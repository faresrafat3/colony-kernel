/**
 * check-claims.mjs — the published test count must be the measured one.
 *
 * Why this gate exists: the count was stated in six places and drifted. The
 * landing page, the README, AGENTS.md and GOVERNANCE.md all published "67
 * offline tests" for weeks while 117 tests ran. A claim nobody checks is a
 * claim, not a fact — so this gate measures the count and refuses any
 * maintained surface that states another one.
 *
 * Records are exempt by construction, not by hope. Milestone artifacts
 * (reports/**, docs/TEST_TRACEABILITY.md, docs/IMPLEMENTATION_STATUS.md,
 * CHANGELOG.md) state what a past release verified; they are superseded, never
 * rewritten, and this gate does not read them. The list below is the complete
 * set of surfaces that must track HEAD.
 *
 * Exit codes: 0 all claims match · 1 a surface states a different count ·
 * 2 the count could not be measured (fail loud, never guess).
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Maintained surfaces, in the order a reader meets them. Terminal output is
// deliberately absent: publish-site.sh and verify.sh print what the gates
// measured, so a literal there would be a fourth copy of a number the run
// already states. Milestone records are absent on purpose (see the header).
const SURFACES = ["docs/site/index.html", "README.md", "AGENTS.md", "GOVERNANCE.md"];

// A count that a reader meets as the test count: "117 tests", "117 offline
// tests", "117 deterministic offline tests", the "117/117 tests" ratio, and
// the same number wrapped in markup (<b>117</b> offline tests). The gap may
// hold whitespace, markup and up to three words from ADJECTIVES. A word outside
// that list — "ran" in "66 ran tests" — breaks the match on purpose, so prose
// about a past record never reads as a live claim.
const ADJECTIVES = ["deterministic", "offline", "passing", "unit"];
const gap = `(?:[\\s]|&[a-z]+;|<\\/?[a-z]+>|[*_—·•,])*(?:\\/\\s*\\d+)?\\s*(?:(?:${ADJECTIVES.join("|")})\\s+){0,3}`;
const CLAIM = new RegExp(`\\b(\\d+)(?=${gap}tests\\b)`, "g");

function measure() {
  const dir = mkdtempSync(join(tmpdir(), "colony-kernel-claims-"));
  const out = join(dir, "vitest.json");
  try {
    const run = spawnSync(
      "npx",
      ["vitest", "run", "--reporter=json", `--outputFile=${out}`],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    if (run.status !== 0) {
      console.error(run.stderr || run.stdout || "vitest failed");
      return null;
    }
    const report = JSON.parse(readFileSync(out, "utf8"));
    if (!Number.isInteger(report.numTotalTests)) return null;
    return report.numTotalTests;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const measured = measure();
if (measured === null) {
  console.error("check-claims: could not measure the test count — refusing to pass (exit 2)");
  process.exit(2);
}

const stale = [];
const unchecked = [];
for (const file of SURFACES) {
  let text;
  try {
    text = readFileSync(join(root, file), "utf8");
  } catch {
    stale.push(`${file}: missing — a maintained surface disappeared`);
    continue;
  }
  let claims = 0;
  text.split("\n").forEach((line, i) => {
    for (const [, count] of line.matchAll(CLAIM)) {
      claims += 1;
      if (Number(count) !== measured) {
        stale.push(`${file}:${i + 1} says ${count} tests, measured ${measured}`);
      }
    }
  });
  // A surface that no longer states a count is no longer covered by this gate.
  // Say so instead of letting the coverage vanish quietly.
  if (claims === 0) unchecked.push(file);
}

if (stale.length > 0) {
  console.error(`check-claims: FAILED — ${stale.length} stale claim(s), measured ${measured}:`);
  for (const line of stale) console.error(`  ${line}`);
  console.error("Fix the claim or the test; never lower this gate to make it pass.");
  process.exit(1);
}

if (unchecked.length > 0) {
  console.error(`check-claims: FAILED — ${unchecked.length} listed surface(s) state no count:`);
  for (const file of unchecked) console.error(`  ${file}`);
  console.error("Restore the claim, or drop the file from SURFACES on purpose.");
  process.exit(1);
}

console.log(`gate claims: OK (${measured} tests, ${SURFACES.length} surfaces agree)`);