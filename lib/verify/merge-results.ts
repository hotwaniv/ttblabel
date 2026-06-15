import type { ApplicationFields, VerificationResult } from "./types";
import { GOVERNMENT_WARNING_TEXT } from "./government-warning";
import type { AiVerification } from "./types";

export function buildExpectedValues(
  fields: ApplicationFields
): Record<VerificationResult["field"], string> {
  return {
    brandName: fields.brandName,
    classType: fields.classType,
    alcoholContent: fields.alcoholContent,
    netContents: fields.netContents,
    producerName: fields.producerName,
    beverageType: fields.beverageType,
    governmentWarning: GOVERNMENT_WARNING_TEXT,
  };
}

export function mergeVerificationResults(
  aiResult: AiVerification,
  fields: ApplicationFields
): VerificationResult[] {
  const expectedValues = buildExpectedValues(fields);
  const aiByField = new Map(aiResult.fields.map((item) => [item.field, item]));

  return (Object.keys(expectedValues) as VerificationResult["field"][]).map(
    (field) => {
      const aiField = aiByField.get(field);

      if (!aiField) {
        return {
          field,
          status: "review" as const,
          extracted: null,
          expected: expectedValues[field],
          confidence: 0,
          explanation: "Model did not return a result for this field.",
        };
      }

      return {
        field,
        status: aiField.status,
        extracted: aiField.extracted,
        expected: expectedValues[field],
        confidence: aiField.confidence,
        explanation: aiField.explanation,
      };
    }
  );
}
