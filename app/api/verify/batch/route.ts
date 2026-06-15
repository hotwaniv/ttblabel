import { auth } from "@/app/(auth)/auth";
import {
  computeBatchSummary,
  extractImagesFromZip,
  runBatchVerification,
} from "@/lib/verify/batch";
import { createLogger } from "@/lib/verify/logger";
import type {
  ApplicationFields,
  BatchItemResult,
  BatchVerifyResponse,
} from "@/lib/verify/types";
import { parseBatchVerifyFormData } from "../schema";

export const maxDuration = 300;

const log = createLogger("api/verify/batch");

function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    log.warn("unauthorized batch request");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const formData = await request.formData();
    const { archive, ...fields } = parseBatchVerifyFormData(formData);
    const applicationFields = fields as ApplicationFields;

    const zipBuffer = Buffer.from(await archive.arrayBuffer());
    const images = await extractImagesFromZip(zipBuffer);

    log.info("batch started", {
      requestId,
      userId: session.user.id,
      imageCount: images.length,
      zipSizeBytes: zipBuffer.byteLength,
      brandName: applicationFields.brandName,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        // Tell the client how many images to expect upfront
        send("start", { total: images.length });

        try {
          let completedCount = 0;
          const items: BatchItemResult[] = [];

          await runBatchVerification(images, applicationFields, {
            onItemComplete: (item) => {
              completedCount++;
              items.push(item);

              log.debug("item complete", {
                requestId,
                filename: item.filename,
                overall: item.overall,
                completedCount,
                total: images.length,
              });

              send("item", item);
            },
          });

          const response: BatchVerifyResponse = {
            total: images.length,
            completed: images.length,
            items,
            summary: computeBatchSummary(items),
          };

          log.info("batch complete", {
            requestId,
            total: images.length,
            passCount: response.summary.passCount,
            failCount: response.summary.failCount,
            reviewCount: response.summary.reviewCount,
            errorCount: response.summary.errorCount,
          });

          send("complete", response);
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Batch verification failed";
          log.error("batch stream error", { requestId, error: message });
          send("error", { error: message });
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
      error instanceof Error ? error.message : "Batch verification failed";
    log.error("batch request failed", { requestId, error: message });
    return Response.json({ error: message }, { status: 400 });
  }
}
