/**
 * RFC 8785 JSON Canonicalization Scheme (JCS) for the JSON value subset the
 * kernel persists (objects, arrays, strings, finite numbers, booleans, null).
 *
 * Implementation notes (normative per N1 req 2 / N2 payloadSha256):
 * - Object keys sorted by UTF-16 code unit sequence.
 * - Strings serialized with JSON.stringify escaping (minimal escaping; lone
 *   surrogates escaped as \udXXX — identical to JCS Annex).
 * - Numbers serialized per ECMAScript Number::toString (JSON.stringify path).
 * - No whitespace; UTF-8 bytes are hashed.
 */
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export class CanonicalizationError extends Error {
  constructor(message: string) {
    super(`canonicalization: ${message}`);
    this.name = "CanonicalizationError";
  }
}

function assertCanonicallySerializable(value: unknown): asserts value is Json {
  switch (typeof value) {
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalizationError("non-finite number");
      return;
    case "object": {
      if (value === null) return;
      if (Array.isArray(value)) {
        for (const item of value) assertCanonicallySerializable(item);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          throw new CanonicalizationError(`forbidden key "${key}"`);
        }
        assertCanonicallySerializable(record[key]);
      }
      return;
    }
    default:
      return; // string | boolean | null
  }
}

/** Serialize a JSON value to its RFC 8785 canonical form. */
export function canonicalJson(value: unknown): string {
  assertCanonicallySerializable(value);
  return serialize(value);
}

function serialize(value: Json): string {
  if (value === null) return "null";
  const type = typeof value;
  if (type === "boolean") return value === true ? "true" : "false";
  if (type === "number") return JSON.stringify(value);
  if (type === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serialize).join(",")}]`;
  const record = value as { [key: string]: Json };
  // RFC 8785 sorts by UTF-16 code units; JavaScript string comparison is
  // exactly that (code points get the astral range wrong).
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(record[k])}`).join(",")}}`;
}
