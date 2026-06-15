import { auth } from "@/app/(auth)/auth";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "@/lib/verify/constants";
import { prefillFromLabel } from "@/lib/verify/prefill-label";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof Blob) || image.size === 0) {
      return Response.json(
        { error: "Valid image required", code: "INVALID_IMAGE" },
        { status: 400 }
      );
    }

    if (image.size > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: "Image must be less than 10MB", code: "INVALID_IMAGE" },
        { status: 400 }
      );
    }

    if (
      !IMAGE_MIME_TYPES.includes(
        image.type as (typeof IMAGE_MIME_TYPES)[number]
      )
    ) {
      return Response.json(
        { error: "Image must be JPEG, PNG, or WebP", code: "INVALID_IMAGE" },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const prefilled = await prefillFromLabel(imageBuffer, {
      mimeType: image.type,
      filename: image instanceof File ? image.name : undefined,
    });

    return Response.json(prefilled);
  } catch {
    return Response.json(
      {
        error: "Pre-fill failed. Please fill fields manually.",
        code: "PREFILL_ERROR",
      },
      { status: 500 }
    );
  }
}
