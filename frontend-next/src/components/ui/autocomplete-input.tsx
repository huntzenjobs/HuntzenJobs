/**
 * AutocompleteInput - Smart autocomplete with Radix Popover
 * Solves z-index issues, adds loading states, improves accessibility
 */

"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

export interface AutocompleteOption {
  value: string;
  label: string;
  description?: string;
}

export interface AutocompleteInputProps {
  /** Input label */
  label?: string;
  /** Current value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Options to display */
  options?: AutocompleteOption[];
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: boolean;
  /** Helper text */
  helperText?: string;
  /** Placeholder */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Required field */
  required?: boolean;
  /** Icon to display */
  icon?: React.ReactNode;
  /** Empty state message (when user typed but no results found) */
  emptyMessage?: string;
  /** Prompt shown when input is empty (before user types anything) */
  typingPromptMessage?: string;
  /** Fetch options function (for async) */
  onSearch?: (query: string) => Promise<AutocompleteOption[]>;
  /** Debounce delay for search (ms) */
  debounceMs?: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const AutocompleteInput = React.forwardRef<
  HTMLInputElement,
  AutocompleteInputProps
>(
  (
    {
      label,
      value,
      onChange,
      options: externalOptions = [],
      loading: externalLoading = false,
      error = false,
      helperText,
      placeholder = "Rechercher...",
      disabled = false,
      required = false,
      icon,
      emptyMessage = "Aucun résultat trouvé",
      typingPromptMessage,
      onSearch,
      debounceMs = 300,
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState(value);
    const [internalOptions, setInternalOptions] = React.useState<
      AutocompleteOption[]
    >([]);
    const [internalLoading, setInternalLoading] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);
    const debounceRef = React.useRef<NodeJS.Timeout>();
    const isSelectionRef = React.useRef(false);

    // Combine refs
    React.useImperativeHandle(ref, () => inputRef.current!);

    // Use external options or internal fetched options
    const options =
      externalOptions.length > 0 ? externalOptions : internalOptions;
    const loading = externalLoading || internalLoading;

    // Sync search with value (sauf si c'est une sélection)
    React.useEffect(() => {
      if (!isSelectionRef.current) {
        setSearch(value);
      }
      isSelectionRef.current = false;
    }, [value]);

    // Debounced search
    React.useEffect(() => {
      if (!onSearch) return;
      if (search.length === 0) {
        setInternalOptions([]);
        return;
      }

      // Clear previous timeout
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // Set new timeout
      debounceRef.current = setTimeout(async () => {
        setInternalLoading(true);
        try {
          const results = await onSearch(search);
          setInternalOptions(results);
        } catch (error) {
          console.error("Autocomplete search error:", error);
          setInternalOptions([]);
        } finally {
          setInternalLoading(false);
        }
      }, debounceMs);

      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
      };
    }, [search, onSearch, debounceMs]);

    // Handle input change
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setSearch(newValue);
      onChange(newValue);
      if (!open) setOpen(true);
    };

    // Handle option select
    const handleSelect = (selectedValue: string) => {
      const selectedOption = options.find((opt) => opt.value === selectedValue);
      if (selectedOption) {
        isSelectionRef.current = true;
        setSearch(selectedOption.label);
        onChange(selectedOption.value);
        setOpen(false);
      }
    };

