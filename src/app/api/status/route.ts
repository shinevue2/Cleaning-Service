/**
 * GET /api/status — integration status for 管理画面 › 設定 › 連携状況.
 * Response shape: `IntegrationStatus` in `@/lib/line/status` (booleans and labels only, never secrets).
 */
import { connection } from "next/server";
import { getServerClassifier } from "@/lib/ai";
import { buildIntegrationStatus } from "@/lib/line/status";

export async function GET(): Promise<Response> {
  // Reads env at request time — must not be prerendered.
  await connection();
  const body = buildIntegrationStatus(process.env, getServerClassifier());
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
