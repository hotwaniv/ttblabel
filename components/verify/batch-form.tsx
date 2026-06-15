"use client";

import { FileArchiveIcon } from "lucide-react";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  appendApplicationFields,
  ApplicationFieldsSection,
  type ApplicationFormFieldId,
  emptyApplicationFormState,
} from "@/components/verify/application-fields";
import { BatchResults } from "@/components/verify/batch-results";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MAX_BATCH_IMAGES } from "@/lib/verify/constants";
import { computeBatchSummary } from "@/lib/verify/batch-summary";
import { verifyBatchWithStream } from "@/lib/verify/batch-sse-client";
import type { BatchItemResult, BatchVerifyResponse } from "@/lib/verify/types";
import { cn } from "@/lib/utils";

export function BatchForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formValues, setFormValues] = useState(emptyApplicationFormState);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [streamingItems, setStreamingItems] = useState<BatchItemResult[]>([]);
  const [response, setResponse] = useState<BatchVerifyResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFieldChange = (id: ApplicationFormFieldId, value: string) => {
    setFormValues((current) => ({ ...current, [id]: value }));
  };

  const handleArchiveChange = (file: File | null) => {
    setArchiveFile(file);
    setResponse(null);
    setStreamingItems([]);
    setProgress({ completed: 0, total: 0 });
  };

  // ── drag & drop ──────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const isZip =
      file.type === "application/zip" ||
      file.type === "application/x-zip-compressed" ||
      file.name.toLowerCase().endsWith(".zip");

    if (!isZip) {
      toast.error("Please upload a ZIP archive");
      return;
    }

    handleArchiveChange(file);
  };

  // ── submission ───────────────────────────────────────────────────────────

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!archiveFile) {
      toast.error("Please upload a ZIP archive");
      return;
    }

    setIsSubmitting(true);
    setResponse(null);
    setStreamingItems([]);
    setProgress({ completed: 0, total: 0 });

    try {
      const formData = new FormData();
      formData.append("archive", archiveFile);
      appendApplicationFields(formData, formValues);

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      await verifyBatchWithStream(`${basePath}/api/verify/batch`, formData, {
        onStart: (total) => {
          setProgress({ completed: 0, total });
        },
        onItem: (item) => {
          setStreamingItems((prev) => [...prev, item]);
          setProgress((prev) => ({
            total: prev.total,
            completed: prev.completed + 1,
          }));
        },
        onComplete: (result) => {
          setResponse(result);
          setStreamingItems([]);
          window.scrollTo({ top: 0, behavior: "smooth" });
        },
        onError: (message) => {
          throw new Error(message);
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Batch verification failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── derive display response (partial during streaming) ───────────────────

  const displayResponse: BatchVerifyResponse | null =
    response ??
    (streamingItems.length > 0
      ? {
          total: progress.total || streamingItems.length,
          completed: streamingItems.length,
          items: streamingItems,
          summary: computeBatchSummary(streamingItems),
        }
      : null);

  return (
    <div className="space-y-8">
      {displayResponse ? (
        <BatchResults isProcessing={isSubmitting} response={displayResponse} />
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 font-medium text-lg">ZIP archive</h2>

          <button
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 transition-colors hover:bg-muted/50",
              archiveFile && "border-solid py-6",
              isDragging && "border-primary bg-primary/5"
            )}
            onClick={() => fileInputRef.current?.click()}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            type="button"
          >
            <FileArchiveIcon
              aria-hidden="true"
              className={cn(
                "size-8",
                isDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
            {isDragging ? (
              <span className="font-medium text-primary text-sm">
                Drop ZIP archive here
              </span>
            ) : archiveFile ? (
              <span className="font-medium text-sm">{archiveFile.name}</span>
            ) : (
              <span className="text-center text-muted-foreground text-sm">
                Drag &amp; drop or click to upload a ZIP archive
                <br />
                <span className="text-xs">
                  Up to {MAX_BATCH_IMAGES} JPEG, PNG, or WebP images
                </span>
              </span>
            )}
          </button>

          <input
            accept=".zip,application/zip,application/x-zip-compressed"
            className="sr-only"
            onChange={(event) => {
              handleArchiveChange(event.target.files?.[0] ?? null);
            }}
            ref={fileInputRef}
            type="file"
          />
        </section>

        <ApplicationFieldsSection
          idPrefix="batch-"
          onChange={handleFieldChange}
          values={formValues}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={isSubmitting || !archiveFile} size="lg" type="submit">
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isSubmitting
              ? progress.total > 0
                ? `Verifying ${progress.completed} / ${progress.total}…`
                : "Uploading…"
              : "Verify batch"}
          </Button>

          {response ? (
            <Button
              onClick={() => {
                setResponse(null);
                setStreamingItems([]);
              }}
              size="lg"
              type="button"
              variant="outline"
            >
              New batch
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
