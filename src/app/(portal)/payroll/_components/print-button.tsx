"use client";

import { useEffect } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Print / save as PDF. Browsers name the saved PDF after the page title, so while printing
 * the title is swapped for `fileName` (also when the user presses Ctrl/Cmd+P).
 */
export function PrintButton({ label = "Download PDF", fileName }: { label?: string; fileName?: string }) {
  useEffect(() => {
    if (!fileName) return;
    let previous = document.title;
    const before = () => {
      if (document.title !== fileName) previous = document.title;
      document.title = fileName;
    };
    const after = () => {
      document.title = previous;
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [fileName]);

  return (
    <Button
      variant="outline"
      onClick={() => {
        // Some browsers fire beforeprint after the file name is chosen, so set it up front too.
        const previous = document.title;
        if (fileName) document.title = fileName;
        window.print();
        if (fileName) setTimeout(() => (document.title = previous), 1000);
      }}
      className="no-print"
    >
      <Download className="h-4 w-4" />
      {label}
    </Button>
  );
}
