/**
 * AI classifier contract (docs/CONTRACT.md §4.2).
 *
 * The rule engine always runs first and produces `ruleGuess`; an AIClassifier may refine it.
 * Implementations: `mockClassifier` (demo, browser-safe) and `createClaudeClassifier` (server only).
 */
import type { Analysis, EngineInput, Settings } from "../types";

export type AIClassifierId = "mock" | "claude";

export interface AIClassifier {
  id: AIClassifierId;
  /** Shown in the admin 連携状況 card: 「サンプルAI（デモ）」 / 「Claude（本番）」 */
  label: string;
  /** true while the judgement is produced by the deterministic sample engine */
  sample: boolean;
  /** Model id for real providers (informational, e.g. "claude-opus-5-5"). */
  model?: string;
  /**
   * Refines a rule-based analysis. Must never throw — on any failure return `ruleGuess` unchanged.
   * `options.deadline` (epoch ms): give up and return `ruleGuess` rather than finish after this time.
   */
  classify(input: EngineInput, settings: Settings, ruleGuess: Analysis, options?: ClassifyOptions): Promise<Analysis>;
}

export interface ClassifyOptions {
  /** Epoch ms by which the answer must be back (e.g. the serverless function's time limit minus a margin). */
  deadline?: number;
}

/** Minimal logger so callers (and tests) can silence or capture diagnostics. */
export interface AILogger {
  info(message: string, detail?: Record<string, unknown>): void;
  warn(message: string, detail?: Record<string, unknown>): void;
}

export const consoleLogger: AILogger = {
  info: (message, detail) => console.info(`[ai] ${message}`, detail ?? ""),
  warn: (message, detail) => console.warn(`[ai] ${message}`, detail ?? ""),
};
