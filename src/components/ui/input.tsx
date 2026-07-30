import { cn } from "@/lib/cn";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full h-10 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 text-sm outline-none transition-all duration-150 placeholder:text-[var(--muted-soft)]",
        "focus:border-shklet-red focus:ring-[3px] focus:ring-shklet-red/15",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Label = ({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={cn("text-[13px] font-semibold text-[var(--muted)] mb-1.5 block tracking-[-0.005em]", className)}
    {...props}
  />
);

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "w-full h-10 rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 text-sm outline-none transition-all duration-150 appearance-none bg-no-repeat",
      "focus:border-shklet-red focus:ring-[3px] focus:ring-shklet-red/15",
      "bg-[right_0.9rem_center] rtl:bg-[left_0.9rem_center]",
      className,
    )}
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%238f8579' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
    }}
    {...props}
  />
));
Select.displayName = "Select";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-[var(--card-border)] bg-[var(--input-bg)] px-3.5 py-2.5 text-sm outline-none transition-all duration-150 placeholder:text-[var(--muted-soft)]",
      "focus:border-shklet-red focus:ring-[3px] focus:ring-shklet-red/15",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
