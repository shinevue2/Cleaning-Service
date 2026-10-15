/**
 * Id generation for the client store. Call only inside actions / event handlers — never at module
 * top level (CONTRACT §2: no randomness during prerendering).
 */

function randomUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // `crypto.randomUUID` only exists in secure contexts (https / localhost). Opening the demo over plain
  // http on a LAN address still works thanks to this RFC 4122 v4 fallback.
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Kinds of ids the store creates; the prefix makes ids readable in exported data and logs. */
export type IdKind =
  | "msg" // chat message
  | "rec" // analysis record
  | "iss" // issue (要対応リスト)
  | "dlv" // delivery (email / phone / Chatwork)
  | "lex" // learned example
  | "faq"
  | "pho" // photo
  | "pat" // reply pattern
  | "rule" // keyword rule
  | "mem" // member
  | "sto" // store
  | "tgt" // notify target
  | "item";

/** "msg_2b0c…" — a v4 UUID with a short, human-readable prefix. */
export function newId(kind: IdKind = "item"): string {
  return `${kind}_${randomUuid()}`;
}
