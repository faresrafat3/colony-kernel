// Extracts the EDGES/ATTACKS tables from the site's inline script and
// asserts the checker's behaviour against the real stage machine.
// Catches a dishonest demo: an attack labelled "refused at stage table"
// that is actually a legal edge.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Build a module from the data tables only (strip DOM wiring + fetch).
const dataOnly = script
  .replace(/function answer[\s\S]*$/, "")
  .replace(/document\.querySelectorAll[\s\S]*$/, "");
const mod = new Function(dataOnly + "\nreturn { EDGES, ATTACKS, PUBLISH };");
const { EDGES, ATTACKS, PUBLISH } = mod();

let fail = 0;
console.log("═══ live-checker consistency ═══");
for (const [key, a] of Object.entries(ATTACKS)) {
  const legal = (EDGES[a.from] || []).includes(a.to);
  let verdict;
  if (a.layer === "deep") {
    // must actually be a legal edge, else the "denied deeper" label lies
    verdict = legal ? "ok (legal edge, refused deeper — honest)" : "LIE: labelled deep but stage-illegal";
    if (!legal) fail++;
  } else {
    verdict = !legal ? "ok (stage table refuses it)" : "LIE: labelled refused@stage but it is legal";
    if (legal) fail++;
  }
  console.log(`  ${key.padEnd(16)} ${a.from} → ${a.to.padEnd(22)} ${verdict}`);
}

// every deep-labelled attack must point at an edge that exists
console.log("\n═══ no fabricated refusals ═══");
const deeps = Object.entries(ATTACKS).filter(([, a]) => a.layer === "deep");
for (const [key, a] of deeps) {
  const ok = (EDGES[a.from] || []).includes(a.to);
  if (!ok) { console.log(`  ${key}: deep but no such edge — dishonest`); fail++; }
}
console.log(`  ${deeps.length} deep-labelled attacks, all on real edges: ${fail === 0}`);

// the three hard stage-table refusals must be genuinely absent
console.log("\n═══ stage refusals are real ═══");
const stages = Object.entries(ATTACKS).filter(([, a]) => a.layer === "stage");
for (const [key, a] of stages) {
  const present = (EDGES[a.from] || []).includes(a.to);
  if (present) { console.log(`  ${key}: claimed refused but edge exists — dishonest`); fail++; }
  else console.log(`  ${key}: no ${a.from}→${a.to} edge in the table — real refusal`);
}

// every data-attack value on a button must be a key of ATTACKS, and every
// key of ATTACKS must be triggered by exactly one button
console.log("\n═══ buttons match the attack table ═══");
const buttonKeys = [...html.matchAll(/data-attack="([^"]*)"/g)].map(m => m[1]);
const attackKeys = Object.keys(ATTACKS);
const attackKeySet = new Set(attackKeys);
let wiringOk = true;
for (const key of buttonKeys) {
  if (!attackKeySet.has(key)) {
    console.log(`  button "${key}": not a key of ATTACKS`);
    wiringOk = false;
    fail++;
  }
}
for (const key of attackKeys) {
  const hits = buttonKeys.filter(k => k === key).length;
  if (hits !== 1) {
    console.log(`  attack "${key}": triggered by ${hits} buttons, expected exactly 1`);
    wiringOk = false;
    fail++;
  }
}
console.log(`  ${wiringOk ? "PASS" : "FAIL"}: ${buttonKeys.length} data-attack values, all keys of ATTACKS; ${attackKeys.length} attack keys, each triggered by exactly one button`);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${fail} dishonest label(s)`);
process.exit(fail === 0 ? 0 : 1);
