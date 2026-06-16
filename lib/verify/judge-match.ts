import "server-only";

import { generateObject } from "ai";
import { z } from "zod";
import { getVerificationModel } from "./provider";
import {
  fieldStatusSchema,
  FIELD_LABELS,
  type FieldStatus,
  type VerifiableFieldKey,
} from "./types";

const judgeFieldStatusSchema = z.object({
  status: fieldStatusSchema,
  reasoning: z.string(),
});

export async function judgeBorderlineFieldStatus(
  field: VerifiableFieldKey,
  extracted: string,
  expected: string,
  similarity: number
): Promise<FieldStatus> {
  const model = getVerificationModel();
  const label = FIELD_LABELS[field];

  const { object } = await generateObject({
    model,
    schema: judgeFieldStatusSchema,
    prompt: `You are a TTB label compliance reviewer judging whether extracted label text matches the expected application value.

Field: ${label} (${field})
Extracted from label: "${extracted}"
Expected from application: "${expected}"
Automated similarity score: ${similarity.toFixed(3)} (ambiguous — between clear pass and clear fail thresholds)

Instructions:
- Treat abbreviations, reordering, punctuation, line breaks, and OCR noise as acceptable when the meaning is the same → pass or warn.
- Flag real content differences (wrong brand, wrong class, wrong producer, wrong product type) → fail.
- Use "warn" for minor discrepancies that likely still comply.
- Use "review" only when text is partially legible or genuinely ambiguous.

Return the final status and brief reasoning.`,
  });

  return object.status;
}
