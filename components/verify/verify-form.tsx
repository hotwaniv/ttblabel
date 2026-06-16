"use client";

import { RefreshCwIcon, UploadIcon } from "lucide-react";
import { type DragEvent, type FormEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  appendApplicationFields,
  ApplicationFieldsSection,
  type ApplicationFormFieldId,
  emptyApplicationFormState,
} from "@/components/verify/application-fields";
import { VerificationResults } from "@/components/verify/verification-results";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { PREFILL_LOW_CONFIDENCE_THRESHOLD } from "@/lib/verify/constants";
import { verifyLabelWithStream } from "@/lib/verify/sse-client";
import type {
  PrefilledBeverageType,
  PrefilledFields,
  VerificationResult,
  VerifyResponse,
} from "@/lib/verify/types";
import { cn } from "@/lib/utils";

const BEVERAGE_TYPE_LABELS: Record<PrefilledBeverageType, string> = {
  spirits: "Distilled Spirits",
  wine: "Wine",
  beer: "Malt Beverage",
  unknown: "Unknown",
};

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];

function mapPrefillToForm(
  prefilled: PrefilledFields
): Record<ApplicationFormFieldId, string> {
  return {
    brandName: prefilled.brandName ?? "",
    classType: prefilled.classType ?? "",
    alcoholContent: prefilled.alcoholContent ?? "",
    netContents: prefilled.netContents ?? "",
    producerName: prefilled.producerName ?? "",
    beverageType: BEVERAGE_TYPE_LABELS[prefilled.beverageType],
  };
}

