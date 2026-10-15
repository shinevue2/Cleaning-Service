"use client";

import { useId, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Download, FileJson, FileUp, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { Button, Callout, Card, ConfirmDialog, CopyButton, Textarea, toast } from "@/components/ui";
import { useDemoStore } from "@/lib/store";
import { SECTION_LABELS, SETTINGS_SECTIONS, parseSettingsJson, type SettingsSection } from "@/lib/store/settingsSchema";
import type { Settings } from "@/lib/types";
import { MAX_IMPORT_BYTES, settingsFileName } from "./validation";

function sectionSummary(settings: Settings, section: SettingsSection): string {
  if (section === "behavior") return SECTION_LABELS.behavior;
  return `${SECTION_LABELS[section]}（${settings[section].length}件）`;
}

/** データ section: export / import the settings and reset the demo. */
export function DataPanel() {
  const settings = useDemoStore((s) => s.settings);
  const exportSettings = useDemoStore((s) => s.exportSettings);
  const importSettings = useDemoStore((s) => s.importSettings);
  const resetDemo = useDemoStore((s) => s.resetDemo);
  const fileRef = useRef<HTMLInputElement>(null);
  const pasteId = useId();
  const [source, setSource] = useState<{ name: string; text: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const json = useMemo(() => JSON.stringify(settings, null, 2), [settings]);
  const preview = useMemo(() => (source ? parseSettingsJson(source.text, settings) : null), [source, settings]);

  const download = () => {
    const name = settingsFileName(Date.now());
    try {
      const blob = new Blob([exportSettings()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("設定を書き出しました", "success", { description: name });
    } catch {
      toast("書き出せませんでした", "error", { description: "「内容をコピー」でコピーして保存することもできます。" });
    }
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow choosing the same file again
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast("ファイルが大きすぎます", "error", { description: "書き出した設定ファイル（.json）を選んでください。" });
      return;
    }
    try {
      setSource({ name: file.name, text: await file.text() });
      setPasteOpen(false);
    } catch {
      toast("ファイルを読み込めませんでした", "error", { description: "別のファイルでお試しください。" });
    }
  };

  const doImport = () => {
    if (!source) return;
    const result = importSettings(source.text);
    if (result.ok) {
      toast("設定を読み込みました", "success", { description: "返信パターンや判定ルールなどが、読み込んだ内容に変わりました。" });
      setSource(null);
      setPasteOpen(false);
    } else {
      toast("設定を読み込めませんでした", "error", { description: result.error });
    }
  };

  const counts = SETTINGS_SECTIONS.filter((s) => s !== "behavior" && s !== "groups").map((s) => sectionSummary(settings, s));

  return (
    <div className="space-y-5">
      <Card
        title="設定の書き出し（バックアップ）"
        icon={Download}
        description="返信パターン・判定ルール・よくある質問・スタッフ・店舗・通知先・動作設定を、1つのファイルにまとめて保存します。本番に反映するときは、このファイルを開発担当にお送りください。"
      >
        <p className="text-xs leading-relaxed text-slate-500">{counts.join("・")}・動作設定</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button icon={FileJson} onClick={download}>
            ファイルに書き出す
          </Button>
          <CopyButton text={json} label="内容をコピー" toastMessage="設定の内容をコピーしました" />
        </div>
      </Card>

      <Card
        title="設定の読み込み"
        icon={Upload}
        description="書き出したファイルを読み込むと、設定がその内容に置き換わります。ファイルに含まれていない項目は、いまの設定のまま残ります。"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          onChange={onFile}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={FileUp} onClick={() => fileRef.current?.click()}>
            ファイルを選ぶ
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setPasteOpen((v) => !v);
              if (!pasteOpen) setSource({ name: "貼り付けた内容", text: "" });
              else setSource(null);
            }}
            aria-expanded={pasteOpen}
            aria-controls={pasteId}
          >
            {pasteOpen ? "貼り付けをやめる" : "内容を貼り付ける"}
          </Button>
        </div>

        {pasteOpen && (
          <div id={pasteId} className="mt-4">
            <label htmlFor={`${pasteId}-text`} className="mb-1.5 block text-sm font-semibold text-slate-800">
              設定の内容（JSON）
            </label>
            <Textarea
              id={`${pasteId}-text`}
              rows={6}
              value={source?.text ?? ""}
              onChange={(e) => setSource({ name: "貼り付けた内容", text: e.target.value })}
              placeholder={'{\n  "replyPatterns": [ … ]\n}'}
              className="font-mono text-xs"
              spellCheck={false}
            />
          </div>
        )}

        {source && preview && (source.text.trim() !== "" || !pasteOpen) && (
          <div className="mt-4 space-y-3">
            {preview.ok ? (
              <Callout tone="info" title={`「${source.name}」を読み込む準備ができました`}>
                <p>次の項目が、ファイルの内容に置き換わります。</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                  {preview.sections.map((s) => (
                    <li key={s}>{sectionSummary(preview.settings, s)}</li>
                  ))}
                </ul>
              </Callout>
            ) : (
              <Callout tone="danger" title="この内容は読み込めません">
                {preview.error}
              </Callout>
            )}
            <div className="flex flex-wrap gap-2">
              <Button icon={Upload} disabled={!preview.ok} onClick={() => setConfirmImport(true)}>
                読み込む
              </Button>
              <Button
                variant="ghost"
                icon={X}
                onClick={() => {
                  setSource(null);
                  setPasteOpen(false);
                }}
              >
                やめる
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card
        title="デモを最初の状態に戻す"
        icon={RotateCcw}
        className="border-red-200"
        description="設定（返信パターン・判定ルール・よくある質問・スタッフなど）と、シミュレーターのメッセージ・判定ログ・要対応リストを、すべて最初の状態に戻します。"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="danger" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            デモをリセット
          </Button>
          <p className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
            整えた設定を残したいときは、先に「ファイルに書き出す」で保存してください。
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmImport}
        title="設定を読み込みますか？"
        description="いまの設定の一部が、読み込む内容に置き換わります。元に戻したいときのために、先に書き出しておくと安心です。"
        confirmLabel="読み込む"
        onConfirm={doImport}
        onClose={() => setConfirmImport(false)}
      />

      <ConfirmDialog
        open={confirmReset}
        tone="danger"
        title="デモを最初の状態に戻しますか？"
        description="変更した設定と、これまでのメッセージ・判定ログ・要対応リストがすべて消え、最初の状態に戻ります。元に戻すことはできません。"
        confirmLabel="リセットする"
        onConfirm={() => {
          resetDemo();
          toast("デモを最初の状態に戻しました", "success", { description: "設定とメッセージが初期状態になりました。" });
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
