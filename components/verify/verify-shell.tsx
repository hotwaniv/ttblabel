"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { BatchForm } from "@/components/verify/batch-form";
import { VerifyForm } from "@/components/verify/verify-form";
import { Button } from "@/components/ui/button";

type VerifyMode = "single" | "batch";

export function VerifyShell() {
  const [mode, setMode] = useState<VerifyMode>("single");

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="font-medium text-muted-foreground text-sm uppercase tracking-widest">
            TTB Label Verifier
          </p>
          <h1 className="font-semibold text-3xl tracking-tight">
            Alcohol label verification
          </h1>
          <p className="max-w-2xl text-muted-foreground leading-relaxed">
            Upload a single label image or a ZIP batch, enter your COLA
            application fields, and compare extracted label text against your
            submission — including the mandatory government warning.
          </p>
        </div>

        <div
          className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
          role="tablist"
        >
          <Button
            aria-selected={mode === "single"}
            className={cn(mode === "single" && "bg-background shadow-sm")}
            onClick={() => setMode("single")}
            role="tab"
            type="button"
            variant="ghost"
          >
            Single image
          </Button>
          <Button
            aria-selected={mode === "batch"}
            className={cn(mode === "batch" && "bg-background shadow-sm")}
            onClick={() => setMode("batch")}
            role="tab"
            type="button"
            variant="ghost"
          >
            ZIP batch
          </Button>
        </div>
      </header>

      {mode === "single" ? <VerifyForm /> : <BatchForm />}
    </div>
  );
}
