import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseJobSalaryAmount(salary?: string): number | null {
  const match = salary?.match(/\d[\d\s.,\u00a0\u202f]*/)
  if (!match) return null
  let amount = match[0].replace(/\s/g, "").replace(/[.,]+$/, "")
  const lastSeparator = Math.max(amount.lastIndexOf("."), amount.lastIndexOf(","))
  // Un groupe final de trois chiffres est un séparateur de milliers.
  // Les autres groupes finaux représentent les décimales du montant fourni.
  if (lastSeparator >= 0 && amount.length - lastSeparator - 1 !== 3) {
    amount = amount.slice(0, lastSeparator).replace(/[.,]/g, "") + "." + amount.slice(lastSeparator + 1)
  } else {
    amount = amount.replace(/[.,]/g, "")
  }
  const suffix = salary?.slice((match.index ?? 0) + match[0].length) ?? ""
  const parsed = Number(amount) * (/^k\b/i.test(suffix) ? 1000 : 1)
  return Number.isFinite(parsed) ? parsed : null
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
