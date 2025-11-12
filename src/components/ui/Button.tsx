import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-red-600 text-white shadow-lg shadow-red-500/25 hover:bg-red-700 hover:shadow-red-500/40 active:scale-95",
        destructive:
          "border border-red-600 bg-transparent text-red-400 shadow-sm hover:border-red-500 hover:text-red-300 active:scale-95",
        outline:
          "border border-gray-600 bg-transparent text-gray-100 shadow-sm hover:bg-gray-800 hover:border-gray-500 active:scale-95",
        secondary:
          "border border-gray-600 bg-gray-800 text-gray-100 shadow-sm hover:bg-gray-600 active:scale-95",
        ghost:
          "text-gray-100 hover:bg-gray-800 hover:text-white active:scale-95",
        link: "text-red-400 underline-offset-4 hover:underline hover:text-red-300",
        gradient:
          "bg-gradient-to-r from-red-600 to-orange-500 text-white shadow-lg shadow-red-500/25 hover:from-red-700 hover:to-orange-600 hover:shadow-red-500/40 active:scale-95",
        entertainment:
          "bg-gradient-to-r from-purple-600 via-red-500 to-orange-500 text-white shadow-lg shadow-purple-500/25 hover:from-purple-700 hover:via-red-600 hover:to-orange-600 hover:shadow-purple-500/40 active:scale-95",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
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
  loading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Loading...
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);

Button.displayName = "Button";

export { Button, buttonVariants };
