import JSZip from "jszip";
import {
  BATCH_CONCURRENCY,
  IMAGE_MIME_TYPES,
  MAX_BATCH_IMAGES,
  MAX_ZIP_BYTES,
  type LabelImageMimeType,
} from "./constants";
import { verifyLabelImage } from "./verify-label";
import type { ApplicationFields, BatchItemResult } from "./types";
export { computeBatchSummary } from "./batch-summary";

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export type ExtractedZipImage = {
  filename: string;
  buffer: Buffer;
  mimeType: LabelImageMimeType;
};

function mimeFromFilename(filename: string): LabelImageMimeType | null {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

function isImageEntry(filename: string): boolean {
  const lower = filename.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export async function extractImagesFromZip(
  zipBuffer: Buffer
): Promise<ExtractedZipImage[]> {
  if (zipBuffer.byteLength > MAX_ZIP_BYTES) {
    throw new Error("ZIP archive must be less than 200MB");
  }

  const zip = await JSZip.loadAsync(zipBuffer);
  const entries = Object.entries(zip.files).filter(
    ([path, file]) => !file.dir && isImageEntry(path)
  );

  if (entries.length === 0) {
    throw new Error("ZIP archive must contain at least one label image");
  }

  if (entries.length > MAX_BATCH_IMAGES) {
    throw new Error(`ZIP archive may contain at most ${MAX_BATCH_IMAGES} images`);
  }

  const images: ExtractedZipImage[] = [];

  for (const [path, file] of entries) {
    const filename = path.split("/").pop() ?? path;
    const mimeType = mimeFromFilename(filename);

    if (!mimeType || !IMAGE_MIME_TYPES.includes(mimeType)) {
      continue;
    }

    const buffer = Buffer.from(await file.async("arraybuffer"));
    images.push({ filename, buffer, mimeType });
  }

  if (images.length === 0) {
    throw new Error("ZIP archive must contain JPEG, PNG, or WebP label images");
  }

  return images;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, runWorker));

  return results;
}

export type BatchVerificationOptions = {
  onItemComplete?: (item: BatchItemResult) => void;
};

export async function runBatchVerification(
  images: ExtractedZipImage[],
  fields: ApplicationFields,
  options?: BatchVerificationOptions
): Promise<BatchItemResult[]> {
  return runWithConcurrency(
    images,
    BATCH_CONCURRENCY,
    async (image): Promise<BatchItemResult> => {
      let item: BatchItemResult;

      try {
        const result = await verifyLabelImage(image.buffer, fields, {
          mimeType: image.mimeType,
          filename: image.filename,
        });

        item = { filename: image.filename, ...result, error: null };
      } catch (error) {
        item = {
          filename: image.filename,
          overall: "FAIL",
          results: [],
          rejectionDraft: null,
          error:
            error instanceof Error ? error.message : "Verification failed",
        };
      }

      options?.onItemComplete?.(item);
      return item;
    }
  );
}
