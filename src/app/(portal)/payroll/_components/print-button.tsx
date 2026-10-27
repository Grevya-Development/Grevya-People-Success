"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()} className="no-print">
      <Printer className="h-4 w-4" />
      {label}
    </Button>
  );
}
