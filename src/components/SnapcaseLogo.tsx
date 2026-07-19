import type { HTMLAttributes, SVGProps } from "react";
import { cn } from "@/lib/utils";

type SnapcaseMarkProps = SVGProps<SVGSVGElement> & {
  sparkColor?: string;
};

export const SnapcaseMark = ({
  className,
  sparkColor = "hsl(var(--secondary))",
  ...props
}: SnapcaseMarkProps) => (
  <svg
    aria-hidden="true"
    className={cn("shrink-0", className)}
    viewBox="0 0 64 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M13 8C13 3.582 16.582 0 21 0H43C47.418 0 51 3.582 51 8V36.5C41.55 27.39 33.36 22.1 22.78 20.02C17.4 18.96 13 14.53 13 9.05V8Z"
      fill="currentColor"
    />
    <path
      d="M13 42.5C22.45 51.65 30.65 56.98 41.23 59.08C46.6 60.14 51 64.57 51 70.05V72C51 76.418 47.418 80 43 80H21C16.582 80 13 76.418 13 72V42.5Z"
      fill="currentColor"
    />
    <path
      d="M36 14C36 19 38 21 43 21C38 21 36 23 36 28C36 23 34 21 29 21C34 21 36 19 36 14Z"
      fill={sparkColor}
    />
  </svg>
);

type SnapcaseLogoProps = HTMLAttributes<HTMLSpanElement> & {
  markClassName?: string;
  wordmarkClassName?: string;
  sparkColor?: string;
};

export const SnapcaseLogo = ({
  className,
  markClassName,
  wordmarkClassName,
  sparkColor,
  ...props
}: SnapcaseLogoProps) => (
  <span
    className={cn("inline-flex items-center gap-[0.42em] text-foreground", className)}
    {...props}
  >
    <SnapcaseMark
      className={cn("h-[1.45em] w-auto", markClassName)}
      sparkColor={sparkColor}
    />
    <span
      className={cn(
        "font-display font-bold leading-none tracking-[-0.035em]",
        wordmarkClassName,
      )}
    >
      Snapcase
    </span>
  </span>
);
