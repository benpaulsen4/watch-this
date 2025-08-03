import { TextField, Label, Input as AriaInput, FieldError, Text } from 'react-aria-components'
import { cn } from '@/lib/utils'

interface InputProps {
  label?: string
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  type?: 'text' | 'email' | 'password' | 'search'
  isRequired?: boolean
  isDisabled?: boolean
  errorMessage?: string
  description?: string
  className?: string
}

export function Input({
  label,
  placeholder,
  value,
  onChange,
  type = 'text',
  isRequired,
  isDisabled,
  errorMessage,
  description,
  className,
}: InputProps) {
  return (
    <TextField
      value={value}
      onChange={onChange}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isInvalid={!!errorMessage}
      className={cn('flex flex-col gap-1', className)}
    >
      {label && (
        <Label className="text-sm font-medium text-gray-700">
          {label}
          {isRequired && <span className="text-red-500 ml-1">*</span>}
        </Label>
      )}
      <AriaInput
        type={type}
        placeholder={placeholder}
        className={cn(
          'px-3 py-2 border border-gray-300 rounded-md shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          'disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed',
          'invalid:border-red-500 invalid:ring-red-500'
        )}
      />
      {description && (
        <Text slot="description" className="text-sm text-gray-600">
          {description}
        </Text>
      )}
      {errorMessage && (
        <FieldError className="text-sm text-red-600">
          {errorMessage}
        </FieldError>
      )}
    </TextField>
  )
}