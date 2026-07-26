import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-xl border bg-card text-card-foreground transition-all",
  {
    variants: {
      variant: {
        default:
          "border-gray-700 bg-gray-800/50 backdrop-blur-sm shadow-xl shadow-black/25",
        entertainment:
          "border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm shadow-xl shadow-purple-500/10",
        glass:
          "border-gray-600/50 bg-gray-800/30 backdrop-blur-md shadow-2xl shadow-black/30",
        solid: "border-gray-700 bg-gray-800 shadow-lg shadow-black/20",
        outline: "border-gray-600 bg-transparent shadow-sm",
      },
      size: {
        default: "p-6",
        sm: "p-4",
        lg: "p-8",
        xl: "p-10",
      },
      hover: {
        none: "",
        lift: "hover:shadow-2xl hover:shadow-black/40 hover:-translate-y-1",
        glow: "hover:shadow-xl hover:shadow-red-500/20 hover:border-red-500/50",
        scale: "hover:scale-105",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      hover: "none",
    },
  },
);

export interface CardProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant,
      size,
      hover,
      onClick,
      onKeyDown,
      role,
      tabIndex,
      ...props
    },
    ref,
  ) => {
    // A Card carrying a click handler is the whole interaction target for cards
    // like ContentCard and ListCard, so it has to be focusable and operable from
    // the keyboard. The semantics are added only when a handler is present: a
    // decorative Card must stay out of the tab order, and this module has no
    // "use client" boundary, so it must not hand a function to a DOM element
    // when it is rendered from a server component.
    const isInteractive = typeof onClick === "function";

    return (
      <div
        ref={ref}
        className={cn(
          cardVariants({ variant, size, hover, className }),
          isInteractive &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950",
        )}
        role={role ?? (isInteractive ? "button" : undefined)}
        tabIndex={tabIndex ?? (isInteractive ? 0 : undefined)}
        onClick={onClick}
        onKeyDown={
          isInteractive
            ? (event) => {
                onKeyDown?.(event);
                if (event.defaultPrevented) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                // Auto-repeat fires roughly every 30ms once a key is held.
                // Activation below dispatches a real click, and ContentCard
                // reads two clicks inside 300ms as a double click, which
                // quick-completes the title -- so without this a held Enter
                // silently marked content watched. Native buttons do not
                // re-activate on repeat either.
                if (event.repeat) return;
                // preventDefault stops Space scrolling the page. Dispatching a
                // real click rather than calling onClick directly keeps every
                // consumer's existing handler contract intact - notably
                // ContentCard, which counts clicks to detect a double click.
                event.preventDefault();
                event.currentTarget.click();
              }
            : onKeyDown
        }
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

const CardTitle = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "font-semibold leading-none tracking-tight text-gray-100",
      className,
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-sm text-gray-400", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center pt-6", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cardVariants,
};
