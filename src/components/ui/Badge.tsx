import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-gray-700 text-gray-100 shadow hover:bg-gray-600",
        secondary:
          "border-transparent bg-gray-600 text-gray-100 hover:bg-gray-500",
        destructive:
          "border-transparent bg-red-600 text-white shadow hover:bg-red-700",
        outline: "border-gray-600 text-gray-300 hover:bg-gray-800",
        success:
          "border-transparent bg-green-600 text-white shadow hover:bg-green-700",
        warning:
          "border-transparent bg-yellow-600 text-white shadow hover:bg-yellow-700",
        info: "border-transparent bg-blue-600 text-white shadow hover:bg-blue-700",
        // Status-specific variants
        watching:
          "border-transparent bg-green-600/80 text-green-100 backdrop-blur-xs",
        completed:
          "border-transparent bg-blue-600/80 text-blue-100 backdrop-blur-xs",
        planning:
          "border-transparent bg-yellow-600/80 text-yellow-100 backdrop-blur-xs",
        paused:
          "border-transparent bg-orange-600/80 text-orange-100 backdrop-blur-xs",
        dropped:
          "border-transparent bg-red-600/80 text-red-100 backdrop-blur-xs",
        // Entertainment variants
        genre:
          "border-purple-500/30 bg-purple-600/20 text-purple-400 hover:bg-purple-600/30",
        rating:
          "border-yellow-500/30 bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30",
        year: "border-gray-500/30 bg-gray-600/20 text-gray-400 hover:bg-gray-600/30",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-xs",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);

Badge.displayName = "Badge";

export { Badge, badgeVariants };
