/** Injected wall clock. Kernel time is always injected, never ambient (N6, N1 req 8). */
export interface Clock {
  now(): Date;
}

/** Content hashing (Colony-owned port; adapter binds the implementation). */
export interface Hasher {
  sha256Hex(input: string): string;
  sha256Bytes(input: Uint8Array): Uint8Array;
}

/** Host-generated identifiers and nonces (≥128 bits). Never model-supplied. */
export interface IdGenerator {
  nextId(scope: string): string;
  /** RFC-format UUID string, deterministically derived in test adapters. */
  nextUuid(): string;
  /** Host-random nonce, at least 128 bits, hex-encoded. */
  nextNonce(): string;
}

/** Kernel telemetry sink (Colony-owned port; adapter decides destination). */
export interface TelemetrySink {
  record(entry: TelemetryEntry): void;
}

export interface TelemetryEntry {
  kind: "transition" | "rejection" | "approval" | "budget" | "invocation" | "recovery";
  missionId?: string;
  code: string;
  detail?: Record<string, unknown>;
}
