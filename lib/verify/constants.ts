export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_BATCH_IMAGES = 300;
export const BATCH_CONCURRENCY = 5;
export const MAX_ZIP_BYTES = 200 * 1024 * 1024;
export const MAX_EXPECTED_SHEET_BYTES = 5 * 1024 * 1024;
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

export const EXPECTED_SHEET_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
] as const;

// Similarity band where pure threshold comparison is ambiguous enough
// to warrant a Claude judgment call (covers both the pass/warn and
// warn/fail boundaries used by statusFromSimilarity).
export const JUDGE_SIMILARITY_LOW = 0.65;
export const JUDGE_SIMILARITY_HIGH = 0.92;

// Row-matching fuzzy fallback thresholds (lib/verify/expected-sheet-match.ts)
export const ROW_MATCH_MIN_SCORE = 0.5;
export const ROW_MATCH_JUDGE_BAND_HIGH = 0.85;
export const ROW_MATCH_CLOSE_CANDIDATE_GAP = 0.05;
export const ROW_MATCH_MAX_CANDIDATES = 5;
