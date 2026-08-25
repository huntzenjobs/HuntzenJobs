"use client";

/**
 * SkipLink Component
 * Allows keyboard users to skip directly to main content
 * Appears only when focused (for screen readers and keyboard navigation)
 */

interface SkipLinkProps {
  label: string;
}

export function SkipLink({ label }: SkipLinkProps) {
  return (
    <a
      href="#main-content"
      onClick={() => document.getElementById("main-content")?.focus()}
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
    >
      {label}
    </a>
  );
}
