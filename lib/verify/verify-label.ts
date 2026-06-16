import { generateText, streamObject } from "ai";
import { buildExpectedValues, mergeVerificationResults } from "./merge-results";
import { preprocessLabelImage } from "./image";
import {
  buildRejectionPrompt,
  buildVerificationPrompt,
  REJECTION_SYSTEM_PROMPT,
} from "./prompts";
import { createLogger } from "./logger";
import { getVerificationModel } from "./provider";
import { refineVerificationResults } from "./refine-results";
import { computeOverallResult } from "./scoring";
import {
  aiVerificationSchema,
  type AiFieldExtraction,
  type ApplicationFields,
  type VerifiableFieldKey,
  type VerificationResult,
  type VerifyResponse,
} from "./types";

const log = createLogger("verify-label");

export type VerifyLabelOptions = {
  mimeType?: string | null;
  filename?: string;
  useJudge?: boolean;
  onFieldComplete?: (field: VerificationResult) => void | Promise<void>;
};

export type VerifyLabelResponse = VerifyResponse & {
  processingTimeMs: number;
};

function isStreamableAiField(f: unknown): f is AiFieldExtraction {
  if (!f || typeof f !== "object") return false;
  const obj = f as Record<string, unknown>;
  return (
    typeof obj.field === "string" &&
    typeof obj.status === "string" &&
    typeof obj.confidence === "number" &&
    typeof obj.explanation === "string" &&
    "extracted" in obj
  );
}

async function toVerificationResult(
  f: AiFieldExtraction,
  expectedValues: Record<VerificationResult["field"], string>,
  options?: VerifyLabelOptions
): Promise<VerificationResult> {
  const merged: VerificationResult = {
    field: f.field,
    status: f.status,
    extracted: f.extracted,
    expected: expectedValues[f.field] ?? "",
    confidence: f.confidence,
    explanation: f.explanation,
  };
  const [refined] = await refineVerificationResults([merged], {
    useJudge: options?.useJudge,
  });
  return refined;
}

export async function verifyLabelImage(
  imageBuffer: Buffer,
  fields: ApplicationFields,
  options?: VerifyLabelOptions
): Promise<VerifyLabelResponse> {
  const start = Date.now();
  const filename = options?.filename ?? "unknown";

  log.info("verification started", {
    filename,
    imageSizeBytes: imageBuffer.length,
    brandName: fields.brandName,
    beverageType: fields.beverageType,
    useJudge: options?.useJudge ?? false,
  });

  const { buffer, mimeType } = await preprocessLabelImage(
    imageBuffer,
    options?.mimeType,
    options?.filename
  );

  log.debug("image preprocessed", { filename, mimeType, processedSizeBytes: buffer.length });

  const model = getVerificationModel();
  const messages = [
    {
      role: "user" as const,
      content: [
        { type: "text" as const, text: buildVerificationPrompt(fields) },
        { type: "image" as const, image: buffer, mediaType: mimeType },
      ],
    },
  ];

  const { partialObjectStream, object: finalObject } = streamObject({
    model,
    schema: aiVerificationSchema,
    messages,
  });

  const expectedValues = buildExpectedValues(fields);
  const streamedFields = new Set<VerifiableFieldKey>();
  const seenIndices = new Set<number>();

  for await (const partial of partialObjectStream) {
    if (!partial.fields) continue;

    for (let i = 0; i < partial.fields.length - 1; i++) {
      if (seenIndices.has(i)) continue;
      const f = partial.fields[i];
      if (!isStreamableAiField(f)) continue;

      seenIndices.add(i);
      const refined = await toVerificationResult(f, expectedValues, options);
      streamedFields.add(refined.field);

      log.debug("field complete", {
        filename,
        field: refined.field,
        status: refined.status,
        confidence: refined.confidence,
        extracted: refined.extracted,
      });

      await options?.onFieldComplete?.(refined);
    }
  }

  const aiResult = await finalObject;
  const results = await refineVerificationResults(
    mergeVerificationResults(aiResult, fields),
    { useJudge: options?.useJudge }
  );

  for (const item of results) {
    if (streamedFields.has(item.field)) continue;

    log.debug("field filled (stream tail or ai omitted)", {
      filename,
      field: item.field,
      status: item.status,
    });

    await options?.onFieldComplete?.(item);
  }

  const overall = computeOverallResult(results);
  let rejectionDraft: string | null = null;

  if (overall === "FAIL") {
    log.info("generating rejection draft", { filename, failedCount: results.filter(r => r.status === "fail").length });
    const failedResults = results.filter((result) => result.status === "fail");
    const { text } = await generateText({
      model,
      system: REJECTION_SYSTEM_PROMPT,
      prompt: buildRejectionPrompt(failedResults),
    });
    rejectionDraft = text;
    log.debug("rejection draft generated", { filename, draftLength: text.length });
  }

  const processingTimeMs = Date.now() - start;

  log.info("verification complete", {
    filename,
    overall,
    processingTimeMs,
    fieldCount: results.length,
    passCount: results.filter(r => r.status === "pass").length,
    failCount: results.filter(r => r.status === "fail").length,
    warnCount: results.filter(r => r.status === "warn").length,
    reviewCount: results.filter(r => r.status === "review").length,
  });

  return {
    overall,
    results,
    rejectionDraft,
    processingTimeMs,
  };
}
