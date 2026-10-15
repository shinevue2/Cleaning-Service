/**
 * POST /api/analyze — runs one message through the same pipeline as the LINE webhook and returns the
 * `EngineResult` ({ analysis, plan }) without replying or forwarding anything.
 *
 *   body: { text: string, photoCount?: number, senderId: string, groupId: string }
 *         ids are the settings ids, e.g. senderId "m_tanaka", groupId "g_cleaning"
 *
 * The pure demo (sample AI, no LINE, no APP_SETTINGS_JSON) is open. With Claude enabled (every call is
 * billed) or production settings loaded (private reply texts and member names), it requires
 * `Authorization: Bearer <ANALYZE_API_TOKEN>`.
 */
import { getServerClassifier } from "@/lib/ai";
import { checkAnalyzeAuth, parseAnalyzeRequest, runAnalyze } from "@/lib/ai/analyzeApi";
import { loadServerSettings, readLineCredentials } from "@/lib/line/config";

export const maxDuration = 30;
/** The AI call must end this long before Vercel stops the function, so the rule result can still be returned. */
const DEADLINE_MARGIN_MS = 3_000;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const classifier = getServerClassifier();
  const productionData = Boolean(readLineCredentials() || process.env.APP_SETTINGS_JSON?.trim());
  const auth = checkAnalyzeAuth(classifier, request.headers.get("authorization"), process.env.ANALYZE_API_TOKEN, {
    productionData,
  });
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.reason });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { ok: false, error: "JSON形式で送信してください", issues: [] });
  }

  const { settings, warnings } = loadServerSettings();
  for (const warning of warnings) console.warn(`[analyze] ${warning}`);

  const parsed = parseAnalyzeRequest(body, settings);
  if (!parsed.ok) return json(400, { ok: false, error: parsed.error, issues: parsed.issues });

  const deadline = startedAt + maxDuration * 1000 - DEADLINE_MARGIN_MS;
  const result = await runAnalyze({ ...parsed.input, now: Date.now() }, settings, classifier, undefined, deadline);
  return json(200, result, { "X-AI-Classifier": classifier.id });
}
