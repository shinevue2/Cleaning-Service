import { describe, expect, it } from "vitest";
import { run } from "@/lib/engine";
import { SAMPLE_SCENARIOS } from "@/lib/samples";
import { defaultSettings } from "@/lib/seed";
import { EXTRA_SCENARIOS, GUIDE_STEPS } from "../scenarios";

/** 2026-10-14 14:00 in Tokyo — daytime, so no night patterns. */
const NOON = Date.UTC(2026, 9, 14, 5, 0);

describe("landing page scenarios", () => {
  const byId = new Map(SAMPLE_SCENARIOS.map((s) => [s.id, s]));

  it("describes the guide steps exactly like the simulator sends them", () => {
    for (const step of GUIDE_STEPS) {
      const sample = byId.get(step.scenario);
      expect(sample, step.scenario).toBeDefined();
      expect(step.text).toBe(sample!.text);
      expect(step.photos).toBe(sample!.photoIds.length);
      expect(step.category).toBe(sample!.expect);
      expect(step.urgency).toBe(sample!.expectUrgency);
    }
  });

  it("labels the extra chips with the category the simulator expects", () => {
    for (const extra of EXTRA_SCENARIOS) {
      expect(byId.get(extra.scenario)?.expect, extra.scenario).toBe(extra.category);
    }
  });

  it("promises results the engine actually produces", () => {
    const settings = defaultSettings();
    for (const step of GUIDE_STEPS) {
      const sample = byId.get(step.scenario)!;
      const sender = settings.members.find((m) => m.id === sample.senderId)!;
      const group = settings.groups.find((g) => g.id === sample.groupId)!;
      const { analysis } = run({ text: sample.text, photoCount: sample.photoIds.length, sender, group, now: NOON }, settings, () => 0);
      expect(analysis.category, step.scenario).toBe(step.category);
      expect(analysis.urgency, step.scenario).toBe(step.urgency);
    }
  });
});
