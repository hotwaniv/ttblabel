import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type LabelImageMimeType,
} from "./constants";

export type PreprocessedLabelImage = {
  buffer: Buffer;
  mimeType: LabelImageMimeType;
};

function detectMimeType(
  buffer: Buffer,
  filename?: string,
  hint?: string | null
): LabelImageMimeType | null {
  // Magic byte detection
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // Filename fallback
  if (filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
  }

  // Hint fallback
  if (hint && IMAGE_MIME_TYPES.includes(hint as LabelImageMimeType)) {
    return hint as LabelImageMimeType;
  }

  return null;
}

export async function preprocessLabelImage(
  buffer: Buffer,
  hintMimeType?: string | null,
  filename?: string
): Promise<PreprocessedLabelImage> {
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error("Image must be less than 10MB");
  }

  const mimeType = detectMimeType(buffer, filename, hintMimeType);
  if (!mimeType) {
    throw new Error("Image must be JPEG, PNG, or WebP");
  }

  return { buffer, mimeType };
}
