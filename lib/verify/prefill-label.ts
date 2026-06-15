import { generateObject } from "ai";
import { preprocessLabelImage } from "./image";
import { buildPreFillPrompt } from "./prompts";
import { getVerificationModel } from "./provider";
import { prefilledFieldsSchema, type PrefilledFields } from "./types";

export async function prefillFromLabel(
  imageBuffer: Buffer,
  options?: { mimeType?: string | null; filename?: string }
): Promise<PrefilledFields> {
  const { buffer, mimeType } = await preprocessLabelImage(
    imageBuffer,
    options?.mimeType,
    options?.filename
  );

  const model = getVerificationModel();

  const { object } = await generateObject({
    model,
    schema: prefilledFieldsSchema,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPreFillPrompt() },
          { type: "image", image: buffer, mediaType: mimeType },
        ],
      },
    ],
  });

  return object;
}
