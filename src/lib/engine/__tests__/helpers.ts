import { defaultSettings } from "@/lib/seed";
import type { EngineInput, Group, Member, Settings } from "@/lib/types";

/** Epoch ms for a wall-clock time in Japan (JST = UTC+9, no DST). */
export function jst(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return Date.UTC(year, month - 1, day, hour - 9, minute);
}

/** 2026-10-14 (Wed) 10:00 JST — daytime with the default 22:00–08:00 night window. */
export const DAY = jst(2026, 10, 14, 10, 0);
/** 2026-10-14 (Wed) 23:30 JST — night time. */
export const NIGHT = jst(2026, 10, 14, 23, 30);

export function settings(patch?: (s: Settings) => void): Settings {
  const s = defaultSettings();
  patch?.(s);
  return s;
}

export function member(s: Settings, id: string): Member {
  const m = s.members.find((x) => x.id === id);
  if (!m) throw new Error(`unknown member ${id}`);
  return m;
}

export function group(s: Settings, id: string): Group {
  const g = s.groups.find((x) => x.id === id);
  if (!g) throw new Error(`unknown group ${id}`);
  return g;
}

export function input(
  s: Settings,
  text: string,
  opts: { sender?: string; group?: string; photos?: number; now?: number } = {},
): EngineInput {
  const sender = member(s, opts.sender ?? "m_tanaka");
  const defaultGroup = sender.role === "callcenter" ? "g_call" : "g_cleaning";
  return {
    text,
    photoCount: opts.photos ?? 0,
    sender,
    group: group(s, opts.group ?? defaultGroup),
    now: opts.now ?? DAY,
  };
}

/** Always picks the first reply variant. */
export const first = (): number => 0;
