import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium cursor-pointer select-none transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/92 hover:shadow-md hover:-translate-y-px",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md hover:-translate-y-px",
        outline:
          "border border-input bg-background text-foreground shadow-xs hover:bg-muted hover:border-primary/30 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        premium:
          "text-brand-forest shadow-sm ring-1 ring-amber-400/40 bg-linear-to-r from-brand-gold-deep via-brand-gold to-brand-gold-light hover:brightness-105 hover:-translate-y-px hover:shadow-md",
        success:
          "text-white bg-linear-to-r from-emerald-700 to-teal-700 shadow-sm ring-1 ring-emerald-400/30 hover:brightness-105 hover:-translate-y-px hover:shadow-md",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6 text-sm",
        icon: "h-10 w-10",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const content =
      loading && !asChild ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span>{children}</span>
        </>
      ) : (
        children
      );
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...(asChild ? {} : { disabled: disabled || loading })}
        {...props}
      >
        {content}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
