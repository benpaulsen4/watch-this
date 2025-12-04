import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const inputVariants = cva(
  "flex w-full rounded-lg border bg-transparent px-3 py-2 text-base transition-all file:border-0 file:bg-transparent file:text-base file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-gray-600 text-gray-100 hover:border-gray-500 focus:border-red-500",
        error:
          "border-red-500 text-gray-100 focus:border-red-400 focus-visible:ring-red-400",
        success:
          "border-green-500 text-gray-100 focus:border-green-400 focus-visible:ring-green-400",
      },
      size: {
        default: "h-10",
        sm: "h-8",
        lg: "h-12 text-base",
        textarea: "min-h-24 resize-none text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  error?: string;
  label?: string;
  helperText?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, variant, size, error, label, helperText, id, ...props },
    ref,
  ) => {
    const inputId = id || `input-${Math.random().toString(36).substring(2)}`;
    const finalVariant = error ? "error" : variant;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-200 mb-2"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
          className={cn(
            inputVariants({ variant: finalVariant, size, className }),
          )}
          ref={ref}
          {...props}
        />
        {(error || helperText) && (
          <p
            className={cn("text-xs", error ? "text-red-400" : "text-gray-500")}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input, inputVariants };

export interface TextareaProps
  extends
    Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    VariantProps<typeof inputVariants> {
  error?: string;
  label?: string;
  helperText?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { className, variant, size, error, label, helperText, id, rows, ...props },
    ref,
  ) => {
    const textareaId =
      id || `textarea-${Math.random().toString(36).substring(2)}`;
    const finalVariant = error ? "error" : variant;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-sm font-medium text-gray-200 mb-2"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          className={cn(
            inputVariants({
              variant: finalVariant,
              size: size ?? "textarea",
              className,
            }),
          )}
          ref={ref}
          rows={rows ?? 3}
          {...props}
        />
        {(error || helperText) && (
          <p
            className={cn("text-xs", error ? "text-red-400" : "text-gray-500")}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export { Textarea };
