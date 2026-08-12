import { errorCodes, fail } from "./errors.js";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const MAX_JSON_BYTES = 16 * 1024;
const MAX_JSON_DEPTH = 8;
const MAX_JSON_KEYS = 256;

export function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export async function digestToken(token: string): Promise<string> {
  if (!TOKEN_PATTERN.test(token)) fail(errorCodes.invalidToken);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function assertString(
  value: string,
  options: { max: number; allowEmpty?: boolean },
): void {
  if (
    (!options.allowEmpty && value.length === 0) ||
    value.length > options.max
  ) {
    fail(errorCodes.invalidArgument);
  }
}

export function assertDuration(value: number): void {
  const max = 365 * 24 * 60 * 60 * 1000;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    fail(errorCodes.invalidArgument);
  }
}

export function assertLimit(value: number, maximum = 100): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(errorCodes.invalidArgument);
  }
}

export function assertJson(value: unknown): void {
  let keys = 0;
  const visit = (current: unknown, depth: number): void => {
    if (depth > MAX_JSON_DEPTH) fail(errorCodes.payloadInvalid);
    if (
      current === null ||
      typeof current === "boolean" ||
      typeof current === "string"
    ) {
      return;
    }
    if (typeof current === "number") {
      if (!Number.isFinite(current)) fail(errorCodes.payloadInvalid);
      return;
    }
    if (Array.isArray(current)) {
      for (const item of current) visit(item, depth + 1);
      return;
    }
    if (typeof current === "object") {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        fail(errorCodes.payloadInvalid);
      }
      for (const [key, item] of Object.entries(current)) {
        keys += 1;
        if (keys > MAX_JSON_KEYS || key.length > 128) {
          fail(errorCodes.payloadInvalid);
        }
        visit(item, depth + 1);
      }
      return;
    }
    fail(errorCodes.payloadInvalid);
  };

  visit(value, 0);
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    fail(errorCodes.payloadInvalid);
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_JSON_BYTES) {
    fail(errorCodes.payloadInvalid);
  }
}

/** Compare validated JSON values without depending on object property order. */
export function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
    );
  }
  if (typeof left !== "object" || typeof right !== "object") return false;

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] &&
        jsonValuesEqual(leftRecord[key], rightRecord[key]),
    )
  );
}
