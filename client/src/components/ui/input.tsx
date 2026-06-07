import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, icon: Icon, ...props }, ref) => (
  <div className="relative">
    {Icon ? <Icon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /> : null}
    <input
      className={cn("flex h-10 w-full rounded-md border bg-card/90 px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground/75 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.55)] focus-visible:border-primary/45 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50", Icon && "pl-9", className)}
      ref={ref}
      {...props}
    />
  </div>
));
Input.displayName = "Input";
