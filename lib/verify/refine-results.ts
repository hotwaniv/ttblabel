import {
  FUZZY_TEXT_FIELDS,
  JUDGE_SIMILARITY_HIGH,
  JUDGE_SIMILARITY_LOW,
  LOW_CONFIDENCE_THRESHOLD,
} from "./constants";
import { GOVERNMENT_WARNING_TEXT } from "./government-warning";
import {
  normalizeForComparison,
  similarityRatio,
  statusFromSimilarity,
  stricterStatus,
} from "./fuzzy-match";
import { judgeBorderlineFieldStatus } from "./judge-match";
import type { FieldStatus, VerificationResult } from "./types";

const WARNING_PREGNANCY =
  "women should not drink alcoholic beverages during pregnancy";
const WARNING_BIRTH_DEFECTS = "birth defects";
const WARNING_IMPAIRS = "impairs your ability to drive";
const WARNING_MACHINERY = "machinery";

export type RefineOptions = {
  useJudge?: boolean;
};

function parseAbv(value: string): number | null {
  const percentMatch = value.match(/(\d+(?:\.\d+)?)\s*%\s*(?:alc|abv|vol)?/i);

  if (percentMatch) {
    return Number.parseFloat(percentMatch[1]);
  }

  const genericPercentMatch = value.match(/(\d+(?:\.\d+)?)\s*%/);

  if (genericPercentMatch) {
    return Number.parseFloat(genericPercentMatch[1]);
  }

  const proofMatch = value.match(/(\d+(?:\.\d+)?)\s*proof/i);

  if (proofMatch) {
    return Number.parseFloat(proofMatch[1]) / 2;
  }

  return null;
}

function refineAlcoholContent(
  extracted: string | null,
  expected: string
): FieldStatus {
  if (!extracted) {
    return "absent";
  }

  const extractedAbv = parseAbv(extracted);
  const expectedAbv = parseAbv(expected);

  if (extractedAbv === null || expectedAbv === null) {
    return "review";
  }

  const difference = Math.abs(extractedAbv - expectedAbv);

  if (difference <= 0.5) {
    return "pass";
  }

  if (difference <= 1) {
    return "warn";
  }

  return "fail";
}

type ParsedVolume = {
  milliliters: number;
  unit: "ml" | "l" | "floz";
};

function parseVolume(value: string): ParsedVolume | null {
  const normalized = normalizeForComparison(value);

  const milliliterMatch = normalized.match(/(\d+(?:\.\d+)?)\s*ml\b/);

  if (milliliterMatch) {
    return {
      milliliters: Number.parseFloat(milliliterMatch[1]),
      unit: "ml",
    };
  }

  const literMatch = normalized.match(/(\d+(?:\.\d+)?)\s*l\b/);

  if (literMatch) {
    return {
      milliliters: Number.parseFloat(literMatch[1]) * 1000,
      unit: "l",
    };
  }

  const flozMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:fl\s*oz|floz)\b/);

  if (flozMatch) {
    return {
      milliliters: Number.parseFloat(flozMatch[1]) * 29.5735,
      unit: "floz",
    };
  }

  return null;
}

function refineNetContents(
  extracted: string | null,
  expected: string
): FieldStatus {
  if (!extracted) {
    return "absent";
  }

  const extractedVolume = parseVolume(extracted);
  const expectedVolume = parseVolume(expected);

  if (!extractedVolume || !expectedVolume) {
    return statusFromSimilarity(similarityRatio(extracted, expected));
  }

  const volumeDifference = Math.abs(
    extractedVolume.milliliters - expectedVolume.milliliters
  );

  if (volumeDifference > 5) {
    return "fail";
  }

  if (extractedVolume.unit !== expectedVolume.unit) {
    return "warn";
  }

  return "pass";
}

function refineGovernmentWarning(extracted: string | null): FieldStatus {
  if (!extracted) {
    return "absent";
  }

  const normalized = normalizeForComparison(extracted);
  const hasPregnancyPart =
    normalized.includes(WARNING_PREGNANCY) ||
    (normalized.includes("pregnancy") &&
      normalized.includes(WARNING_BIRTH_DEFECTS));
  const hasImpairmentPart =
    normalized.includes(WARNING_IMPAIRS) && normalized.includes(WARNING_MACHINERY);

  if (!hasPregnancyPart || !hasImpairmentPart) {
    return "fail";
  }

  const similarity = similarityRatio(extracted, GOVERNMENT_WARNING_TEXT);

  if (similarity >= 0.85) {
    return "pass";
  }

  if (similarity >= 0.7) {
    return "warn";
  }

  return "fail";
}

function isFuzzyTextField(
  field: VerificationResult["field"]
): field is (typeof FUZZY_TEXT_FIELDS)[number] {
  return FUZZY_TEXT_FIELDS.includes(field as (typeof FUZZY_TEXT_FIELDS)[number]);
}

async function refineFuzzyTextField(
  field: VerificationResult["field"],
  extracted: string | null,
  expected: string,
  options?: RefineOptions
): Promise<FieldStatus> {
  if (!extracted) {
    return "absent";
  }

  const ratio = similarityRatio(extracted, expected);

  if (
    !options?.useJudge ||
    !isFuzzyTextField(field) ||
    ratio < JUDGE_SIMILARITY_LOW ||
    ratio >= JUDGE_SIMILARITY_HIGH
  ) {
    return statusFromSimilarity(ratio);
  }

  return judgeBorderlineFieldStatus(field, extracted, expected, ratio);
}

async function refineFieldStatus(
  result: VerificationResult,
  options?: RefineOptions
): Promise<FieldStatus> {
  if (result.confidence < LOW_CONFIDENCE_THRESHOLD && result.extracted) {
    return stricterStatus(result.status, "review");
  }

  if (result.status === "absent" || !result.extracted) {
    return result.extracted ? result.status : "absent";
  }

  let ruleStatus: FieldStatus;

  switch (result.field) {
    case "governmentWarning":
      ruleStatus = refineGovernmentWarning(result.extracted);
      break;
    case "alcoholContent":
      ruleStatus = refineAlcoholContent(result.extracted, result.expected);
      break;
    case "netContents":
      ruleStatus = refineNetContents(result.extracted, result.expected);
      break;
    case "brandName":
    case "classType":
    case "producerName":
    case "beverageType":
      ruleStatus = await refineFuzzyTextField(
        result.field,
        result.extracted,
        result.expected,
        options
      );
      break;
    default: {
      const exhaustiveCheck: never = result.field;
      return exhaustiveCheck;
    }
  }

  return stricterStatus(result.status, ruleStatus);
}

export async function refineVerificationResults(
  results: VerificationResult[],
  options?: RefineOptions
): Promise<VerificationResult[]> {
  const refined: VerificationResult[] = [];

  for (const result of results) {
    const status = await refineFieldStatus(result, options);

    if (status === result.status) {
      refined.push(result);
      continue;
    }

    refined.push({
      ...result,
      status,
      explanation: `${result.explanation} Server-side rule check adjusted status to "${status}".`,
    });
  }

  return refined;
}
