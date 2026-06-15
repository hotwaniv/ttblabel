import type { VerificationResult, VerifyResponse } from "@/lib/verify/types";

type StreamHandlers = {
  onField: (field: VerificationResult) => void;
  onComplete: (response: VerifyResponse & { processingTimeMs: number }) => void;
  onError: (message: string) => void;
};

function parseSseChunk(
  chunk: string,
  handlers: StreamHandlers
): string {
  const blocks = chunk.split("\n\n");
  const remainder = blocks.pop() ?? "";

  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }

    let eventName = "message";
    let dataLine = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLine = line.slice(5).trim();
      }
    }

    if (!dataLine) {
      continue;
    }

    const payload = JSON.parse(dataLine) as unknown;

    if (eventName === "field") {
      handlers.onField(payload as VerificationResult);
    } else if (eventName === "complete") {
      handlers.onComplete(
        payload as VerifyResponse & { processingTimeMs: number }
      );
    } else if (eventName === "error") {
      const errorPayload = payload as { error?: string };
      handlers.onError(errorPayload.error ?? "Verification failed");
    }
  }

  return remainder;
}

export async function verifyLabelWithStream(
  url: string,
  formData: FormData,
  handlers: StreamHandlers
): Promise<void> {
  formData.append("stream", "1");

  const response = await fetch(url, {
    method: "POST",
    headers: { Accept: "text/event-stream" },
    body: formData,
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    handlers.onError(data?.error ?? "Verification request failed");
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

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    buffer = parseSseChunk(buffer, handlers);
  }

  if (buffer.trim()) {
    parseSseChunk(`${buffer}\n\n`, handlers);
  }
}
