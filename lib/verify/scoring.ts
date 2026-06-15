import type { OverallResult, VerificationResult } from "./types";

export function computeOverallResult(
  results: VerificationResult[]
): OverallResult {
  if (results.some((result) => result.status === "fail")) {
    return "FAIL";
  }

  if (
    results.some((result) =>
      ["warn", "absent", "review"].includes(result.status)
    )
  ) {
    return "REVIEW";
  }

  return "PASS";
}
