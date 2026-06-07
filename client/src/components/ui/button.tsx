import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.22)] hover:-translate-y-0.5 hover:bg-primary/92",
        secondary: "bg-muted text-foreground hover:-translate-y-0.5 hover:bg-muted/80",
        outline: "border bg-card/80 shadow-sm hover:-translate-y-0.5 hover:border-primary/35 hover:bg-muted/70",
        ghost: "hover:bg-muted/80",
        accent: "bg-accent text-accent-foreground shadow-[0_10px_24px_hsl(var(--accent)/0.2)] hover:-translate-y-0.5 hover:bg-accent/90"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        icon: "size-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
