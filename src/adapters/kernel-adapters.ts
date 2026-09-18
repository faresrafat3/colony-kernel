import type { Clock, Hasher, IdGenerator, TelemetrySink, TelemetryEntry } from "../ports/kernel-ports.js";
import { sha256Bytes, sha256Hex } from "../domain/support/sha256.js";

/** Fixed-instant clock: the whole mission runs at one injected instant. */
export class DeterministicClock implements Clock {
  constructor(private readonly instant: Date) {}
  now(): Date {
    return new Date(this.instant.getTime());
  }
}

/** Stepping clock: each read advances by a fixed step (deterministic ordering). */
export class SteppingClock implements Clock {
  private current: number;
  constructor(
    private readonly start: Date,
    private readonly stepMs: number = 1_000,
  ) {
    this.current = start.getTime();
  }
  now(): Date {
    const value = new Date(this.current);
    this.current += this.stepMs;
    return value;
  }
}

/**
 * Deterministic id/nonce generator: xorshift128+ over a fixed seed, formatted
 * as UUID v4 and 128-bit hex. Same seed ⇒ same identifiers ⇒ reproducible logs.
 */
export class DeterministicIdGenerator implements IdGenerator {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private counters = new Map<string, number>();

  constructor(seedHex: string) {
    // Seed expansion from arbitrary hex string.
    let acc = 0x9e3779b9;
    for (let i = 0; i < seedHex.length; i++) {
      acc = (Math.imul(acc, 0x85ebca6b) ^ seedHex.charCodeAt(i)) >>> 0;
    }
    this.s0 = acc >>> 0;
    this.s1 = (Math.imul(acc, 0xc2b2ae35) ^ 0xdeadbeef) >>> 0;
    this.s2 = (Math.imul(this.s1, 0x27d4eb2f) ^ 0x8badf00d) >>> 0;
    this.s3 = (Math.imul(this.s2, 0x165667b1) ^ 0xfeedface) >>> 0;
  }

  private nextU32(): number {
    // xorshift128+
    let t = this.s3;
    const s = this.s0;
    this.s3 = this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s0 = (t ^ s ^ (s >>> 19)) >>> 0;
    return this.s0 >>> 0;
  }

  private next128Hex(): string {
    let hex = "";
    for (let i = 0; i < 4; i++) hex += this.nextU32().toString(16).padStart(8, "0");
    return hex;
  }

  nextId(scope: string): string {
    const n = (this.counters.get(scope) ?? 0) + 1;
    this.counters.set(scope, n);
    return `${scope}-${String(n).padStart(4, "0")}-${this.next128Hex().slice(0, 8)}`;
  }

  nextUuid(): string {
    const hex = this.next128Hex();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }

  nextNonce(): string {
    return this.next128Hex() + this.next128Hex(); // 256 bits ≥ 128 bits
  }
}

/** Domain hasher adapter (pure sha256; no node:crypto anywhere). */
export class Sha256Hasher implements Hasher {
  sha256Hex(input: string): string {
    return sha256Hex(input);
  }
  sha256Bytes(input: Uint8Array): Uint8Array {
    return sha256Bytes(input);
  }
}

/** In-memory telemetry: deterministic, inspectable, no side channels. */
export class InMemoryTelemetry implements TelemetrySink {
  readonly entries: TelemetryEntry[] = [];
  record(entry: TelemetryEntry): void {
    this.entries.push(entry);
  }
}
