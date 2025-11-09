"use client";

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  Switch as RASwitch,
  type SwitchProps as RASwitchProps,
} from "react-aria-components";

const switchRootVariants = cva("group inline-flex items-center gap-3", {
  variants: {
    size: {
      sm: "text-sm",
      default: "text-sm",
      lg: "text-base",
    },
  },
  defaultVariants: {
    size: "default",
  },
});

type Size = NonNullable<VariantProps<typeof switchRootVariants>["size"]>;

const trackVariants = cva(
  "relative shrink-0 rounded-full border transition-colors duration-200 ease-out group-data-[disabled]:opacity-50 group-data-[disabled]:cursor-not-allowed group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-offset-2 group-data-[focus-visible]:ring-offset-gray-900",
  {
    variants: {
      size: {
        sm: "h-5 w-9",
        default: "h-6 w-11",
        lg: "h-7 w-14",
      },
      variant: {
        default:
          "border-gray-600 bg-gray-700 group-hover:bg-gray-600 group-data-[selected]:bg-red-600 group-data-[selected]:hover:bg-red-500 group-data-[focus-visible]:ring-red-500",
        error:
          "border-red-500 bg-gray-700 group-data-[selected]:bg-red-600 group-data-[selected]:hover:bg-red-500 group-data-[focus-visible]:ring-red-400",
        success:
          "border-green-500 bg-gray-700 group-data-[selected]:bg-green-600 group-data-[selected]:hover:bg-green-500 group-data-[focus-visible]:ring-green-400",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
);

const thumbVariants = cva(
  "absolute left-0.5 top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200 ease-out",
  {
    variants: {
      size: {
        sm: "h-4 w-4 [--thumb-size:1rem] group-data-[selected]:left-[calc(100%-var(--thumb-size)-0.125rem)]",
        default:
          "h-5 w-5 [--thumb-size:1.25rem] group-data-[selected]:left-[calc(100%-var(--thumb-size)-0.125rem)]",
        lg: "h-6 w-6 [--thumb-size:1.5rem] group-data-[selected]:left-[calc(100%-var(--thumb-size)-0.125rem)]",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
);

export interface SwitchProps
  extends Omit<RASwitchProps, "children">,
    VariantProps<typeof switchRootVariants> {
  label?: string;
  helperText?: string;
  variant?: "default" | "error" | "success";
  error?: string;
}

const Switch = forwardRef<HTMLLabelElement, SwitchProps>(
  (
    {
      className,
      size,
      label,
      helperText,
      variant = "default",
      error,
      ...props
    },
    ref
  ) => {
    const finalVariant = error ? "error" : variant;
    const currentSize: Size = size ?? "default";

    const rootClassName = cn(
      switchRootVariants({ size: currentSize, className })
    );
    const trackClassName = cn(
      trackVariants({ size: currentSize, variant: finalVariant })
    );
    const thumbClassName = cn(thumbVariants({ size: currentSize }));

    return (
      <div className="space-y-2">
        <RASwitch ref={ref} className={rootClassName} {...props}>
          <span className={trackClassName} aria-hidden>
            <span className={thumbClassName} />
          </span>
          {label && <span className="font-medium text-gray-300">{label}</span>}
        </RASwitch>
        {(error || helperText) && (
          <p
            className={cn("text-xs", error ? "text-red-400" : "text-gray-500")}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
