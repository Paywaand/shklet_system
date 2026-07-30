import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 flex-wrap mb-7", className)}>
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-0.02em] leading-tight">{title}</h1>
        {description && <p className="text-[var(--muted)] text-sm mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
