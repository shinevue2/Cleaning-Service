import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSignature, verifySignature } from "../signature";

const SECRET = "test-channel-secret";
const BODY = JSON.stringify({
  destination: "U0000",
  events: [{ type: "message", message: { type: "text", text: "駅前店、これから清掃に入ります" } }],
});

const sign = (body: string, secret = SECRET) => createHmac("sha256", secret).update(body, "utf8").digest("base64");

describe("verifySignature", () => {
  it("accepts the signature LINE computes for the raw body", () => {
    expect(verifySignature(BODY, sign(BODY), SECRET)).toBe(true);
    expect(computeSignature(BODY, SECRET)).toBe(sign(BODY));
  });

  it("accepts a byte body (Uint8Array) the same way as a string", () => {
    const bytes = new TextEncoder().encode(BODY);
    expect(verifySignature(bytes, sign(BODY), SECRET)).toBe(true);
  });

  it("tolerates surrounding whitespace in the header value", () => {
    expect(verifySignature(BODY, `  ${sign(BODY)} `, SECRET)).toBe(true);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifySignature(BODY, sign(BODY, "other-secret"), SECRET)).toBe(false);
  });

  it("rejects a body that was modified after signing", () => {
    const tampered = BODY.replace("清掃に入ります", "清掃が終わりました");
    expect(verifySignature(tampered, sign(BODY), SECRET)).toBe(false);
  });

  it("rejects a missing or empty signature header", () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
    expect(verifySignature(BODY, undefined, SECRET)).toBe(false);
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
  });

  it("rejects when no channel secret is configured", () => {
    expect(verifySignature(BODY, sign(BODY, ""), "")).toBe(false);
  });

  it("rejects a signature of the wrong length without throwing", () => {
    expect(verifySignature(BODY, "abc", SECRET)).toBe(false);
    expect(verifySignature(BODY, `${sign(BODY)}AA`, SECRET)).toBe(false);
  });
});
