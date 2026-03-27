/**
 * ExpandableTextarea - Auto-resizing textarea with smooth transitions
 * Refined micro-interactions for natural, organic feel
 */

"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

export interface ExpandableTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange"
> {
  /** Minimum height in pixels */
  minHeight?: number;
  /** Maximum height in pixels */
  maxHeight?: number;
  /** Current value */
  value?: string;
  /** Change handler */
  onChange?: (value: string) => void;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Label */
  label?: string;
  /** Show character count */
  showCount?: boolean;
  /** Maximum character count */
  maxLength?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const ExpandableTextarea = React.forwardRef<
  HTMLTextAreaElement,
  ExpandableTextareaProps
>(
  (
    {
      minHeight = 44,
      maxHeight = 200,
      value = "",
      onChange,
      error = false,
      helperText,
      label,
      showCount = false,
      maxLength,
      className,
      disabled,
      placeholder = "Tapez votre message...",
      ...props
    },
    ref,
  ) => {
    const [height, setHeight] = React.useState<number>(minHeight);
    const [isFocused, setIsFocused] = React.useState(false);
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
    const shadowRef = React.useRef<HTMLDivElement | null>(null);

    // Combine refs
    React.useImperativeHandle(ref, () => textareaRef.current!);

    // Calculate height based on content
    const calculateHeight = React.useCallback(() => {
      if (!textareaRef.current) return;

      // Reset height to get accurate scrollHeight
      textareaRef.current.style.height = `${minHeight}px`;

      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

      setHeight(newHeight);
    }, [minHeight, maxHeight]);

    // Recalculate on value change
    React.useEffect(() => {
      calculateHeight();
    }, [value, calculateHeight]);

    // Handle textarea change
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      onChange?.(newValue);
    };

    // Character count
    const characterCount = value.length;
    const isNearLimit = maxLength && characterCount > maxLength * 0.9;

    return (
      <div className="w-full space-y-1.5">
        {/* Label */}
        {label && (
          <label
            className={cn(
              "block text-sm font-semibold transition-colors",
              error ? "text-error" : "text-gray-700",
              disabled && "opacity-60",
            )}
          >
            {label}
            {props.required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        {/* Textarea container */}
        <div className="relative">
          {/* Actual textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            disabled={disabled}
            maxLength={maxLength}
            placeholder={placeholder}
            style={{
              height: `${height}px`,
              resize: "none",
            }}
            className={cn(
              // Base styles
              "w-full px-4 py-3",
              "rounded-xl",
              "font-normal text-base leading-relaxed",
              "transition-all duration-250 ease-smooth",
              "outline-none",

              // Border states
              "border-2",
              error
                ? "border-error-light focus:border-error"
                : disabled
                  ? "border-gray-200"
                  : isFocused
                    ? "border-ocean-500"
                    : "border-gray-200 hover:border-gray-300",

              // Background
              disabled ? "bg-gray-50" : "bg-white",

              // Text color
              disabled ? "text-gray-400" : "text-gray-900",

              // Placeholder
              "placeholder:text-gray-400",

              // Focus ring
              !error &&
                !disabled &&
                "focus-visible:ring-2 focus-visible:ring-ring",

              // Error ring
              error && "focus:ring-4 focus:ring-error-light",

              // Disabled cursor
              disabled && "cursor-not-allowed",

              // Smooth scrollbar
              "scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",

              className,
            )}
            {...props}
          />

          {/* Focus indicator - subtle glow */}
          {isFocused && !error && !disabled && (
            <div
              className={cn(
                "absolute inset-0 -z-10",
                "rounded-xl",
                "bg-ocean-500/5",
                "animate-fade-in",
                "pointer-events-none",
              )}
              aria-hidden="true"
            />
          )}

          {/* Character count indicator */}
          {showCount && maxLength && (
            <div
              className={cn(
                "absolute bottom-2 right-3",
                "text-xs font-medium tabular-nums",
                "transition-colors duration-150",
                isNearLimit
                  ? "text-warning"
                  : characterCount === maxLength
                    ? "text-error"
                    : "text-gray-400",
                "pointer-events-none select-none",
              )}
              aria-live="polite"
              aria-atomic="true"
            >
              {characterCount}/{maxLength}
            </div>
          )}
        </div>

        {/* Helper text or error message */}
        {helperText && (
          <p
            className={cn(
              "text-xs",
              error ? "text-error" : "text-gray-500",
              "transition-colors",
            )}
            role={error ? "alert" : undefined}
          >
            {helperText}
          </p>
        )}

        {/* Max height indicator (visual feedback) */}
        {height >= maxHeight && !disabled && (
          <div
            className={cn(
              "flex items-center gap-1.5 text-xs text-gray-500",
              "animate-fade-in",
            )}
          >
            <svg
              className="size-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Limite de hauteur atteinte. Le contenu défile automatiquement.
            </span>
          </div>
        )}
      </div>
    );
  },
);

ExpandableTextarea.displayName = "ExpandableTextarea";
