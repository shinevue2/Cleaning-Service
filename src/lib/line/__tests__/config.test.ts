import { describe, expect, it } from "vitest";
import { mockClassifier } from "@/lib/ai/mock";
import { defaultSettings } from "@/lib/seed";
import { isLineId, loadServerSettings, mergeSettingsJson, readAlertLinkUrl, readLineCredentials, resolveLineDestination } from "../config";
import { buildIntegrationStatus } from "../status";
import { GROUP_ALERTS, GROUP_CALL, GROUP_CLEANING, lineSettings } from "./fixtures";

describe("loadServerSettings", () => {
  it("returns the defaults when nothing is configured", () => {
    const { settings, warnings } = loadServerSettings({});
    expect(settings).toEqual(defaultSettings());
    expect(warnings).toEqual([]);
  });

  it("maps LINE_GROUP_* to the groups of each kind", () => {
    const { settings } = loadServerSettings({
      LINE_GROUP_CLEANING: GROUP_CLEANING,
      LINE_GROUP_CALLCENTER: ` ${GROUP_CALL} `,
      LINE_GROUP_ALERTS: GROUP_ALERTS,
    });
    const byKind = Object.fromEntries(settings.groups.map((g) => [g.kind, g.lineGroupId]));
    expect(byKind).toEqual({ cleaning: GROUP_CLEANING, callcenter: GROUP_CALL, alerts: GROUP_ALERTS });
  });

  it("applies the JSON exported from the admin screen", () => {
    const exported = defaultSettings();
    exported.behavior.aggregateSeconds = 10;
    exported.members[0] = { ...exported.members[0], lineUserId: "Uabc" };
    exported.faqs = exported.faqs.slice(0, 2);
    const { settings, warnings } = loadServerSettings({ APP_SETTINGS_JSON: JSON.stringify(exported) });
    expect(warnings).toEqual([]);
    expect(settings.behavior.aggregateSeconds).toBe(10);
    expect(settings.members[0].lineUserId).toBe("Uabc");
    expect(settings.faqs).toHaveLength(2);
  });

  it("lets env group ids win over ids in APP_SETTINGS_JSON", () => {
    const exported = defaultSettings();
    exported.groups = exported.groups.map((g) => ({ ...g, lineGroupId: "Cold" }));
    const { settings } = loadServerSettings({ APP_SETTINGS_JSON: JSON.stringify(exported), LINE_GROUP_ALERTS: GROUP_ALERTS });
    expect(settings.groups.find((g) => g.kind === "alerts")?.lineGroupId).toBe(GROUP_ALERTS);
    expect(settings.groups.find((g) => g.kind === "cleaning")?.lineGroupId).toBe("Cold");
  });
});

describe("mergeSettingsJson", () => {
  it("merges a partial behavior patch over the defaults", () => {
    const { settings } = mergeSettingsJson(defaultSettings(), JSON.stringify({ behavior: { nightStart: "21:30" } }));
    expect(settings.behavior.nightStart).toBe("21:30");
    expect(settings.behavior.nightEnd).toBe("08:00");
  });

  it("keeps the default for a broken section and explains why", () => {
    const { settings, warnings } = mergeSettingsJson(
      defaultSettings(),
      JSON.stringify({ keywordRules: [{ id: "x", category: "not-a-category" }], stores: [{ id: "s1", name: "本店" }] }),
    );
    expect(settings.keywordRules).toEqual(defaultSettings().keywordRules);
    expect(settings.stores).toEqual([{ id: "s1", name: "本店", aliases: [] }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("keywordRules");
  });

  it("ignores invalid JSON with a warning", () => {
    const { settings, warnings } = mergeSettingsJson(defaultSettings(), "{oops");
    expect(settings).toEqual(defaultSettings());
    expect(warnings[0]).toContain("JSON");
  });

  it("rejects out-of-range behavior values", () => {
    const { settings, warnings } = mergeSettingsJson(defaultSettings(), JSON.stringify({ behavior: { confidenceThreshold: 3 } }));
    expect(settings.behavior.confidenceThreshold).toBe(defaultSettings().behavior.confidenceThreshold);
    expect(warnings).toHaveLength(1);
  });
});

describe("credentials and destinations", () => {
  it("needs both LINE secrets to count as connected", () => {
    expect(readLineCredentials({})).toBeNull();
    expect(readLineCredentials({ LINE_CHANNEL_SECRET: "s" })).toBeNull();
    expect(readLineCredentials({ LINE_CHANNEL_SECRET: "s", LINE_CHANNEL_ACCESS_TOKEN: "t" })).toEqual({ channelSecret: "s", accessToken: "t" });
  });

  it("only accepts https alert links", () => {
    expect(readAlertLinkUrl({ LINE_ALERT_LINK_URL: "https://example.com/admin" })).toBe("https://example.com/admin");
    expect(readAlertLinkUrl({ LINE_ALERT_LINK_URL: "javascript:alert(1)" })).toBeUndefined();
  });

  it("resolves notify addresses given as LINE ids or settings group ids", () => {
    const settings = lineSettings();
    expect(isLineId(GROUP_ALERTS)).toBe(true);
    expect(resolveLineDestination(GROUP_CALL, settings)).toBe(GROUP_CALL);
    expect(resolveLineDestination("g_alerts", settings)).toBe(GROUP_ALERTS);
    expect(resolveLineDestination("g_missing", settings)).toBeUndefined();
    expect(resolveLineDestination("g_alerts", defaultSettings())).toBeUndefined();
  });
});

describe("buildIntegrationStatus", () => {
  it("reports the demo state without secrets", () => {
    expect(buildIntegrationStatus({}, mockClassifier)).toEqual({
      line: { connected: false, webhookPath: "/api/line/webhook", groups: { cleaning: false, callcenter: false, alerts: false } },
      ai: { id: "mock", label: "サンプルAI（デモ）", sample: true },
      storage: "browser",
    });
  });

  it("reports a connected LINE channel and configured groups", () => {
    const status = buildIntegrationStatus(
      { LINE_CHANNEL_SECRET: "secret", LINE_CHANNEL_ACCESS_TOKEN: "token", LINE_GROUP_ALERTS: GROUP_ALERTS },
      mockClassifier,
    );
    expect(status.line).toMatchObject({ connected: true, groups: { cleaning: false, callcenter: false, alerts: true } });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("token");
  });
});
