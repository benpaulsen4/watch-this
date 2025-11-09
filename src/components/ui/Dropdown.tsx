"use client";

import { ChevronDown } from "lucide-react";
import {
  Select,
  Label,
  Button as AriaButton,
  Popover,
  ListBox,
  ListBoxItem,
  SelectValue,
  type Key,
} from "react-aria-components";
import { type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { inputVariants } from "@/components/ui/Input";

export type DropdownOption = {
  key: Key;
  label: string;
  disabled?: boolean;
};

const popoverClasses =
  "w-[var(--trigger-width)] rounded-lg border border-gray-700 bg-gray-900 text-gray-100 shadow-xl shadow-black/30 overflow-hidden";

export interface DropdownProps
  extends Omit<React.ComponentProps<typeof Select>, "children">,
    VariantProps<typeof inputVariants> {
  label?: string;
  placeholder?: string;
  options: DropdownOption[];
  selectedKey?: Key;
  onSelectionChange?: (key: Key | null) => void;
  error?: string;
  helperText?: string;
  className?: string;
  ariaLabel?: string;
}

export function Dropdown({
  label,
  placeholder = "Select...",
  options,
  selectedKey,
  onSelectionChange,
  size,
  variant,
  error,
  helperText,
  className,
  isDisabled,
  ariaLabel,
  ...selectProps
}: DropdownProps) {
  const finalVariant = error ? "error" : variant ?? "default";
  const computedAriaLabel = label
    ? undefined
    : ariaLabel || (typeof placeholder === "string" ? placeholder : "Select");

  return (
    <div className={cn("space-y-2", className)}>
      <Select
        selectedKey={selectedKey}
        onSelectionChange={onSelectionChange}
        isDisabled={isDisabled}
        aria-label={computedAriaLabel}
        {...selectProps}
      >
        {label && (
          <Label className="block text-sm font-medium text-gray-200 mb-2">
            {label}
          </Label>
        )}
        <AriaButton
          className={({ isFocusVisible, isPressed }) =>
            cn(
              "inline-flex items-center justify-between",
              inputVariants({ variant: finalVariant, size }),
              (isFocusVisible || isPressed) &&
                "border-red-500 outline-none ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900"
            )
          }
        >
          <span className="truncate flex items-center gap-2">
            <SelectValue className="text-gray-200" />
            {(selectedKey === undefined || selectedKey === null) && (
              <span className="text-gray-400">{placeholder}</span>
            )}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 text-gray-400" />
        </AriaButton>
        <Popover className={popoverClasses}>
          <ListBox className="p-1 max-h-60 overflow-auto outline-none">
            {options.map((opt) => (
              <ListBoxItem
                id={opt.key}
                key={String(opt.key)}
                isDisabled={opt.disabled}
                className={({ isFocusVisible, isSelected, isDisabled }) =>
                  cn(
                    "flex cursor-pointer select-none items-center rounded-md px-2 py-2 text-sm",
                    "outline-none",
                    isSelected ? "bg-gray-800 text-white" : "text-gray-200",
                    "hover:bg-gray-800 hover:text-white",
                    isFocusVisible &&
                      "ring-2 ring-red-500 ring-offset-2 ring-offset-gray-900",
                    isDisabled && "opacity-50 cursor-not-allowed"
                  )
                }
              >
                {opt.label}
              </ListBoxItem>
            ))}
          </ListBox>
        </Popover>
      </Select>

      {(error || helperText) && (
        <p className={cn("text-xs", error ? "text-red-400" : "text-gray-500")}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}

export default Dropdown;
