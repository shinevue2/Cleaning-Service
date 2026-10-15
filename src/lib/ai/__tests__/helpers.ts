import { analyze } from "@/lib/engine";
import { defaultSettings } from "@/lib/seed";
import type { Analysis, EngineInput, Settings } from "@/lib/types";

/** Wed 2026-10-14 10:00 JST. */
export const DAY = Date.UTC(2026, 9, 14, 1, 0);

export function settings(patch?: (s: Settings) => void): Settings {
  const s = defaultSettings();
  patch?.(s);
  return s;
}

export function input(s: Settings, text: string, opts: { sender?: string; group?: string; photos?: number } = {}): EngineInput {
  const sender = s.members.find((m) => m.id === (opts.sender ?? "m_tanaka"));
  const group = s.groups.find((g) => g.id === (opts.group ?? (sender?.role === "callcenter" ? "g_call" : "g_cleaning")));
  if (!sender || !group) throw new Error("fixture: unknown sender or group");
  return { text, photoCount: opts.photos ?? 0, sender, group, now: DAY };
}

/** Rule-engine guess for a message (what the classifier receives as `ruleGuess`). */
export function ruleGuessFor(s: Settings, text: string, opts?: Parameters<typeof input>[2]): { input: EngineInput; rule: Analysis } {
  const i = input(s, text, opts);
  return { input: i, rule: analyze(i, s) };
}
