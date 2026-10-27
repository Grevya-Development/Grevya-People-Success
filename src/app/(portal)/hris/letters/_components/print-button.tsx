"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <Button onClick={() => window.print()} size="sm">
      <Printer className="h-3.5 w-3.5" /> {label}
    </Button>
  );
}
