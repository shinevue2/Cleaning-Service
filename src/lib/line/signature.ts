/**
 * LINE webhook signature check: base64(HMAC-SHA256(channelSecret, rawBody)) must equal the
 * `x-line-signature` header. Server only (Node `crypto`).
 *
 * Always verify against the raw request body exactly as received — never against re-serialised JSON.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export function computeSignature(rawBody: string | Uint8Array, channelSecret: string): string {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : Buffer.from(rawBody);
  return createHmac("sha256", channelSecret).update(body).digest("base64");
}

export function verifySignature(
  rawBody: string | Uint8Array,
  signature: string | null | undefined,
  channelSecret: string,
): boolean {
  if (!signature || !channelSecret) return false;
  const expected = Buffer.from(computeSignature(rawBody, channelSecret), "utf8");
  const received = Buffer.from(signature.trim(), "utf8");
  // timingSafeEqual throws on different lengths; a length mismatch is simply "invalid".
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
