import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-soft hover:shadow-medium active:scale-[0.98]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive hover:shadow-medium shadow-soft",
        outline: "border border-border bg-transparent hover:bg-muted/50 text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary hover:shadow-soft",
        ghost: "hover:bg-muted/50 text-foreground",
        link: "text-cta-emphasis underline-offset-4 hover:underline",
        accent: "bg-accent text-accent-foreground hover:bg-accent shadow-soft hover:shadow-medium active:scale-[0.98]",
        cta: "bg-cta text-cta-foreground hover:bg-cta/90 shadow-soft hover:shadow-glow active:scale-[0.98]",
        hero: "bg-cta text-cta-foreground hover:bg-cta/90 shadow-medium hover:shadow-glow active:scale-[0.98] text-base",
        "hero-outline": "border-2 border-accent/50 bg-transparent text-foreground hover:bg-accent/10 hover:border-accent transition-colors text-base",
        tool: "bg-muted text-foreground hover:bg-muted/80 border border-border/50 shadow-sm",
        "tool-active": "bg-cta text-cta-foreground shadow-soft",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-11 rounded-md px-3",
        lg: "h-12 rounded-lg px-8",
        xl: "h-14 rounded-xl px-10 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-11 w-11",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
