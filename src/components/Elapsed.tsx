"use client";

import { useEffect, useState } from "react";
import { duration } from "@/lib/format";

// Live-updating elapsed time since a start timestamp.
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return <span className={className}>{duration(secs)}</span>;
}
