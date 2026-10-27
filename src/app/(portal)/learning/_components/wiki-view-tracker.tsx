"use client";

import { useEffect, useRef } from "react";
import { recordWikiView } from "../wiki-actions";

/** Counts one view per page visit (guards against effect double-runs in dev). */
export function WikiViewTracker({ articleId }: { articleId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void recordWikiView(articleId);
  }, [articleId]);
  return null;
}
