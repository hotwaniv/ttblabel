import { z } from "zod";

export const applicationFieldsSchema = z.object({
  brandName: z.string().default(""),
  classType: z.string().default(""),
  alcoholContent: z.string().default(""),
  netContents: z.string().default(""),
  producerName: z.string().default(""),
  beverageType: z.string().default(""),
});

export type ApplicationFields = z.infer<typeof applicationFieldsSchema>;

export const verifiableFieldKeySchema = z.enum([
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "producerName",
  "beverageType",
  "governmentWarning",
]);

export type VerifiableFieldKey = z.infer<typeof verifiableFieldKeySchema>;

export const fieldStatusSchema = z.enum([
  "pass",
  "warn",
  "fail",
  "absent",
  "review",
]);

export type FieldStatus = z.infer<typeof fieldStatusSchema>;

export const overallResultSchema = z.enum(["PASS", "FAIL", "REVIEW"]);

export type OverallResult = z.infer<typeof overallResultSchema>;

export const verificationResultSchema = z.object({
  field: verifiableFieldKeySchema,
  status: fieldStatusSchema,
  extracted: z.string().nullable(),
  expected: z.string(),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

export type VerificationResult = z.infer<typeof verificationResultSchema>;

export const verifyResponseSchema = z.object({
  overall: overallResultSchema,
  results: z.array(verificationResultSchema),
  rejectionDraft: z.string().nullable(),
});

export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

export const prefilledBeverageTypeSchema = z.enum([
  "spirits",
  "wine",
  "beer",
  "unknown",
]);

export type PrefilledBeverageType = z.infer<typeof prefilledBeverageTypeSchema>;

export const prefilledFieldsSchema = z.object({
  brandName: z.string().nullable(),
  classType: z.string().nullable(),
  alcoholContent: z.string().nullable(),
  netContents: z.string().nullable(),
  producerName: z.string().nullable(),
  beverageType: prefilledBeverageTypeSchema,
  confidence: z.number().min(0).max(1),
  warning: z.string().nullable(),
});

export type PrefilledFields = z.infer<typeof prefilledFieldsSchema>;

export const batchItemResultSchema = verifyResponseSchema.extend({
  filename: z.string(),
  error: z.string().nullable(),
});

export type BatchItemResult = z.infer<typeof batchItemResultSchema>;

export const batchFailureReasonSchema = z.object({
  field: verifiableFieldKeySchema,
  count: z.number(),
  filenames: z.array(z.string()),
});

export type BatchFailureReason = z.infer<typeof batchFailureReasonSchema>;

export const batchSmartSummarySchema = z.object({
  passCount: z.number(),
  failCount: z.number(),
  reviewCount: z.number(),
  errorCount: z.number(),
  topFailureReasons: z.array(batchFailureReasonSchema),
});

export type BatchSmartSummary = z.infer<typeof batchSmartSummarySchema>;

export const batchVerifyResponseSchema = z.object({
  total: z.number(),
  completed: z.number(),
  items: z.array(batchItemResultSchema),
  summary: batchSmartSummarySchema,
});

export type BatchVerifyResponse = z.infer<typeof batchVerifyResponseSchema>;

export type BatchFieldEvent = VerificationResult & {
  filename: string;
};

// Client-side override types — not persisted server-side
export type FieldOverride = {
  status: FieldStatus;
  reason: string;
  overriddenAt: string;
};

export type OverrideMap = Partial<Record<VerifiableFieldKey, FieldOverride>>;

export const aiFieldExtractionSchema = z.object({
  field: verifiableFieldKeySchema,
  status: fieldStatusSchema,
  extracted: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

export const aiVerificationSchema = z.object({
  fields: z.array(aiFieldExtractionSchema),
});

export type AiVerification = z.infer<typeof aiVerificationSchema>;
export type AiFieldExtraction = z.infer<typeof aiFieldExtractionSchema>;

export const FIELD_LABELS: Record<VerifiableFieldKey, string> = {
  brandName: "Brand Name",
  classType: "Class / Type",
  alcoholContent: "Alcohol Content",
  netContents: "Net Contents",
  producerName: "Producer / Bottler",
  beverageType: "Beverage Type",
  governmentWarning: "Government Warning",
};

// Display order for all 7 verifiable fields (core → important → optional)
export const FIELD_ORDER: VerifiableFieldKey[] = [
  "brandName",
  "alcoholContent",
  "governmentWarning",
  "classType",
  "netContents",
  "producerName",
  "beverageType",
];

export const FIELD_PRIORITY_GROUPS: Record<
  "core" | "important" | "optional",
  { label: string; fields: VerifiableFieldKey[] }
> = {
  core: {
    label: "Core Fields",
    fields: ["brandName", "alcoholContent", "governmentWarning"],
  },
  important: {
    label: "Important Fields",
    fields: ["classType", "netContents", "producerName"],
  },
  optional: {
    label: "Optional Fields",
    fields: ["beverageType"],
  },
};
