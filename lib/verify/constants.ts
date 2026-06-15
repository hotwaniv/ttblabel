export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_IMAGES = 300;
export const BATCH_CONCURRENCY = 5;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const PREFILL_LOW_CONFIDENCE_THRESHOLD = 0.7;
export const MAX_IMAGE_DIMENSION = 2000;

export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type LabelImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export const FUZZY_TEXT_FIELDS = [
  "brandName",
  "classType",
  "producerName",
  "beverageType",
] as const;
