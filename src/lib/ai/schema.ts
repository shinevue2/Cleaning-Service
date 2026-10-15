/**
 * Structured-output contract between the app and Claude.
 *
 * `buildOutputJsonSchema()` is sent as `output_config.format` so the API constrains the reply to
 * this shape; `ClassificationOutputSchema` (zod) re-validates the parsed JSON on our side, because
 * a schema-valid reply can still carry values we refuse to trust (e.g. an FAQ id that was disabled
 * a moment ago).
 */
import { z } from "zod";
import type { Category, Settings, Urgency } from "../types";

export const CATEGORY_VALUES = [
  "cleaning_start",
  "cleaning_done",
  "leftover",
  "machine_error",
  "question",
  "info",
  "emergency",
  "chat",
  "unknown",
] as const satisfies readonly Category[];

export const URGENCY_VALUES = ["normal", "attention", "urgent"] as const satisfies readonly Urgency[];

// Compile-time guard: adding a Category/Urgency to types.ts without updating the tuples fails here.
type Missing<All, Listed> = Exclude<All, Listed>;
const categoriesAreExhaustive: Missing<Category, (typeof CATEGORY_VALUES)[number]> extends never ? true : false = true;
const urgenciesAreExhaustive: Missing<Urgency, (typeof URGENCY_VALUES)[number]> extends never ? true : false = true;
void categoriesAreExhaustive;
void urgenciesAreExhaustive;

/** Longest reasoning we keep (characters). Longer replies are cut, not rejected. */
export const MAX_REASONING_CHARS = 280;

function truncateChars(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

export const ClassificationOutputSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  secondary: z.array(z.enum(CATEGORY_VALUES)).max(8).default([]),
  urgency: z.enum(URGENCY_VALUES),
  confidence: z.number().min(0).max(1),
  faqId: z.string().min(1).nullable(),
  reasoning: z
    .string()
    .trim()
    .min(1)
    .transform((s) => truncateChars(s, MAX_REASONING_CHARS)),
});

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

/**
 * JSON schema for `output_config.format`. Kept to the subset structured outputs supports
 * (no numeric bounds / string lengths — those are enforced by zod after parsing).
 * `faqId` is an enum of the currently enabled FAQ ids so the model cannot invent one.
 */
export function buildOutputJsonSchema(settings: Settings): Record<string, unknown> {
  const faqIds = settings.faqs.filter((f) => f.enabled).map((f) => f.id);
  const faqId =
    faqIds.length > 0
      ? {
          anyOf: [{ type: "string", enum: faqIds }, { type: "null" }],
          description: "質問がよくある質問と同じ内容のときだけ、その id。該当がなければ null。",
        }
      : { type: "null", description: "よくある質問が登録されていないため常に null。" };

  return {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: [...CATEGORY_VALUES],
        description: "最も対応が必要な内容の分類。",
      },
      secondary: {
        type: "array",
        items: { type: "string", enum: [...CATEGORY_VALUES] },
        description: "同じメッセージに含まれるその他の内容（なければ空配列）。",
      },
      urgency: {
        type: "string",
        enum: [...URGENCY_VALUES],
        description: "normal=対応不要 / attention=担当者の確認が必要 / urgent=すぐ対応が必要。",
      },
      confidence: {
        type: "number",
        description: "判定の確からしさ（0〜1）。",
      },
      faqId,
      reasoning: {
        type: "string",
        description: "判断理由。日本語の「です・ます」調で1〜2文。",
      },
    },
    required: ["category", "secondary", "urgency", "confidence", "faqId", "reasoning"],
    additionalProperties: false,
  };
}
