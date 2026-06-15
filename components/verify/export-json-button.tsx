"use client";

import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ExportJsonButton({
  data,
  filename,
  label = "Export JSON",
}: {
  data: unknown;
  filename: string;
  label?: string;
}) {
  const handleExport = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button onClick={handleExport} size="sm" type="button" variant="outline">
      <DownloadIcon aria-hidden="true" />
      {label}
    </Button>
  );
}
