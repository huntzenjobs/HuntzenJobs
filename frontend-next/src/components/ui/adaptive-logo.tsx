"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface AdaptiveLogoProps {
  /** Whether to show dark version (for light backgrounds) */
  isDark?: boolean;
  /** Size preset */
  size?: "sm" | "md" | "lg" | "xl";
  /** Show animated pulse dot */
  showPulse?: boolean;
  /** Custom className */
  className?: string;
  /** Show text logo "Jobs" */
  showText?: boolean;
  /** Text color override */
  textColor?: string;
}

const SIZES = {
  sm: { container: "w-12 h-12", text: "text-lg" },
  md: { container: "w-16 h-16", text: "text-2xl" },
  lg: { container: "w-20 h-20", text: "text-3xl" },
  xl: { container: "w-24 h-24", text: "text-4xl" },
};

/**
 * Adaptive HuntZen Logo Component
 *
 * Automatically switches between light and dark versions based on background.
 * Supports multiple sizes and optional animated pulse dot.
 *
 * @example
 * ```tsx
 * // Light background (shows dark logo)
 * <AdaptiveLogo isDark size="md" showPulse showText />
 *
 * // Dark background (shows light logo)
 * <AdaptiveLogo isDark={false} size="lg" showText textColor="text-white" />
 * ```
 */
export function AdaptiveLogo({
  isDark = false,
  size = "md",
  showPulse = false,
  className = "",
  showText = false,
  textColor,
}: AdaptiveLogoProps) {
  const sizeClasses = SIZES[size];

  // Determine text color based on isDark prop if not explicitly set
  const finalTextColor = textColor || (isDark ? "text-black" : "text-white");

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Logo Icon */}
      <div className={`relative ${sizeClasses.container}`}>
        <Image
          src={isDark ? "/logo-dark.svg" : "/logo-light.svg"}
          alt="HuntZen"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* Text Logo */}
      {showText && (
        <div className="flex items-center gap-1.5">
          <span
            className={`font-black ${sizeClasses.text} tracking-tight transition-colors ${finalTextColor}`}
          >
            Jobs
          </span>
          {showPulse && (
            <motion.span
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-2.5 h-2.5 rounded-full bg-[#00D9FF]"
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simplified text-only logo for HuntZen
 * Used in sidebar and mobile header
 */
export function TextLogo({
  isDark = false,
  size = "md",
  showPulse = true,
  className = "",
}: Pick<AdaptiveLogoProps, "isDark" | "size" | "showPulse" | "className">) {
  const sizeClasses = SIZES[size];
  const textColor = isDark ? "text-black" : "text-white";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`font-bold ${sizeClasses.text} tracking-tight transition-colors ${textColor}`}
      >
        HuntZen <span className="text-[#00D9FF]">Jobs</span>
      </span>
      {showPulse && (
        <motion.span
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-[#00D9FF]"
        />
      )}
    </div>
  );
}
