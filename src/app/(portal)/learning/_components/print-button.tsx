"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="h-4 w-4" /> {label}
    </Button>
  );
}
