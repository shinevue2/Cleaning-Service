/**
 * Classification / response engine — pure TypeScript, runs in the browser and in Node.
 *
 *   run(input, settings)  = analyze() → plan()
 *
 * See docs/CONTRACT.md §4.1 for the behaviour contract.
 */
import type { EngineInput, EngineResult, Settings } from "../types";
import { analyze } from "./analyze";
import { plan } from "./plan";

export { normalize, matchKey, matchText, foldKana, containsWord } from "./normalize";
export type { MatchText } from "./normalize";
export { similarity } from "./similarity";
export {
  extract,
  detectMachine,
  detectErrorCode,
  detectDays,
  detectStore,
  findFaq,
  matchRules,
  scanRules,
  storesNamed,
  describeEmergency,
  keywordVariants,
  keywordParts,
  displayKeyword,
  isDeniedAfter,
} from "./extract";
export type {
  FaqMatch,
  KeywordMatch,
  RuleHit,
  RuleScan,
  NegatedMatch,
  ExcludedMatch,
  StoreDetection,
  EmergencyKind,
  MatchInput,
} from "./extract";
export {
  analyze,
  findLearned,
  faqById,
  maxUrgency,
  CATEGORY_PRIORITY,
  URGENCY_RANK,
  LEARNED_SIMILARITY_THRESHOLD,
  PHOTO_ONLY_CONFIDENCE,
  FALLBACK_CONFIDENCE,
} from "./analyze";
export type { LearnedMatch } from "./analyze";
export {
  plan,
  renderTemplate,
  routeTargets,
  choosePattern,
  composeTarget,
  composeForwardTitle,
  cleanAlertTitle,
  otherTroubles,
  shortName,
} from "./plan";
export { buildDailyReport, REPORT_ISSUE_LIMIT } from "./report";
export type { DailyReportInput } from "./report";
export { isNight, parseClock, tokyoParts, tokyoDateKey, formatTokyoTime, formatTokyoDate, TOKYO_TIME_ZONE } from "./time";
export type { TokyoParts } from "./time";

/** Analyse a message and decide what to do with it. `pick(n)` chooses a reply variant (default: random). */
export function run(input: EngineInput, settings: Settings, pick?: (n: number) => number): EngineResult {
  const analysis = analyze(input, settings);
  return { analysis, plan: plan(input, analysis, settings, pick) };
}
