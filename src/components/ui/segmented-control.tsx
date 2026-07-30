"use client";

import { cn } from "@/lib/cn";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] p-1 overflow-x-auto no-scrollbar",
        className,
      )}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "relative shrink-0 rounded-lg px-3.5 h-8 text-[13px] font-semibold transition-all duration-150",
            value === opt.value
              ? "bg-shklet-red text-white shadow-sm"
              : "text-[var(--muted)] hover:text-[var(--foreground)]",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
