import { cn } from "@/lib/cn";
import { HTMLAttributes } from "react";

type Tone = "neutral" | "red" | "green" | "yellow" | "brown" | "purple";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-black/[0.06] text-[var(--muted)] dark:bg-white/[0.08]",
  red: "bg-shklet-red/10 text-shklet-red",
  green: "bg-shklet-green/12 text-shklet-green",
  yellow: "bg-shklet-yellow/20 text-[#8a6d00] dark:text-shklet-yellow",
  brown: "bg-shklet-brown/12 text-shklet-brown",
  purple: "bg-shklet-purple/15 text-[#7b4f92] dark:text-shklet-purple",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide leading-none",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
