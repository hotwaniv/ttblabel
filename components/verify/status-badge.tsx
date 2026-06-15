import { cn } from "@/lib/utils";
import type { FieldStatus, OverallResult } from "@/lib/verify/types";
import { Badge } from "@/components/ui/badge";

const statusStyles: Record<FieldStatus, string> = {
  pass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  fail: "bg-destructive/15 text-destructive",
  absent: "bg-muted text-muted-foreground",
  review: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
};

const overallStyles: Record<OverallResult, string> = {
  PASS: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  FAIL: "bg-destructive/15 text-destructive border-destructive/30",
  REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
};

export function FieldStatusBadge({
  status,
  className,
}: {
  status: FieldStatus;
  className?: string;
}) {
  return (
    <Badge
      className={cn("uppercase tracking-wide", statusStyles[status], className)}
      variant="outline"
    >
      {status}
    </Badge>
  );
}

export function OverallResultBadge({
  result,
  className,
}: {
  result: OverallResult;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-4 py-1.5 font-semibold text-lg tracking-wide",
        overallStyles[result],
        className
      )}
    >
      {result}
    </span>
  );
}
