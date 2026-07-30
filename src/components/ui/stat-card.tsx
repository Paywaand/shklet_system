"use client";

import { cn } from "@/lib/cn";
import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";

type Tone = "neutral" | "red" | "green" | "yellow" | "purple";

const toneIconClasses: Record<Tone, string> = {
  neutral: "bg-black/[0.06] text-[var(--foreground)] dark:bg-white/[0.08]",
  red: "bg-shklet-red/10 text-shklet-red",
  green: "bg-shklet-green/12 text-shklet-green",
  yellow: "bg-shklet-yellow/20 text-[#8a6d00] dark:text-shklet-yellow",
  purple: "bg-shklet-purple/15 text-[#7b4f92] dark:text-shklet-purple",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  trend,
  className,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: Tone;
  trend?: { value: number; label?: string };
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 sm:p-5 shadow-elevation-1 transition-all duration-200 hover:shadow-elevation-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-[var(--muted)] leading-tight">{label}</p>
        {Icon && (
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", toneIconClasses[tone])}>
            <Icon size={16} strokeWidth={2} />
          </div>
        )}
      </div>
      <p className="ltr-nums text-2xl font-extrabold tracking-[-0.02em] mt-2">{value}</p>
      {trend && (
        <div
          className={cn(
            "flex items-center gap-1 mt-1.5 text-xs font-semibold",
            trend.value >= 0 ? "text-shklet-green" : "text-shklet-red",
          )}
        >
          {trend.value >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          <span className="ltr-nums">{Math.abs(trend.value)}%</span>
          {trend.label && <span className="text-[var(--muted)] font-normal">{trend.label}</span>}
        </div>
      )}
    </div>
  );
}
