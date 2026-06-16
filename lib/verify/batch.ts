import JSZip from "jszip";
import {
  BATCH_CONCURRENCY,
  MAX_BATCH_IMAGES,
  MAX_ZIP_BYTES,
  type LabelImageMimeType,
} from "./constants";
import {
  buildRowLookup,
  type ExpectedRow,
  type ExpectedRowLookup,
} from "./expected-sheet";
import { resolveExpectedFields } from "./expected-sheet-match";
import { prefillFromLabel } from "./prefill-label";
import { prefilledToApplicationFields } from "./prefill-to-application";
import { verifyLabelImage } from "./verify-label";
import type { BatchItemResult, VerificationResult } from "./types";
import {
  baseFilename,
  isImageEntry,
  isSupportedImageFilename,
  mimeFromFilename,
} from "./zip-image-utils";
export { computeBatchSummary } from "./batch-summary";

export type ExtractedZipImage = {
  filename: string;
  buffer: Buffer;
  mimeType: LabelImageMimeType;
};

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
    const filename = baseFilename(path);
    const mimeType = mimeFromFilename(filename);

    if (!mimeType || !isSupportedImageFilename(filename)) {
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
  expectedRows?: ExpectedRow[];
  rowLookup?: ExpectedRowLookup;
  onFieldComplete?: (
    filename: string,
    field: VerificationResult
  ) => void | Promise<void>;
  onItemComplete?: (item: BatchItemResult) => void;
};

export async function runBatchVerification(
  images: ExtractedZipImage[],
  options?: BatchVerificationOptions
): Promise<BatchItemResult[]> {
  const expectedRows = options?.expectedRows;
  const rowLookup =
    options?.rowLookup ??
    (expectedRows ? buildRowLookup(expectedRows) : undefined);

  return runWithConcurrency(
    images,
    BATCH_CONCURRENCY,
    async (image): Promise<BatchItemResult> => {
      let item: BatchItemResult;

      try {
        const prefilled = await prefillFromLabel(image.buffer, {
          mimeType: image.mimeType,
          filename: image.filename,
        });
        const extractedFields = prefilledToApplicationFields(prefilled);

        let fields = extractedFields;
        const useJudge = Boolean(expectedRows && rowLookup);

        if (expectedRows && rowLookup) {
          const resolved = await resolveExpectedFields(
            image.filename,
            rowLookup,
            expectedRows,
            extractedFields
          );

          if (!resolved) {
            item = {
              filename: image.filename,
              overall: "FAIL",
              results: [],
              rejectionDraft: null,
              error: "No matching spreadsheet row found for this image",
            };
            options?.onItemComplete?.(item);
            return item;
          }

          fields = resolved.fields;
        }

        const result = await verifyLabelImage(image.buffer, fields, {
          mimeType: image.mimeType,
          filename: image.filename,
          useJudge,
          onFieldComplete: (field) =>
            options?.onFieldComplete?.(image.filename, field),
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
