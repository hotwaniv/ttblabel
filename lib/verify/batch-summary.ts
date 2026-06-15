import type {
  BatchFailureReason,
  BatchItemResult,
  BatchSmartSummary,
  VerifiableFieldKey,
} from "./types";

export function computeBatchSummary(items: BatchItemResult[]): BatchSmartSummary {
  const passCount = items.filter((i) => i.overall === "PASS" && !i.error).length;
  const failCount = items.filter((i) => i.overall === "FAIL" && !i.error).length;
  const reviewCount = items.filter((i) => i.overall === "REVIEW" && !i.error).length;
  const errorCount = items.filter((i) => !!i.error).length;

  const failuresByField = new Map<VerifiableFieldKey, string[]>();
  for (const item of items) {
    if (item.error || item.overall !== "FAIL") continue;
    for (const result of item.results) {
      if (result.status !== "fail") continue;
      const existing = failuresByField.get(result.field) ?? [];
      if (!existing.includes(item.filename)) existing.push(item.filename);
      failuresByField.set(result.field, existing);
    }
  }

  const topFailureReasons: BatchFailureReason[] = [...failuresByField.entries()]
    .map(([field, filenames]) => ({ field, count: filenames.length, filenames }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return { passCount, failCount, reviewCount, errorCount, topFailureReasons };
}