    // Clear input
    const handleClear = () => {
      setSearch("");
      onChange("");
      inputRef.current?.focus();
    };

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
            {required && <span className="text-error ml-1">*</span>}
          </label>
        )}

        {/* Popover for options */}
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
          <PopoverPrimitive.Trigger asChild>
            <div className="relative">
              {/* Left icon */}
              {icon && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                  {icon}
                </div>
              )}

              {/* Input */}
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={handleInputChange}
                onFocus={() => {
                  if (
                    search.length > 0 ||
                    options.length > 0 ||
                    !!typingPromptMessage
                  ) {
                    setOpen(true);
                  }
                }}
                disabled={disabled}
                placeholder={placeholder}
                className={cn(
                  // Base styles
                  "w-full h-11 px-4",
                  icon && "pl-10",
                  (search.length > 0 || loading) && "pr-20",
                  "rounded-xl",
                  "font-normal text-base",
                  "transition-all duration-250 ease-smooth",
                  "outline-none",

                  // Border states
                  "border-2",
                  error
                    ? "border-error-light focus:border-error"
                    : disabled
                      ? "border-gray-200"
                      : "border-gray-200 hover:border-gray-300 focus:border-ocean-500",

                  // Background
                  disabled ? "bg-gray-100" : "bg-white",

                  // Text color
                  disabled ? "text-gray-400" : "text-gray-900",

                  // Placeholder
                  "placeholder:text-gray-400",

                  // Focus ring
                  !error && !disabled && "focus:ring-4 focus:ring-ocean-100",

                  // Error ring
                  error && "focus:ring-4 focus:ring-error-light",

                  // Disabled cursor
                  disabled && "cursor-not-allowed",
                )}
                aria-label={label}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls="autocomplete-options"
                aria-invalid={error}
                role="combobox"
              />

              {/* Right icons (loading, clear, chevron) */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {loading && (
                  <Loader2
                    className="size-4 animate-spin text-ocean-500"
                    aria-label="Chargement..."
                  />
                )}

                {search.length > 0 && !loading && !disabled && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className={cn(
                      "p-0.5 rounded hover:bg-gray-100",
                      "text-gray-400 hover:text-gray-600",
                      "transition-colors",
                    )}
                    aria-label="Effacer"
                  >
                    <X className="size-4" />
                  </button>
                )}

                <ChevronDown
                  className={cn(
                    "size-4 text-gray-400 transition-transform duration-200",
                    open && "rotate-180",
                  )}
                  aria-hidden="true"
                />
              </div>
            </div>
          </PopoverPrimitive.Trigger>

          {/* Options popover */}
          <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
              id="autocomplete-options"
              align="start"
              sideOffset={4}
              className={cn(
                "z-popover w-[var(--radix-popover-trigger-width)]",
                "bg-white rounded-xl border-2 border-gray-200",
                "shadow-lg",
                "p-1",
                "animate-scale-in origin-top",
                "max-h-[300px] overflow-auto",
                // Custom scrollbar
                "scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent",
              )}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <CommandPrimitive>
                <CommandPrimitive.List>
                  {loading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="size-5 animate-spin text-ocean-500" />
                      <span className="ml-2 text-sm text-gray-500">
                        Recherche en cours...
                      </span>
                    </div>
                  ) : options.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">
                      <Search className="size-5 mx-auto mb-2 text-gray-400" />
                      {search.length === 0 && typingPromptMessage
                        ? typingPromptMessage
                        : emptyMessage}
                    </div>
                  ) : (
                    <CommandPrimitive.Group>
                      {options.map((option) => (
                        <CommandPrimitive.Item
                          key={option.value}
                          value={option.value}
                          onSelect={handleSelect}
                          className={cn(
                            "relative flex items-center gap-2 px-3 py-2.5",
                            "rounded-lg cursor-pointer",
                            "text-sm text-gray-900",
                            "transition-colors",
                            "hover:bg-ocean-50",
                            "data-[selected=true]:bg-ocean-100",
                            "outline-none",
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">
                              {option.label}
                            </div>
                            {option.description && (
                              <div className="text-xs text-gray-500 truncate">
                                {option.description}
                              </div>
                            )}
                          </div>

                          {value === option.value && (
                            <Check
                              className="size-4 text-ocean-600 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </CommandPrimitive.Item>
                      ))}
                    </CommandPrimitive.Group>
                  )}
                </CommandPrimitive.List>
              </CommandPrimitive>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>

        {/* Helper text */}
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
      </div>
    );
  },
);

AutocompleteInput.displayName = "AutocompleteInput";
