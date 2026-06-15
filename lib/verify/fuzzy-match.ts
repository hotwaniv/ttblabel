import { distance } from "fastest-levenshtein";
import type { FieldStatus } from "./types";

export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s%./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function similarityRatio(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);

  if (left.length === 0 && right.length === 0) {
    return 1;
  }

  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const maxLength = Math.max(left.length, right.length);
  return 1 - distance(left, right) / maxLength;
}

export function statusFromSimilarity(ratio: number): FieldStatus {
  if (ratio >= 0.9) {
    return "pass";
  }

  if (ratio >= 0.75) {
    return "warn";
  }

  return "fail";
}

export function stricterStatus(
  current: FieldStatus,
  next: FieldStatus
): FieldStatus {
  const severity: Record<FieldStatus, number> = {
    pass: 0,
    warn: 1,
    review: 2,
    absent: 3,
    fail: 4,
  };

  return severity[current] >= severity[next] ? current : next;
}
