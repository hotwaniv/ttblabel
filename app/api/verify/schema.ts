import { z } from "zod";
import {
  EXPECTED_SHEET_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_EXPECTED_SHEET_BYTES,
  MAX_IMAGE_BYTES,
  MAX_ZIP_BYTES,
} from "@/lib/verify/constants";
import { applicationFieldsSchema } from "@/lib/verify/types";

export { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES, MAX_ZIP_BYTES };

export const verifyRequestSchema = applicationFieldsSchema.extend({
  image: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_IMAGE_BYTES, {
      message: "Image must be less than 10MB",
    })
    .refine(
      (file) =>
        IMAGE_MIME_TYPES.includes(
          file.type as (typeof IMAGE_MIME_TYPES)[number]
        ),
      { message: "Image must be JPEG, PNG, or WebP" }
    ),
});

export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export const batchVerifyRequestSchema = z.object({
  archive: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_ZIP_BYTES, {
      message: "ZIP archive must be less than 200MB",
    })
    .refine((file) => {
      if (
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed"
      ) {
        return true;
      }

      return file instanceof File && file.name.toLowerCase().endsWith(".zip");
    }, { message: "Upload must be a ZIP archive" }),
  expectedSheet: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_EXPECTED_SHEET_BYTES, {
      message: "Expected-values spreadsheet must be less than 5MB",
    })
    .refine((file) => {
      if (
        EXPECTED_SHEET_MIME_TYPES.includes(
          file.type as (typeof EXPECTED_SHEET_MIME_TYPES)[number]
        )
      ) {
        return true;
      }

      return file instanceof File && file.name.toLowerCase().endsWith(".xlsx");
    }, { message: "Expected-values upload must be an .xlsx spreadsheet" })
    .optional(),
});

export type BatchVerifyRequest = z.infer<typeof batchVerifyRequestSchema>;

function readApplicationFields(formData: FormData) {
  return {
    brandName: formData.get("brandName"),
    classType: formData.get("classType"),
    alcoholContent: formData.get("alcoholContent"),
    netContents: formData.get("netContents"),
    producerName: formData.get("producerName"),
    beverageType: formData.get("beverageType"),
  };
}

export function parseVerifyFormData(formData: FormData) {
  const image = formData.get("image");

  if (!(image instanceof Blob) || image.size === 0) {
    throw new Error("A label image is required");
  }

  return verifyRequestSchema.parse({
    image,
    ...readApplicationFields(formData),
  });
}

export function parseBatchVerifyFormData(formData: FormData) {
  const archive = formData.get("archive");
  const expectedSheet = formData.get("expectedSheet");

  if (!(archive instanceof Blob) || archive.size === 0) {
    throw new Error("A ZIP archive is required");
  }

  return batchVerifyRequestSchema.parse({
    archive,
    expectedSheet:
      expectedSheet instanceof Blob && expectedSheet.size > 0
        ? expectedSheet
        : undefined,
  });
}
