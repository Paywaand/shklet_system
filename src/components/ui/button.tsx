import { cn } from "@/lib/cn";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "success";
type Size = "sm" | "md" | "lg" | "icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-shklet-red text-white shadow-[var(--shadow-glow-red)] hover:bg-shklet-red-dim active:brightness-95",
  secondary: "bg-shklet-brown text-white shadow-elevation-1 hover:brightness-105 active:brightness-95",
  success: "bg-shklet-green text-white shadow-elevation-1 hover:brightness-105 active:brightness-95",
  outline:
    "border border-[var(--card-border)] bg-[var(--card)] hover:border-shklet-red/40 hover:bg-shklet-red/[0.04] dark:hover:bg-shklet-red/10",
  ghost: "bg-transparent hover:bg-black/[0.05] dark:hover:bg-white/[0.06]",
  danger: "bg-red-600 text-white shadow-elevation-1 hover:bg-red-700 active:brightness-95",
};

const sizeClasses: Record<Size, string> = {
  sm: "text-[13px] h-8 px-3 rounded-lg gap-1.5",
  md: "text-sm h-10 px-4 rounded-xl gap-2",
  lg: "text-[15px] h-12 px-6 rounded-2xl gap-2",
  icon: "h-10 w-10 rounded-xl shrink-0",
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-semibold tracking-[-0.01em] transition-all duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-[0.97] whitespace-nowrap",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
