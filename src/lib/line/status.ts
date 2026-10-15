/**
 * Shape of `GET /api/status` (admin 連携状況 card). Booleans and labels only — never secrets.
 * Client components may import the type: `import type { IntegrationStatus } from "@/lib/line/status"`.
 */
import type { AIClassifier, AIClassifierId } from "../ai/types";
import { readLineCredentials } from "./config";

export interface IntegrationStatus {
  line: {
    connected: boolean;
    webhookPath: string;
    /** whether a LINE group id is configured for each role (LINE_GROUP_* env) */
    groups: { cleaning: boolean; callcenter: boolean; alerts: boolean };
  };
  ai: { id: AIClassifierId; label: string; sample: boolean; model?: string };
  storage: "browser";
}

export const WEBHOOK_PATH = "/api/line/webhook";

type Env = Record<string, string | undefined>;

const has = (value: string | undefined): boolean => Boolean(value?.trim());

export function buildIntegrationStatus(env: Env, classifier: AIClassifier): IntegrationStatus {
  return {
    line: {
      connected: readLineCredentials(env) !== null,
      webhookPath: WEBHOOK_PATH,
      groups: {
        cleaning: has(env.LINE_GROUP_CLEANING),
        callcenter: has(env.LINE_GROUP_CALLCENTER),
        alerts: has(env.LINE_GROUP_ALERTS),
      },
    },
    ai: {
      id: classifier.id,
      label: classifier.label,
      sample: classifier.sample,
      ...(classifier.model ? { model: classifier.model } : {}),
    },
    storage: "browser",
  };
}
