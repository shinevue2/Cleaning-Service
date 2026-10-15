import { describe, expect, it } from "vitest";
import { normalize, similarity } from "@/lib/engine";

describe("normalize", () => {
  it("folds full-width ASCII and lower-cases", () => {
    expect(normalize("Ｅ２１エラー")).toBe("e21エラー");
  });

  it("turns the full-width question mark into '?'", () => {
    expect(normalize("どこですか？")).toBe("どこですか?");
  });

  it("removes half-width, full-width and zero-width spaces and newlines", () => {
    expect(normalize(" 清掃　完了\n しました​ ")).toBe("清掃完了しました");
  });

  it("converts half-width katakana and circled digits", () => {
    expect(normalize("ｴﾗｰ③")).toBe("エラー3");
  });

  it("returns an empty string for empty input", () => {
    expect(normalize("")).toBe("");
    expect(normalize(" 　 ")).toBe("");
  });
});

describe("similarity", () => {
  it("is 1 for identical text, including width/spacing differences", () => {
    expect(similarity("乾燥機3番 エラー", "乾燥機３番エラー")).toBe(1);
  });

  it("is 0 for unrelated text", () => {
    expect(similarity("水漏れ", "ありがとう")).toBe(0);
  });

  it("is symmetric and between 0 and 1", () => {
    const a = "駅前店の看板の電気が消えています";
    const b = "駅前店の看板が消えてます";
    const ab = similarity(a, b);
    expect(ab).toBe(similarity(b, a));
    expect(ab).toBeGreaterThan(0.5);
    expect(ab).toBeLessThan(1);
  });

  it("computes the bigram Dice coefficient", () => {
    // "abcd" → ab, bc, cd ; "abce" → ab, bc, ce → overlap 2 → 2*2/(3+3)
    expect(similarity("abcd", "abce")).toBeCloseTo(2 / 3, 5);
  });

  it("handles empty and single-character strings", () => {
    expect(similarity("", "")).toBe(0);
    expect(similarity("a", "b")).toBe(0);
    expect(similarity("あ", "あ")).toBe(1);
  });
});
