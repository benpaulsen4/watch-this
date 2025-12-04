import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const spinnerVariants = cva(
  "animate-spin rounded-full border-2 border-solid border-current border-r-transparent",
  {
    variants: {
      size: {
        sm: "h-4 w-4",
        default: "h-6 w-6",
        lg: "h-8 w-8",
        xl: "h-12 w-12",
      },
      variant: {
        default: "text-gray-400",
        primary: "text-red-500",
        white: "text-white",
        entertainment: "text-purple-500",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  },
);

export interface LoadingSpinnerProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof spinnerVariants> {
  text?: string;
  centered?: boolean;
}

const LoadingSpinner = forwardRef<HTMLDivElement, LoadingSpinnerProps>(
  ({ className, size, variant, text, centered = false, ...props }, ref) => {
    const spinner = (
      <div
        ref={ref}
        className={cn(spinnerVariants({ size, variant }), className)}
        role="status"
        aria-label={text || "Loading"}
        {...props}
      />
    );

    if (text) {
      return (
        <div
          className={cn(
            "flex items-center gap-2",
            centered && "justify-center",
          )}
        >
          {spinner}
          <span className="text-sm text-gray-400">{text}</span>
        </div>
      );
    }

    if (centered) {
      return <div className="flex justify-center">{spinner}</div>;
    }

    return spinner;
  },
);

LoadingSpinner.displayName = "LoadingSpinner";

export { LoadingSpinner, spinnerVariants };
