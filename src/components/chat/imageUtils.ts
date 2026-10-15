/**
 * Browser-only helpers to turn a photo from the device into a small JPEG data URL
 * (≤ 800 px on the long side, quality 0.8) so it fits in the demo's browser storage.
 */
import { fitWithin } from "./chatModel";

export const MAX_IMAGE_SIZE = 800;
export const JPEG_QUALITY = 0.8;
/** Larger originals are refused before decoding (protects phones with little memory). */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export class ImageReadError extends Error {
  constructor(
    message: string,
    readonly reason: "type" | "size" | "decode",
  ) {
    super(message);
    this.name = "ImageReadError";
  }
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<Decoded> {
  // createImageBitmap applies the EXIF orientation of phone photos.
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall back to <img> (older Safari, unusual formats)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new ImageReadError("画像を読み込めませんでした", "decode");
  }
}

/** Reads an image file and returns a downscaled JPEG data URL. Throws ImageReadError. */
export async function downscaleImage(file: File, maxSize = MAX_IMAGE_SIZE, quality = JPEG_QUALITY): Promise<string> {
  if (!file.type.startsWith("image/")) throw new ImageReadError("画像ファイルではありません", "type");
  if (file.size > MAX_SOURCE_BYTES) throw new ImageReadError("画像のサイズが大きすぎます", "size");

  const decoded = await decode(file);
  try {
    const { width, height } = fitWithin(decoded.width, decoded.height, maxSize);
    if (width === 0 || height === 0) throw new ImageReadError("画像を読み込めませんでした", "decode");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageReadError("画像を読み込めませんでした", "decode");
    // JPEG has no transparency: paint white first so transparent PNGs don't turn black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.source, 0, 0, width, height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (!url.startsWith("data:image/jpeg")) throw new ImageReadError("画像を変換できませんでした", "decode");
    return url;
  } finally {
    decoded.release();
  }
}
