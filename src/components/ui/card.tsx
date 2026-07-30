import { cn } from "@/lib/cn";
import { HTMLAttributes } from "react";

export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-[var(--card)] border-[var(--card-border)] shadow-elevation-1 transition-all duration-200",
        interactive && "cursor-pointer hover:shadow-elevation-2 hover:border-shklet-red/30 hover:-translate-y-0.5",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pt-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-bold text-base tracking-[-0.01em]", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
