import { auth } from "@/app/(auth)/auth";
import {
  computeBatchSummary,
  extractImagesFromZip,
  runBatchVerification,
} from "@/lib/verify/batch";
import {
  buildRowLookup,
  parseExpectedSheetRows,
  type ExpectedRow,
} from "@/lib/verify/expected-sheet";
import { createLogger } from "@/lib/verify/logger";
import type { BatchItemResult, BatchVerifyResponse } from "@/lib/verify/types";
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
    const { archive, expectedSheet } = parseBatchVerifyFormData(formData);

    const zipBuffer = Buffer.from(await archive.arrayBuffer());
    const images = await extractImagesFromZip(zipBuffer);

    let expectedRows: ExpectedRow[] | undefined;
    let rowLookup: ReturnType<typeof buildRowLookup> | undefined;

    if (expectedSheet) {
      const parseStart = Date.now();

      try {
        const sheetBuffer = Buffer.from(await expectedSheet.arrayBuffer());
        expectedRows = await parseExpectedSheetRows(sheetBuffer);
        rowLookup = buildRowLookup(expectedRows);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Could not read spreadsheet — check it has the expected columns";

        log.warn("expected sheet parse failed", { requestId, error: message });
        return Response.json(
          {
            error:
              message.startsWith("Spreadsheet") ||
              message.startsWith("No usable")
                ? message
                : "Could not read spreadsheet — check it has the expected columns",
          },
          { status: 400 }
        );
      }

      const parseTimeMs = Date.now() - parseStart;
      log.info("expected sheet parsed", {
        requestId,
        rowCount: expectedRows.length,
        parseTimeMs,
      });
    }

    log.info("batch started", {
      requestId,
      userId: session.user.id,
      imageCount: images.length,
      zipSizeBytes: zipBuffer.byteLength,
      expectedSheetAttached: Boolean(expectedRows),
      expectedRowCount: expectedRows?.length ?? 0,
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(sseEncode(event, data)));
        };

        send("start", {
          total: images.length,
          filenames: images.map((image) => image.filename),
        });

        try {
          let completedCount = 0;
          const items: BatchItemResult[] = [];

          await runBatchVerification(images, {
            expectedRows,
            rowLookup,
            onFieldComplete: (filename, field) => {
              send("field", { filename, ...field });
            },
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
