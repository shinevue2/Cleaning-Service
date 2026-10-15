"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Check, ShieldCheck, Upload } from "lucide-react";
import { Button, Modal, toast } from "@/components/ui";
import { cn } from "@/lib/format";
import { SAMPLE_PHOTOS } from "@/lib/samples";
import type { Photo } from "@/lib/types";
import { MAX_ATTACHED_PHOTOS } from "./chatModel";
import { downscaleImage, ImageReadError } from "./imageUtils";

export interface PhotoPickerProps {
  open: boolean;
  onClose: () => void;
  /** photos currently attached to the draft */
  value: readonly Photo[];
  onChange: (photos: Photo[]) => void;
}

/** Choose sample photos or upload from the device (downscaled to ≤ 800 px JPEG). */
export function PhotoPicker(props: PhotoPickerProps) {
  // Mounted only while open, so the selection starts from the draft every time.
  return props.open ? <PhotoPickerDialog {...props} /> : null;
}

interface Item {
  photo: Photo;
  label: string;
}

let uploadSeq = 0;
function uploadId(): string {
  uploadSeq += 1;
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now());
  return `upload-${uploadSeq}-${random}`;
}

function PhotoPickerDialog({ onClose, value, onChange }: PhotoPickerProps) {
  const [selected, setSelected] = useState<Photo[]>(() => [...value]);
  // Photos uploaded earlier and still attached stay visible as choices.
  const [uploads, setUploads] = useState<Item[]>(() =>
    value
      .filter((p) => !SAMPLE_PHOTOS.some((s) => s.id === p.id))
      .map((photo) => ({ photo, label: "端末の写真" })),
  );
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items: Item[] = [
    ...uploads,
    ...SAMPLE_PHOTOS.map(({ id, src, alt, label }) => ({ photo: { id, src, alt }, label })),
  ];
  const isSelected = (id: string) => selected.some((p) => p.id === id);
  const full = selected.length >= MAX_ATTACHED_PHOTOS;

  const toggle = (photo: Photo) => {
    if (isSelected(photo.id)) {
      setSelected((list) => list.filter((p) => p.id !== photo.id));
      return;
    }
    if (full) {
      toast(`写真は1回に${MAX_ATTACHED_PHOTOS}枚まで添付できます`, "warning");
      return;
    }
    setSelected((list) => [...list, photo]);
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    input.value = ""; // allow choosing the same file again
    if (files.length === 0) return;

    const room = MAX_ATTACHED_PHOTOS - selected.length;
    if (room <= 0) {
      toast(`写真は1回に${MAX_ATTACHED_PHOTOS}枚まで添付できます`, "warning", {
        description: "選択中の写真を外してから、もう一度お試しください。",
      });
      return;
    }

    setBusy(true);
    const added: Item[] = [];
    let failed = 0;
    for (const file of files.slice(0, room)) {
      try {
        const src = await downscaleImage(file);
        added.push({ photo: { id: uploadId(), src, alt: file.name ? `アップロードした写真（${file.name}）` : "アップロードした写真" }, label: "端末の写真" });
      } catch (error) {
        failed += 1;
        if (!(error instanceof ImageReadError)) console.warn("[simulator] image upload failed", error);
      }
    }
    setBusy(false);

    if (added.length > 0) {
      setUploads((list) => [...added, ...list]);
      setSelected((list) => [...list, ...added.map((i) => i.photo)].slice(0, MAX_ATTACHED_PHOTOS));
    }
    if (failed > 0) {
      toast("読み込めない写真がありました", "error", {
        description: "JPEGやPNGの写真をお選びください。iPhoneの場合は「互換性優先」の形式だと確実です。",
      });
    }
    if (files.length > room) {
      toast(`写真は1回に${MAX_ATTACHED_PHOTOS}枚まで添付できます`, "warning", {
        description: `最初の${room}枚だけを追加しました。`,
      });
    }
  };

  const confirm = () => {
    onChange(selected);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="写真を添付"
      description={`サンプル写真を選ぶか、お手元の端末から写真を選んでください（最大${MAX_ATTACHED_PHOTOS}枚）。`}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="line" onClick={confirm} disabled={busy} data-autofocus>
            {selected.length > 0 ? `${selected.length}枚を添付する` : "添付しない"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" icon={Upload} loading={busy} onClick={() => fileRef.current?.click()}>
            端末から写真を選ぶ
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFiles}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
          <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[12px] leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-700" aria-hidden />
            写真は縮小して、このブラウザの中だけに保存されます。外部には送信されません。
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="選べる写真">
          {items.map(({ photo, label }) => {
            const order = selected.findIndex((p) => p.id === photo.id);
            const checked = order >= 0;
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => toggle(photo)}
                  aria-pressed={checked}
                  aria-label={`${label}：${photo.alt}`}
                  className={cn(
                    "group relative block w-full overflow-hidden rounded-xl bg-slate-100 text-left ring-inset transition",
                    checked ? "ring-4 ring-line-strong" : "ring-1 ring-slate-200 hover:ring-2 hover:ring-slate-300",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs (sample SVGs / downscaled uploads) */}
                  <img src={photo.src} alt="" className="block aspect-[4/3] w-full object-cover" draggable={false} />
                  <span className="block truncate bg-white px-2.5 py-1.5 text-[12px] font-semibold text-slate-700">
                    {label}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute right-2 top-2 flex size-6 items-center justify-center rounded-full text-[12px] font-bold shadow",
                      checked ? "bg-line-strong text-white" : "bg-white/90 text-transparent ring-1 ring-slate-300",
                    )}
                  >
                    {checked ? order + 1 : <Check className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
