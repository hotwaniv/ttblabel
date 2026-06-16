import {
  IMAGE_MIME_TYPES,
  type LabelImageMimeType,
} from "./constants";

export const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;

export function mimeFromFilename(filename: string): LabelImageMimeType | null {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (lower.endsWith(".png")) {
    return "image/png";
  }

  if (lower.endsWith(".webp")) {
    return "image/webp";
  }

  return null;
}

export function isImageEntry(path: string): boolean {
  const lower = path.toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function baseFilename(path: string): string {
  return path.split("/").pop() ?? path;
}

export function isSupportedImageFilename(filename: string): boolean {
  const mimeType = mimeFromFilename(filename);
  return mimeType !== null && IMAGE_MIME_TYPES.includes(mimeType);
}
