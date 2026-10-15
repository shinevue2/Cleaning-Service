"use client";

import { Modal } from "@/components/ui";
import { cn } from "@/lib/format";
import type { Photo } from "@/lib/types";

export interface PhotoGridProps {
  photos: readonly Photo[];
  onOpen?: (photo: Photo) => void;
  /** align the grid to the right for the visitor's own messages */
  align?: "left" | "right";
  size?: "md" | "sm";
  className?: string;
}

/** Photos sent in a message, LINE style (one large photo, or a 2-column grid). */
export function PhotoGrid({ photos, onOpen, align = "left", size = "md", className }: PhotoGridProps) {
  if (photos.length === 0) return null;
  const single = photos.length === 1;
  return (
    <div
      className={cn(
        "grid gap-1",
        single ? "grid-cols-1" : "grid-cols-2",
        size === "md" ? (single ? "w-52 sm:w-60" : "w-56 sm:w-64") : single ? "w-40" : "w-44",
        align === "right" && "ml-auto",
        className,
      )}
    >
      {photos.map((photo, i) => (
        <button
          key={photo.id}
          type="button"
          onClick={() => onOpen?.(photo)}
          disabled={!onOpen}
          aria-label={`写真を拡大：${photo.alt || "写真"}`}
          className={cn(
            "group relative block overflow-hidden rounded-2xl bg-white/40 shadow-sm ring-1 ring-black/5 transition",
            "hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
            !single && "aspect-square",
            !single && photos.length === 3 && i === 0 && "col-span-2 aspect-[2/1]",
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs (sample SVGs / downscaled uploads) */}
          <img
            src={photo.src}
            alt={photo.alt || "写真"}
            loading="lazy"
            decoding="async"
            draggable={false}
            className={cn("block w-full object-cover", single ? "h-auto" : "h-full")}
          />
        </button>
      ))}
    </div>
  );
}

export interface PhotoLightboxProps {
  photo: Photo | null;
  onClose: () => void;
}

/** Enlarged photo in a dialog (bottom sheet on phones). */
export function PhotoLightbox({ photo, onClose }: PhotoLightboxProps) {
  return (
    <Modal open={photo !== null} onClose={onClose} title="写真" description={photo?.alt} size="lg">
      {photo && (
        <div className="overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URLs (sample SVGs / downscaled uploads) */}
          <img src={photo.src} alt={photo.alt || "写真"} className="mx-auto block max-h-[70dvh] w-full object-contain" />
        </div>
      )}
    </Modal>
  );
}
