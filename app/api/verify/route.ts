import { auth } from "@/app/(auth)/auth";
import { verifyLabelImage } from "@/lib/verify/verify-label";
import { createLogger } from "@/lib/verify/logger";
import type { ApplicationFields } from "@/lib/verify/types";
import { parseVerifyFormData } from "./schema";

export const maxDuration = 60;

const log = createLogger("api/verify");

function wantsStream(request: Request, formData: FormData): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) {
    return true;
  }

  return formData.get("stream") === "1";
}

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    log.warn("unauthorized request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const formData = await request.formData();
    const { image, ...fields } = parseVerifyFormData(formData);
    const applicationFields = fields as ApplicationFields;
    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const stream = wantsStream(request, formData);

    log.info("request received", {
      requestId,
      userId: session.user.id,
      filename: image instanceof File ? image.name : undefined,
      imageSizeBytes: imageBuffer.length,
      stream,
      brandName: applicationFields.brandName,
    });

    if (!stream) {
      const response = await verifyLabelImage(imageBuffer, applicationFields, {
        mimeType: image.type,
        filename: image instanceof File ? image.name : undefined,
      });

      log.info("non-streaming response sent", {
        requestId,
        overall: response.overall,
        processingTimeMs: response.processingTimeMs,
      });

      return Response.json(response);
    }

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        try {
          let fieldCount = 0;

          const result = await verifyLabelImage(
            imageBuffer,
            applicationFields,
            {
              mimeType: image.type,
              filename: image instanceof File ? image.name : undefined,
              onFieldComplete: (field) => {
                fieldCount++;
                log.debug("sse field sent", { requestId, field: field.field, fieldCount });
                send("field", field);
              },
            }
          );

          log.info("streaming response complete", {
            requestId,
            overall: result.overall,
            processingTimeMs: result.processingTimeMs,
            fieldCount,
          });

          send("complete", result);
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Verification failed";
          log.error("streaming error", { requestId, error: message });
          send("error", { error: message, code: "INTERNAL_ERROR" });
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";

    log.error("request failed", { requestId, error: message });

    return Response.json({ error: message }, { status: 400 });
  }
}
