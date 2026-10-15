/**
 * Request handling for `POST /api/analyze` (server side): input validation, optional bearer-token
 * check, and the analyse → classify → plan pipeline. Kept out of the route file so it can be tested.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { analyze, plan } from "../engine";
import type { EngineInput, EngineResult, Settings } from "../types";
import type { AIClassifier } from "./types";

/** Upper bound on the text accepted by the API (characters). */
export const ANALYZE_MAX_TEXT = 2000;
export const ANALYZE_MAX_PHOTOS = 20;

const AnalyzeBodySchema = z.object({
  text: z
    .string({ error: "text（本文）は文字列で指定してください" })
    .max(ANALYZE_MAX_TEXT, `本文は${ANALYZE_MAX_TEXT}文字以内で送ってください`)
    .default(""),
  photoCount: z
    .number({ error: "photoCount は数値で指定してください" })
    .int("photoCount は整数で指定してください")
    .min(0, "photoCount は0以上で指定してください")
    .max(ANALYZE_MAX_PHOTOS, `photoCount は${ANALYZE_MAX_PHOTOS}以下で指定してください`)
    .default(0),
  senderId: z.string({ error: "senderId（送信者のID）を指定してください" }).trim().min(1, "senderId（送信者のID）を指定してください"),
  groupId: z.string({ error: "groupId（グループのID）を指定してください" }).trim().min(1, "groupId（グループのID）を指定してください"),
}, { error: "{ text, photoCount, senderId, groupId } の形のJSONで送信してください" });

export type AnalyzeParseResult =
  | { ok: true; input: Omit<EngineInput, "now"> }
  | { ok: false; error: string; issues: string[] };

/** Validates the JSON body and resolves sender / group against the settings. */
export function parseAnalyzeRequest(body: unknown, settings: Settings): AnalyzeParseResult {
  const parsed = AnalyzeBodySchema.safeParse(body ?? undefined);
  if (!parsed.success) {
    return { ok: false, error: "入力内容に誤りがあります", issues: parsed.error.issues.map((i) => i.message) };
  }
  const { text, photoCount, senderId, groupId } = parsed.data;
  const issues: string[] = [];
  const sender = settings.members.find((m) => m.id === senderId);
  const group = settings.groups.find((g) => g.id === groupId);
  // The registered ids are not listed here: with production settings loaded they are private data.
  if (!sender) issues.push(`senderId「${senderId}」のメンバーが見つかりません`);
  if (!group) issues.push(`groupId「${groupId}」のグループが見つかりません`);
  if (text.trim() === "" && photoCount === 0) issues.push("本文（text）か写真の枚数（photoCount）のどちらかを指定してください");
  if (!sender || !group || issues.length > 0) return { ok: false, error: "入力内容に誤りがあります", issues };
  return { ok: true, input: { text, photoCount, sender, group } };
}

/**
 * Bearer-token check. The endpoint is open only for the pure demo (sample AI, default settings, no
 * LINE). As soon as Claude is active (every call is billed) or production data is loaded (LINE
 * credentials or APP_SETTINGS_JSON: real reply texts, FAQ answers, member names), it requires
 * `Authorization: Bearer <ANALYZE_API_TOKEN>`; without a configured token it stays closed.
 */
export function checkAnalyzeAuth(
  classifier: AIClassifier,
  authorization: string | null,
  configuredToken: string | undefined,
  options: { productionData?: boolean } = {},
): { ok: true } | { ok: false; status: 401 | 403; reason: string } {
  if (classifier.id !== "claude" && !options.productionData) return { ok: true };
  const token = configuredToken?.trim();
  if (!token) {
    return {
      ok: false,
      status: 403,
      reason:
        classifier.id === "claude"
          ? "本番AIでの判定テストには、環境変数 ANALYZE_API_TOKEN の設定が必要です"
          : "本番用の設定が入っているため、判定テストには環境変数 ANALYZE_API_TOKEN の設定が必要です",
    };
  }
  const presented = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim() ?? "";
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  if (!presented || !timingSafeEqual(digest(presented), digest(token))) {
    return { ok: false, status: 401, reason: "認証トークンが正しくありません" };
  }
  return { ok: true };
}

/** analyze → classifier.classify (never throws) → plan. */
export async function runAnalyze(
  input: EngineInput,
  settings: Settings,
  classifier: AIClassifier,
  pick?: (n: number) => number,
  deadline?: number,
): Promise<EngineResult> {
  const ruleGuess = analyze(input, settings);
  let analysis = ruleGuess;
  try {
    analysis = await classifier.classify(input, settings, ruleGuess, { deadline });
  } catch {
    analysis = ruleGuess;
  }
  return { analysis, plan: plan(input, analysis, settings, pick) };
}
