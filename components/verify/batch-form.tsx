"use client";

import { FileArchiveIcon, FileSpreadsheetIcon } from "lucide-react";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { BatchResults } from "@/components/verify/batch-results";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MAX_BATCH_IMAGES } from "@/lib/verify/constants";
import { computeBatchSummary } from "@/lib/verify/batch-summary";
import { verifyBatchWithStream } from "@/lib/verify/batch-sse-client";
import type {
  BatchItemResult,
  BatchVerifyResponse,
  VerificationResult,
} from "@/lib/verify/types";
import {
  type ClientZipImage,
  extractImagesFromZipFile,
  revokeClientZipImages,
} from "@/lib/verify/zip-client";
import { cn } from "@/lib/utils";

export function BatchForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetInputRef = useRef<HTMLInputElement>(null);
  const archiveImagesRef = useRef<ClientZipImage[]>([]);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [expectedSheetFile, setExpectedSheetFile] = useState<File | null>(null);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [archiveImages, setArchiveImages] = useState<ClientZipImage[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [completedItems, setCompletedItems] = useState<
    Record<string, BatchItemResult>
  >({});
  const [streamedFieldsByFile, setStreamedFieldsByFile] = useState<
    Record<string, VerificationResult[]>
  >({});
  const [response, setResponse] = useState<BatchVerifyResponse | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    archiveImagesRef.current = archiveImages;
  }, [archiveImages]);

  useEffect(
    () => () => {
      revokeClientZipImages(archiveImagesRef.current);
    },
    []
  );

  const resetVerificationState = () => {
    setResponse(null);
    setCompletedItems({});
    setStreamedFieldsByFile({});
    setProgress({ completed: 0, total: 0 });
  };

  const loadArchiveImages = async (file: File) => {
    setIsExtracting(true);
    resetVerificationState();

    try {
      const images = await extractImagesFromZipFile(file);
      setArchiveImages((current) => {
        revokeClientZipImages(current);
        return images;
      });
      setProgress({ completed: 0, total: images.length });
    } catch (error) {
      setArchiveFile(null);
      setArchiveImages((current) => {
        revokeClientZipImages(current);
        return [];
      });
      toast.error(
        error instanceof Error ? error.message : "Failed to read ZIP archive"
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleArchiveChange = (file: File | null) => {
    setArchiveFile(file);
    resetVerificationState();

    if (!file) {
      setArchiveImages((current) => {
        revokeClientZipImages(current);
        return [];
      });
      return;
    }

    void loadArchiveImages(file);
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

    if (archiveImages.length === 0) {
      toast.error("No label images found in the ZIP archive");
      return;
    }

    setIsSubmitting(true);
    setResponse(null);
    setCompletedItems({});
    setStreamedFieldsByFile({});
    setProgress({ completed: 0, total: archiveImages.length });

    try {
      const formData = new FormData();
      formData.append("archive", archiveFile);
      if (expectedSheetFile) {
        formData.append("expectedSheet", expectedSheetFile);
      }

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      await verifyBatchWithStream(`${basePath}/api/verify/batch`, formData, {
        onStart: (total) => {
          setProgress({ completed: 0, total });
        },
        onField: (fieldEvent) => {
          const { filename, ...field } = fieldEvent;
          setStreamedFieldsByFile((current) => {
            const existing = current[filename] ?? [];
            if (existing.some((item) => item.field === field.field)) {
              return current;
            }

            return {
              ...current,
              [filename]: [...existing, field],
            };
          });
        },
        onItem: (item) => {
          setCompletedItems((current) => ({
            ...current,
            [item.filename]: item,
          }));
          setStreamedFieldsByFile((current) => {
            const next = { ...current };
            delete next[item.filename];
            return next;
          });
          setProgress((prev) => ({
            total: prev.total,
            completed: prev.completed + 1,
          }));
        },
        onComplete: (result) => {
          setResponse(result);
          setStreamedFieldsByFile({});
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

  const displayResponse: BatchVerifyResponse | null =
    response ??
    (isSubmitting
      ? {
          total: progress.total || archiveImages.length,
          completed: progress.completed,
          items: Object.values(completedItems),
          summary: computeBatchSummary(Object.values(completedItems)),
        }
      : null);

  const handleNewBatch = () => {
    setArchiveFile(null);
    setExpectedSheetFile(null);
    setArchiveImages((current) => {
      revokeClientZipImages(current);
      return [];
    });
    resetVerificationState();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (sheetInputRef.current) {
      sheetInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-8">
      <form className="space-y-4" noValidate onSubmit={handleSubmit}>
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
            ) : isExtracting ? (
              <span className="inline-flex items-center gap-2 font-medium text-sm">
                <Spinner className="size-4" />
                Reading images…
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

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-1 font-medium text-lg">
            Expected values spreadsheet
          </h2>
          <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
            Optional .xlsx with COLA application data. When attached, each
            label is matched to a row by COLA/TTB ID in the filename, with
            fuzzy + AI fallback when no ID is found.
          </p>

          <button
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-8 transition-colors hover:bg-muted/50",
              expectedSheetFile && "border-solid py-4",
              isSheetDragging && "border-primary bg-primary/5"
            )}
            onClick={() => sheetInputRef.current?.click()}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsSheetDragging(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsSheetDragging(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsSheetDragging(false);

              const file = event.dataTransfer.files[0];
              if (!file) return;

              if (!file.name.toLowerCase().endsWith(".xlsx")) {
                toast.error("Please upload an .xlsx spreadsheet");
                return;
              }

              setExpectedSheetFile(file);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                sheetInputRef.current?.click();
              }
            }}
            type="button"
          >
            <FileSpreadsheetIcon
              aria-hidden="true"
              className={cn(
                "size-8",
                isSheetDragging ? "text-primary" : "text-muted-foreground"
              )}
            />
            {isSheetDragging ? (
              <span className="font-medium text-primary text-sm">
                Drop spreadsheet here
              </span>
            ) : expectedSheetFile ? (
              <span className="font-medium text-sm">{expectedSheetFile.name}</span>
            ) : (
              <span className="text-center text-muted-foreground text-sm">
                Drag &amp; drop or click to upload expected values
                <br />
                <span className="text-xs">Excel (.xlsx) only</span>
              </span>
            )}
          </button>

          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(event) => {
              setExpectedSheetFile(event.target.files?.[0] ?? null);
            }}
            ref={sheetInputRef}
            type="file"
          />

          {expectedSheetFile ? (
            <Button
              className="mt-3"
              onClick={() => {
                setExpectedSheetFile(null);
                if (sheetInputRef.current) {
                  sheetInputRef.current.value = "";
                }
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove spreadsheet
            </Button>
          ) : null}
        </section>

        {archiveImages.length > 0 ? (
          <BatchResults
            archiveImages={archiveImages}
            completedItems={completedItems}
            isProcessing={isSubmitting}
            response={displayResponse}
            streamedFieldsByFile={streamedFieldsByFile}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={isSubmitting || isExtracting || !archiveFile}
            size="lg"
            type="submit"
          >
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isSubmitting
              ? progress.total > 0
                ? `Verifying ${progress.completed} / ${progress.total}…`
                : "Uploading…"
              : "Verify batch"}
          </Button>

          {response ? (
            <Button
              onClick={handleNewBatch}
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
