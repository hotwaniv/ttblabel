"use client";

import {
  PencilIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  RefreshCwIcon,
  UploadIcon,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import {
  FIELD_LABELS,
  FIELD_ORDER,
  FIELD_PRIORITY_GROUPS,
  type FieldOverride,
  type FieldStatus,
  type OverrideMap,
  type VerifiableFieldKey,
  type VerificationResult,
  type VerifyResponse,
} from "@/lib/verify/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { ExportJsonButton } from "@/components/verify/export-json-button";
import {
  FieldStatusBadge,
  OverallResultBadge,
} from "@/components/verify/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { OverallResult } from "@/lib/verify/types";

const TOTAL_FIELDS = FIELD_ORDER.length; // 7

// ─── helpers ──────────────────────────────────────────────────────────────────

function computeEffectiveOverall(
  results: VerificationResult[],
  overrides: OverrideMap
): OverallResult {
  const statuses = results.map((r) => overrides[r.field]?.status ?? r.status);
  if (statuses.some((s) => s === "fail")) return "FAIL";
  if (statuses.some((s) => s === "review" || s === "absent" || s === "warn"))
    return "REVIEW";
  return "PASS";
}

function avgConfidence(results: VerificationResult[]): number {
  if (results.length === 0) return 0;
  return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
}

function confidenceGuidance(
  confidence: number,
  status: FieldStatus
): { label: string; className: string } | null {
  if (status === "pass" && confidence >= 0.75) return null;
  if (confidence < 0.5)
    return {
      label: "Review Required",
      className: "text-destructive",
    };
  if (confidence < 0.75)
    return {
      label: "Verify Manually",
      className: "text-amber-600 dark:text-amber-400",
    };
  return null;
}

function exportVerificationCsv(
  response: VerifyResponse,
  overrides: OverrideMap
) {
  const headers = [
    "field",
    "expected",
    "on_label",
    "ai_status",
    "confidence_pct",
    "override_status",
    "override_reason",
    "effective_status",
    "explanation",
  ];
  const rows = response.results.map((r) => {
    const ov = overrides[r.field];
    return [
      FIELD_LABELS[r.field],
      r.expected,
      r.extracted ?? "",
      r.status,
      String(Math.round(r.confidence * 100)),
      ov?.status ?? "",
      ov?.reason ?? "",
      ov?.status ?? r.status,
      r.explanation,
    ];
  });
  const csv = [headers, ...rows]
    .map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ttb-label-verification.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({
  confidence,
  status,
}: {
  confidence: number;
  status: FieldStatus;
}) {
  const barColor =
    status === "pass"
      ? "bg-emerald-500"
      : status === "fail"
        ? "bg-destructive"
        : status === "warn"
          ? "bg-amber-500"
          : status === "review"
            ? "bg-blue-500"
            : "bg-muted-foreground";

  return (
    <div
      aria-hidden="true"
      className="h-1 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn("h-full rounded-full transition-all", barColor)}
        style={{ width: `${Math.round(confidence * 100)}%` }}
      />
    </div>
  );
}

function PendingFieldCard({ field }: { field: VerifiableFieldKey }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/10 p-4">
      <div className="flex items-center gap-2">
        <span className="font-medium text-muted-foreground text-sm">
          {FIELD_LABELS[field]}
        </span>
        <Spinner className="size-3 text-muted-foreground" />
      </div>
      <p className="mt-1 text-muted-foreground text-xs">Analyzing…</p>
    </div>
  );
}

function OverrideForm({
  field,
  currentOverride,
  onApply,
  onClear,
  onCancel,
}: {
  field: VerifiableFieldKey;
  currentOverride: FieldOverride | undefined;
  onApply: (override: FieldOverride) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<FieldStatus>(
    currentOverride?.status ?? "pass"
  );
  const [reason, setReason] = useState(currentOverride?.reason ?? "");

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-amber-400/40 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <p className="font-medium text-amber-800 text-xs dark:text-amber-300">
        Agent override — {FIELD_LABELS[field]}
      </p>
      <div className="flex items-center gap-2">
        <label className="w-16 shrink-0 text-muted-foreground text-xs">
          New status
        </label>
        <Select
          onValueChange={(v) => setStatus(v as FieldStatus)}
          value={status}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="fail">Fail</SelectItem>
            <SelectItem value="review">Review</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-muted-foreground text-xs">
          Reason <span className="text-destructive">*</span>
        </label>
        <Textarea
          className="min-h-16 resize-none text-xs"
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain why you are overriding this verdict…"
          value={reason}
        />
      </div>
      <div className="flex gap-2">
        <Button
          className="h-7 text-xs"
          disabled={!reason.trim()}
          onClick={() => {
            if (!reason.trim()) return;
            onApply({
              status,
              reason: reason.trim(),
              overriddenAt: new Date().toISOString(),
            });
          }}
          size="sm"
          type="button"
        >
          Apply override
        </Button>
        {currentOverride ? (
          <Button
            className="h-7 text-xs"
            onClick={onClear}
            size="sm"
            type="button"
            variant="outline"
          >
            Clear override
          </Button>
        ) : null}
        <Button
          className="h-7 text-xs"
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function ResultRow({
  result,
  override,
  onOverride,
}: {
  result: VerificationResult;
  override: FieldOverride | undefined;
  onOverride: (
    field: VerifiableFieldKey,
    override: FieldOverride | null
  ) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const effectiveStatus = override?.status ?? result.status;
  const isOverridden = !!override;

  const guidance = confidenceGuidance(result.confidence, effectiveStatus);
  const isLongExplanation = result.explanation.length > 160;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-2 duration-300",
        isOverridden ? "border-amber-400/60" : "border-border"
      )}
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{FIELD_LABELS[result.field]}</h3>
          {isOverridden ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 text-xs dark:bg-amber-900/40 dark:text-amber-300">
              Overridden
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {isOverridden ? (
            <span className="text-muted-foreground text-xs line-through">
              {result.status}
            </span>
          ) : null}
          <FieldStatusBadge status={effectiveStatus} />
        </div>
      </div>

      {/* Values */}
      <div className="px-4 pt-3">
        <dl className="grid gap-2 text-sm">
          <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground text-xs">Expected</dt>
            <dd className="break-words text-sm">{result.expected}</dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground text-xs">Detected</dt>
            <dd className="break-words font-mono text-sm">
              {result.extracted ?? (
                <span className="font-sans text-muted-foreground italic">
                  Not detected
                </span>
              )}
            </dd>
          </div>
          <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
            <dt className="text-muted-foreground text-xs">Confidence</dt>
            <dd className="flex items-center gap-2">
              <span className="text-sm">
                {Math.round(result.confidence * 100)}%
              </span>
              {guidance ? (
                <span className={cn("text-xs", guidance.className)}>
                  — {guidance.label}
                </span>
              ) : null}
            </dd>
          </div>
          {isOverridden ? (
            <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
              <dt className="text-muted-foreground text-xs">Override reason</dt>
              <dd className="break-words text-amber-800 text-sm dark:text-amber-300">
                {override.reason}
              </dd>
            </div>
          ) : null}
        </dl>

        <ConfidenceBar
          confidence={result.confidence}
          status={effectiveStatus}
        />
      </div>

      {/* Reasoning */}
      <div className="px-4 pb-1 pt-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Reasoning
        </p>
        <p
          className={cn(
            "mt-1 text-sm leading-relaxed",
            !expanded && isLongExplanation && "line-clamp-3"
          )}
        >
          {result.explanation}
        </p>
        {isLongExplanation ? (
          <button
            className="mt-1 flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setExpanded((v) => !v)}
            type="button"
          >
            {expanded ? (
              <>
                <ChevronUpIcon className="size-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDownIcon className="size-3" />
                Show more
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex justify-end px-4 pb-3 pt-1">
        {showForm ? (
          <button
            aria-label="Cancel override"
            className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setShowForm(false)}
            type="button"
          >
            <XIcon className="size-3" />
            Cancel
          </button>
        ) : (
          <button
            aria-label={isOverridden ? "Edit override" : "Override verdict"}
            className="flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
            onClick={() => setShowForm(true)}
            type="button"
          >
            <PencilIcon className="size-3" />
            {isOverridden ? "Edit override" : "Override"}
          </button>
        )}
      </div>

      {showForm ? (
        <div className="px-4 pb-4">
          <OverrideForm
            currentOverride={override}
            field={result.field}
            onApply={(ov) => {
              onOverride(result.field, ov);
              setShowForm(false);
            }}
            onCancel={() => setShowForm(false)}
            onClear={() => {
              onOverride(result.field, null);
              setShowForm(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function SummaryBanner({
  results,
  overrides,
  overall,
}: {
  results: VerificationResult[];
  overrides: OverrideMap;
  overall: OverallResult;
}) {
  const passCount = results.filter(
    (r) => (overrides[r.field]?.status ?? r.status) === "pass"
  ).length;
  const failCount = results.filter(
    (r) => (overrides[r.field]?.status ?? r.status) === "fail"
  ).length;
  const reviewCount = results.filter((r) => {
    const s = overrides[r.field]?.status ?? r.status;
    return s === "warn" || s === "review" || s === "absent";
  }).length;
  const confidence = avgConfidence(results);

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        overall === "PASS"
          ? "border-emerald-500/40 bg-emerald-50/60 dark:bg-emerald-950/20"
          : overall === "FAIL"
            ? "border-destructive/40 bg-destructive/5"
            : "border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Verification Complete</p>
          <div className="mt-1.5 flex flex-wrap gap-3 text-sm">
            {passCount > 0 ? (
              <span className="text-emerald-700 dark:text-emerald-400">
                ✓ {passCount} Passed
              </span>
            ) : null}
            {reviewCount > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                ⚠ {reviewCount} Needs Review
              </span>
            ) : null}
            {failCount > 0 ? (
              <span className="text-destructive">✗ {failCount} Failed</span>
            ) : null}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>
            Overall:{" "}
            <span className="font-semibold text-foreground">{overall}</span>
          </p>
          <p>Avg confidence: {Math.round(confidence * 100)}%</p>
        </div>
      </div>
    </div>
  );
}

function ResultsQuickList({
  results,
  overrides,
  fieldTimings,
  processingTimeMs,
}: {
  results: VerificationResult[];
  overrides: OverrideMap;
  fieldTimings: Partial<Record<VerifiableFieldKey, number>>;
  processingTimeMs?: number;
}) {
  if (results.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-muted/30">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
          Results Overview
        </p>
      </div>
      <ul className="divide-y divide-border">
        {FIELD_ORDER.map((fieldKey) => {
          const result = results.find((r) => r.field === fieldKey);
          if (!result) return null;
          const effectiveStatus = overrides[fieldKey]?.status ?? result.status;
          const timingMs = fieldTimings[fieldKey];
          const timeLabel =
            timingMs != null
              ? `${(timingMs / 1000).toFixed(1)}s`
              : processingTimeMs
                ? `${(processingTimeMs / 1000).toFixed(1)}s`
                : null;

          return (
            <li
              key={fieldKey}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <span className="text-sm">{FIELD_LABELS[fieldKey]}</span>
              <div className="flex items-center gap-3 shrink-0">
                {timeLabel ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {timeLabel}
                  </span>
                ) : null}
                <FieldStatusBadge status={effectiveStatus} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function StreamingProgress({ completed }: { completed: number }) {
  const pct = Math.round((completed / TOTAL_FIELDS) * 100);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Spinner className="size-4 text-muted-foreground" />
          <span className="font-medium text-sm">Analyzing label…</span>
        </div>
        <span className="text-muted-foreground text-xs">
          {completed} / {TOTAL_FIELDS} fields verified
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}


// ─── main export ──────────────────────────────────────────────────────────────

export function VerificationResults({
  response,
  streamedFields = [],
  isStreaming = false,
  processingTimeMs,
  className,
  onOverridesChange,
  onReupload,
  onRerun,
}: {
  response: VerifyResponse | null;
  streamedFields?: VerificationResult[];
  isStreaming?: boolean;
  processingTimeMs?: number;
  className?: string;
  onOverridesChange?: (overrides: OverrideMap) => void;
  onReupload?: () => void;
  onRerun?: () => void;
}) {
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [fieldTimings, setFieldTimings] = useState<
    Partial<Record<VerifiableFieldKey, number>>
  >({});
  const startTimeRef = useRef<number>(Date.now());
  const seenFieldsRef = useRef<Set<VerifiableFieldKey>>(new Set());

  useEffect(() => {
    const fields = response?.results ?? streamedFields;
    fields.forEach((r) => {
      if (!seenFieldsRef.current.has(r.field)) {
        seenFieldsRef.current.add(r.field);
        const elapsed = Date.now() - startTimeRef.current;
        setFieldTimings((prev) => ({ ...prev, [r.field]: elapsed }));
      }
    });
  }, [response, streamedFields]);

  const handleOverride = (
    field: VerifiableFieldKey,
    override: FieldOverride | null
  ) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (override === null) {
        delete next[field];
      } else {
        next[field] = override;
      }
      onOverridesChange?.(next);
      return next;
    });
  };

  const fields = response?.results ?? streamedFields;
  const completedCount = fields.length;

  const effectiveOverall =
    response && fields.length > 0
      ? computeEffectiveOverall(fields, overrides)
      : response?.overall ?? null;

  const exportData =
    response && Object.keys(overrides).length > 0
      ? { ...response, overall: effectiveOverall, _agentOverrides: overrides }
      : response;

  return (
    <section className={cn("space-y-4", className)}>
      {/* ── Header card ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-xs">Verification results</p>
            <p className="mt-0.5 font-semibold text-lg">Label verification</p>
            {processingTimeMs ? (
              <p className="mt-0.5 text-muted-foreground text-xs">
                Processed in {(processingTimeMs / 1000).toFixed(1)}s
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global actions */}
            {onReupload ? (
              <Button
                onClick={onReupload}
                size="sm"
                type="button"
                variant="outline"
              >
                <UploadIcon aria-hidden="true" className="size-3.5" />
                Re-upload
              </Button>
            ) : null}
            {onRerun ? (
              <Button
                onClick={onRerun}
                size="sm"
                type="button"
                variant="outline"
              >
                <RefreshCwIcon aria-hidden="true" className="size-3.5" />
                Re-run
              </Button>
            ) : null}

            {/* Export */}
            {response ? (
              <>
                <Button
                  onClick={() =>
                    exportVerificationCsv(response, overrides)
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <DownloadIcon aria-hidden="true" className="size-3.5" />
                  CSV
                </Button>
                <ExportJsonButton
                  data={exportData}
                  filename="ttb-label-verification.json"
                />
              </>
            ) : null}

            {/* Overall status */}
            {effectiveOverall ? (
              <OverallResultBadge result={effectiveOverall} />
            ) : isStreaming ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-medium text-muted-foreground text-sm">
                <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                Verifying…
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Summary banner (complete) — at top ── */}
      {!isStreaming && response && fields.length > 0 && effectiveOverall ? (
        <SummaryBanner
          overall={effectiveOverall}
          overrides={overrides}
          results={fields}
        />
      ) : null}

      {/* ── Results quick list ── */}
      {!isStreaming && fields.length > 0 ? (
        <ResultsQuickList
          fieldTimings={fieldTimings}
          overrides={overrides}
          processingTimeMs={processingTimeMs}
          results={fields}
        />
      ) : null}

      {/* ── Progress bar (streaming only) ── */}
      {isStreaming ? (
        <StreamingProgress completed={completedCount} />
      ) : null}

      {/* ── Field groups ── */}
      {Object.entries(FIELD_PRIORITY_GROUPS).map(([groupKey, group]) => {
        const groupFields = group.fields;
        const groupResults = groupFields
          .map((fk) => fields.find((f) => f.field === fk))
          .filter(Boolean) as VerificationResult[];
        const pendingFields = isStreaming
          ? groupFields.filter((fk) => !fields.some((f) => f.field === fk))
          : [];

        if (groupResults.length === 0 && pendingFields.length === 0) return null;

        return (
          <div className="space-y-3" key={groupKey}>
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-widest">
                {group.label}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="grid gap-3">
              {/* Completed fields in priority order */}
              {groupFields.map((fieldKey) => {
                const result = fields.find((f) => f.field === fieldKey);
                if (!result) return null;
                return (
                  <ResultRow
                    key={fieldKey}
                    onOverride={handleOverride}
                    override={overrides[fieldKey]}
                    result={result}
                  />
                );
              })}

              {/* Pending placeholders */}
              {pendingFields.map((fieldKey) => (
                <PendingFieldCard field={fieldKey} key={fieldKey} />
              ))}
            </div>
          </div>
        );
      })}

    </section>
  );
}
