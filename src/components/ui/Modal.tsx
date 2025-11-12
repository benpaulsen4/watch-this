"use client";

import React from "react";
import {
  Modal as AriaModal,
  ModalOverlay,
  Heading,
  Button as AriaButton,
} from "react-aria-components";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const modalVariants = cva(
  "relative w-full rounded-xl shadow-2xl max-h-[90vh]",
  {
    variants: {
      variant: {
        default: "border border-gray-800 bg-gray-900",
        glass: "border border-gray-700 bg-gray-900/60 backdrop-blur-md",
        outline: "border border-gray-700 bg-transparent",
      },
      size: {
        sm: "max-w-md",
        md: "max-w-lg",
        lg: "max-w-2xl",
        xl: "max-w-4xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "lg",
    },
  }
);

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  size?: VariantProps<typeof modalVariants>["size"];
  variant?: VariantProps<typeof modalVariants>["variant"];
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideCloseButton?: boolean;
  isDismissable?: boolean;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "lg",
  variant = "default",
  children,
  footer,
  hideCloseButton = false,
  isDismissable = true,
  className,
}: ModalProps) {
  const hasHeader = !!title || !!subtitle;
  const hasFooter = !!footer;

  // Adjust max-height when header or footer are present
  const contentMaxHeightClass =
    hasHeader || hasFooter ? "max-h-[calc(90vh-128px)]" : "max-h-[90vh]";

  return (
    <ModalOverlay
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      isDismissable={isDismissable}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <AriaModal className={cn(modalVariants({ variant, size, className }))}>
        {!hideCloseButton && (
          <AriaButton
            onPress={onClose}
            className="absolute top-4 right-4 z-10 bg-gray-800/60 hover:bg-gray-800 text-white rounded-full p-2 transition-colors"
          >
            <X className="h-5 w-5" />
          </AriaButton>
        )}

        <div className="flex flex-col">
          {hasHeader && (
            <div className="px-6 py-4 border-b border-gray-800 bg-gray-900/60">
              {title && (
                <Heading className="text-xl font-semibold text-gray-100">
                  {title}
                </Heading>
              )}
              {subtitle && (
                <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
              )}
            </div>
          )}

          <div className={cn("p-6 overflow-y-auto", contentMaxHeightClass)}>
            {children}
          </div>

          {hasFooter && (
            <div className="px-6 py-4 border-t border-gray-800 bg-gray-900/60">
              {footer}
            </div>
          )}
        </div>
      </AriaModal>
    </ModalOverlay>
  );
}

export default Modal;
export { modalVariants };
