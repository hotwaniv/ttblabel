import type { BatchItemResult, BatchVerifyResponse } from "./types";

export type BatchStreamHandlers = {
  onStart: (total: number) => void;
  onItem: (item: BatchItemResult) => void;
  onComplete: (response: BatchVerifyResponse) => void;
  onError: (message: string) => void;
};

function parseSseChunk(
  chunk: string,
  handlers: BatchStreamHandlers
): string {
  const blocks = chunk.split("\n\n");
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) continue;

    let eventName = "message";
    let dataLine = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice(5).trim();
      }
    }

    if (!dataLine) continue;

    const payload = JSON.parse(dataLine) as unknown;

    if (eventName === "start") {
      handlers.onStart((payload as { total: number }).total);
    } else if (eventName === "item") {
      handlers.onItem(payload as BatchItemResult);
    } else if (eventName === "complete") {
      handlers.onComplete(payload as BatchVerifyResponse);
    } else if (eventName === "error") {
      handlers.onError(
        (payload as { error?: string }).error ?? "Batch verification failed"
      );
    }
  }

  return remainder;
}

export async function verifyBatchWithStream(
  url: string,
  formData: FormData,
  handlers: BatchStreamHandlers
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: formData,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    handlers.onError(data?.error ?? "Batch verification request failed");
    return;
  }

  const reader = response.body?.getReader();

  if (!reader) {
    handlers.onError("Streaming response unavailable");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseChunk(buffer, handlers);
  }

  if (buffer.trim()) {
    parseSseChunk(`${buffer}\n\n`, handlers);
  }
}
