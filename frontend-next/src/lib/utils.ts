import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Restore line breaks escaped as text by some job providers.
 * The returned value still needs HTML sanitization before rendering.
 */
export function normalizeJobDescription(description: string): string {
  if (!description) return ""

  return description
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
}
