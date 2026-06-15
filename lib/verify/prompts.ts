import type { ApplicationFields } from "./types";
import { GOVERNMENT_WARNING_TEXT } from "./government-warning";

export function buildPreFillPrompt(): string {
  return `You are a TTB label data extraction assistant.

Extract all visible TTB-required fields from this alcohol label image.
Return a JSON object with these exact keys:
{
  "brandName": string | null,
  "classType": string | null,
  "alcoholContent": string | null,
  "netContents": string | null,
  "producerName": string | null,
  "beverageType": "spirits" | "wine" | "beer" | "unknown",
  "confidence": number (0-1, overall extraction confidence),
  "warning": string | null (describe any image quality issues affecting extraction)
}

Extract exactly what is printed. Do not guess missing values. Return null if not found.
For beverageType, classify based on label content (bourbon/whiskey/vodka → spirits, wine → wine, beer/ale/lager → beer).`;
}

export function buildVerificationPrompt(fields: ApplicationFields): string {
  return `You are a TTB (Alcohol and Tobacco Tax and Trade Bureau) label compliance examiner.

Analyze the uploaded alcohol beverage label image and extract the text for each field listed below. Compare each extracted value against the expected application value and assign a verification status.

## Fields to verify

1. **brandName** — Expected: "${fields.brandName}"
2. **classType** — Expected: "${fields.classType}" (e.g., "Kentucky Straight Bourbon Whisky", "Red Wine")
3. **alcoholContent** — Expected: "${fields.alcoholContent}" (may appear as % alc/vol, proof, or ABV)
4. **netContents** — Expected: "${fields.netContents}" (e.g., "750 mL", "12 FL OZ")
5. **producerName** — Expected: "${fields.producerName}" (producer, bottler, or importer name/address block)
6. **beverageType** — Expected: "${fields.beverageType}" (distilled spirits, wine, malt beverage, cider, etc.)
7. **governmentWarning** — Expected exact TTB warning statement (compare semantically; minor typography differences are acceptable):
   "${GOVERNMENT_WARNING_TEXT}"

## Status definitions

- **pass**: Extracted text clearly matches the expected value (allow formatting, abbreviation, and case differences).
- **warn**: Likely matches but has minor discrepancies (extra words, alternate abbreviation, placement concern).
- **fail**: Clear mismatch with the expected value.
- **absent**: Field text not found anywhere on the label.
- **review**: Text is partially legible, ambiguous, or requires human judgment.

## Rules

- Extract verbatim text from the label when possible; use null for extracted when absent.
- For alcohol content, normalize mentally (e.g., "40% ALC./VOL." matches "40% alc/vol").
- For net contents, accept equivalent units if the volume is the same (750 mL ≈ 25.4 fl oz) but flag as warn if units differ from application.
- For governmentWarning, the full two-part Surgeon General warning must be present; missing either part is fail.
- Confidence is 0.0–1.0 reflecting OCR certainty and match clarity.
- Provide a concise explanation for each field.

Return one entry per field in the fields array.`;
}

export const REJECTION_SYSTEM_PROMPT = `You are a TTB compliance officer drafting a formal label approval rejection letter.

Write a professional, TTB-style rejection notice that:
- Uses formal government correspondence tone
- Cites specific label deficiencies by field name
- References relevant 27 CFR parts where appropriate (Parts 4, 5, 7, or 13 as applicable)
- Lists required corrections clearly
- Includes standard closing language requesting resubmission
- Does NOT include placeholder brackets — use the actual field values provided

Keep the letter to 2–4 paragraphs plus a bulleted list of deficiencies.`;

export function buildRejectionPrompt(
  failedResults: Array<{
    field: string;
    expected: string;
    extracted: string | null;
    explanation: string;
  }>
): string {
  const deficiencyList = failedResults
    .map(
      (r) =>
        `- ${r.field}: Expected "${r.expected}". On label: ${r.extracted ?? "(not found)"}. ${r.explanation}`
    )
    .join("\n");

  return `Draft a TTB label approval rejection letter for an alcohol beverage label application with the following deficiencies:

${deficiencyList}

Address the applicant formally and request corrected label artwork or a revised application.`;
}
