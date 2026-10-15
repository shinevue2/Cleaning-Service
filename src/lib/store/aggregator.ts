/**
 * Timer bookkeeping for the client store, deliberately kept OUTSIDE the zustand state:
 * timeout handles are not serialisable and must never reach localStorage.
 *
 *  - aggregation timers: one per `${groupId}:${senderId}` buffer ("wait N seconds for a follow-up photo")
 *  - reply timers: the short "bot is typing…" delay before the bot's answer is committed
 *  - typing counters: how many bot answers are in flight per group (two quick reports in one group
 *    must not switch the typing indicator off after the first answer)
 */

type Handle = ReturnType<typeof setTimeout>;

const flushTimers = new Map<string, Handle>();
const replyTimers = new Set<Handle>();
const inflight = new Map<string, number>();

/** Buffer key for a sender in a group. */
export function bufferKey(groupId: string, senderId: string): string {
  return `${groupId}:${senderId}`;
}

/** Whole seconds left until `dueAt` (never negative) — for the 「写真の追加を待っています… 5秒」 countdown. */
export function secondsUntil(dueAt: number, now: number): number {
  return Math.max(0, Math.ceil((dueAt - now) / 1000));
}

/** (Re)starts the aggregation timer of a buffer. */
export function scheduleFlush(key: string, delayMs: number, fn: () => void): void {
  cancelFlush(key);
  const handle = setTimeout(() => {
    flushTimers.delete(key);
    fn();
  }, Math.max(0, delayMs));
  flushTimers.set(key, handle);
}

export function cancelFlush(key: string): void {
  const handle = flushTimers.get(key);
  if (handle !== undefined) clearTimeout(handle);
  flushTimers.delete(key);
}

/** Runs `fn` after `delayMs`; cancelled by `cancelAllTimers()` (e.g. when the demo is reset). */
export function scheduleReply(delayMs: number, fn: () => void): void {
  const handle = setTimeout(() => {
    replyTimers.delete(handle);
    fn();
  }, Math.max(0, delayMs));
  replyTimers.add(handle);
}

/** Marks one more answer in flight for a group. Returns the new count. */
export function beginTyping(groupId: string): number {
  const n = (inflight.get(groupId) ?? 0) + 1;
  inflight.set(groupId, n);
  return n;
}

/** Marks one answer as delivered. Returns the remaining count (0 = hide the typing indicator). */
export function endTyping(groupId: string): number {
  const n = Math.max(0, (inflight.get(groupId) ?? 0) - 1);
  if (n === 0) inflight.delete(groupId);
  else inflight.set(groupId, n);
  return n;
}

/** Number of pending timers — handy in tests and for debugging. */
export function timerCounts(): { flush: number; reply: number } {
  return { flush: flushTimers.size, reply: replyTimers.size };
}

/** Cancels every aggregation and reply timer and forgets typing counters. */
export function cancelAllTimers(): void {
  flushTimers.forEach((handle) => clearTimeout(handle));
  flushTimers.clear();
  replyTimers.forEach((handle) => clearTimeout(handle));
  replyTimers.clear();
  inflight.clear();
}
