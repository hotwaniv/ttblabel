import JSZip from "jszip";
import { MAX_BATCH_IMAGES, MAX_ZIP_BYTES } from "./constants";
import {
  baseFilename,
  isImageEntry,
  isSupportedImageFilename,
  mimeFromFilename,
} from "./zip-image-utils";
import type { LabelImageMimeType } from "./constants";

export type ClientZipImage = {
  filename: string;
  previewUrl: string;
  mimeType: LabelImageMimeType;
};

export function revokeClientZipImages(images: ClientZipImage[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export async function extractImagesFromZipFile(
  file: File
): Promise<ClientZipImage[]> {
  if (file.size > MAX_ZIP_BYTES) {
    throw new Error("ZIP archive must be less than 200MB");
  }

  const zip = await JSZip.loadAsync(file);
  const entries = Object.entries(zip.files).filter(
    ([path, entry]) => !entry.dir && isImageEntry(path)
  );

  if (entries.length === 0) {
    throw new Error("ZIP archive must contain at least one label image");
  }

  if (entries.length > MAX_BATCH_IMAGES) {
    throw new Error(`ZIP archive may contain at most ${MAX_BATCH_IMAGES} images`);
  }

  const images: ClientZipImage[] = [];

  for (const [path, entry] of entries) {
    const filename = baseFilename(path);

    if (!isSupportedImageFilename(filename)) {
      continue;
    }

    const mimeType = mimeFromFilename(filename);
    if (!mimeType) {
      continue;
    }

    const blob = await entry.async("blob");
    images.push({
      filename,
      previewUrl: URL.createObjectURL(blob),
      mimeType,
    });
  }

  if (images.length === 0) {
    throw new Error("ZIP archive must contain JPEG, PNG, or WebP label images");
  }

  return images;
}