export function VerifyForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formValues, setFormValues] = useState(emptyApplicationFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrefilling, setIsPrefilling] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const [prefillConfidence, setPrefillConfidence] = useState<number | null>(
    null
  );
  const [prefillWarning, setPrefillWarning] = useState<string | null>(null);
  const [streamedFields, setStreamedFields] = useState<VerificationResult[]>(
    []
  );
  const [response, setResponse] = useState<
    (VerifyResponse & { processingTimeMs?: number }) | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFieldChange = (id: ApplicationFormFieldId, value: string) => {
    setFormValues((current) => ({ ...current, [id]: value }));
  };

  const resetResults = () => {
    setStreamedFields([]);
    setResponse(null);
  };

  const runPrefill = async (file: File) => {
    setIsPrefilling(true);
    setPrefillFailed(false);
    setPrefillConfidence(null);
    setPrefillWarning(null);

    try {
      const formData = new FormData();
      formData.append("image", file);

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      const prefillResponse = await fetch(`${basePath}/api/prefill`, {
        method: "POST",
        body: formData,
      });

      const data = (await prefillResponse.json()) as
        | PrefilledFields
        | { error?: string };

      if (!prefillResponse.ok) {
        throw new Error(
          "error" in data && data.error
            ? data.error
            : "Pre-fill request failed"
        );
      }

      const prefilled = data as PrefilledFields;
      setFormValues(mapPrefillToForm(prefilled));
      setPrefillConfidence(prefilled.confidence);
      setPrefillWarning(prefilled.warning);
      toast.success("Fields auto-filled from label");
    } catch (error) {
      setPrefillFailed(true);
      toast.error(error instanceof Error ? error.message : "Pre-fill failed");
    } finally {
      setIsPrefilling(false);
    }
  };

  const handleImageChange = (file: File | null) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(file);
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
    setPrefillConfidence(null);
    setPrefillWarning(null);
    setPrefillFailed(false);
    resetResults();

    if (file) {
      void runPrefill(file);
    }
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

    if (!ACCEPTED_MIME.includes(file.type)) {
      toast.error("Only JPEG, PNG, or WebP images are supported");
      return;
    }

    handleImageChange(file);
  };

  // ── submission ───────────────────────────────────────────────────────────

  const submitVerification = async (currentFile: File) => {
    setIsSubmitting(true);
    resetResults();

    try {
      const formData = new FormData();
      formData.append("image", currentFile);
      appendApplicationFields(formData, formValues);

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      await verifyLabelWithStream(`${basePath}/api/verify`, formData, {
        onField: (field) => {
          setStreamedFields((current) => [...current, field]);
        },
        onComplete: (result) => {
          setResponse(result);
          setStreamedFields(result.results);
        },
        onError: (message) => {
          throw new Error(message);
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Verification failed"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!imageFile) {
      toast.error("Please upload a label image");
      return;
    }

    await submitVerification(imageFile);
  };

  const handleVerifyAnother = () => {
    handleImageChange(null);
    setFormValues(emptyApplicationFormState);
    setPrefillConfidence(null);
    setPrefillWarning(null);
    setPrefillFailed(false);
    resetResults();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleReupload = () => {
    handleVerifyAnother();
    setTimeout(() => fileInputRef.current?.click(), 50);
  };

  const handleRerun = () => {
    if (imageFile) {
      void submitVerification(imageFile);
    }
  };

  const showLowConfidence =
    prefillConfidence !== null &&
    prefillConfidence < PREFILL_LOW_CONFIDENCE_THRESHOLD;

  const canSubmit = Boolean(imageFile) && !isSubmitting;

  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
      <form
        className="space-y-4"
        noValidate
        onSubmit={handleSubmit}
        ref={formRef}
      >
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 font-medium text-lg">Label image</h2>

          {/* Upload / preview area with drag & drop */}
          <button
            className={cn(
              "flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-10 transition-colors hover:bg-muted/50",
              previewUrl && "border-solid py-4",
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
            {previewUrl ? (
              <img
                alt="Uploaded label preview"
                className="max-h-64 w-full rounded-lg object-contain"
                src={previewUrl}
              />
            ) : isDragging ? (
              <>
                <UploadIcon
                  aria-hidden="true"
                  className="size-8 text-primary"
                />
                <span className="font-medium text-primary text-sm">
                  Drop label image here
                </span>
              </>
            ) : (
              <>
                <UploadIcon
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                />
                <span className="text-center text-muted-foreground text-sm">
                  Drag &amp; drop or click to upload
                  <br />
                  <span className="text-xs">
                    JPEG, PNG, or WebP (max 10 MB)
                  </span>
                </span>
              </>
            )}
          </button>

          <input
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              handleImageChange(file);
            }}
            ref={fileInputRef}
            type="file"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {isPrefilling ? (
              <Button disabled type="button" variant="outline">
                <Spinner className="size-4" />
                Reading label…
              </Button>
            ) : prefillFailed ? (
              <Button
                disabled={isSubmitting}
                onClick={() => imageFile && void runPrefill(imageFile)}
                type="button"
                variant="outline"
              >
                <RefreshCwIcon aria-hidden="true" className="size-4" />
                Retry auto-fill
              </Button>
            ) : null}

            {prefillConfidence !== null ? (
              <Badge variant="outline">
                Auto-filled — {Math.round(prefillConfidence * 100)}% confident
              </Badge>
            ) : null}
          </div>

          {showLowConfidence ? (
            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-800 text-sm dark:text-amber-300">
              Low confidence — please review auto-filled values before
              verifying.
            </p>
          ) : null}

          {prefillWarning ? (
            <p className="mt-2 text-muted-foreground text-xs">
              {prefillWarning}
            </p>
          ) : null}
        </section>

        <ApplicationFieldsSection
          onChange={handleFieldChange}
          values={formValues}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!canSubmit} size="lg" type="submit">
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isSubmitting ? "Analyzing label…" : "Verify label"}
          </Button>

          {response ? (
            <Button
              onClick={handleVerifyAnother}
              size="lg"
              type="button"
              variant="outline"
            >
              Verify another
            </Button>
          ) : null}
        </div>
      </form>

      <div className="lg:sticky lg:top-6">
        {isSubmitting || response || streamedFields.length > 0 ? (
          <VerificationResults
            isStreaming={isSubmitting}
            onRerun={imageFile && response ? handleRerun : undefined}
            onReupload={response ? handleReupload : undefined}
            processingTimeMs={response?.processingTimeMs}
            response={response}
            streamedFields={streamedFields}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center">
            <UploadIcon
              aria-hidden="true"
              className="mx-auto mb-3 size-8 text-muted-foreground/50"
            />
            <p className="font-medium text-muted-foreground">
              Ready to verify
            </p>
            <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
              Upload a label image and fill in the application fields.
              Field results will appear here as each one completes.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
