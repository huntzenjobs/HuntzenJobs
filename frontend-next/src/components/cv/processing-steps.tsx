/**
 * Processing Steps - Visual feedback during CV analysis
 *
 * Shows clear steps instead of a stuck progress bar at 0%
 * Better UX - users know what's happening
 */

"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Upload,
  FileSearch,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";

interface ProcessingStepsProps {
  status: "pending" | "processing" | "completed" | "failed";
  elapsedTime: number;
}

interface Step {
  id: string;
  label: string;
  icon: React.ElementType;
  estimatedTime: string;
}

const steps: Step[] = [
  { id: "upload", label: "Upload du CV", icon: Upload, estimatedTime: "1s" },
  {
    id: "extraction",
    label: "Extraction du texte",
    icon: FileSearch,
    estimatedTime: "3-5s",
  },
  {
    id: "analysis",
    label: "Analyse IA",
    icon: Sparkles,
    estimatedTime: "8-12s",
  },
  {
    id: "complete",
    label: "Finalisation",
    icon: CheckCircle2,
    estimatedTime: "1s",
  },
];

export function ProcessingSteps({ status, elapsedTime }: ProcessingStepsProps) {
  const t = useTranslations("cv");

  // Determine current step based on elapsed time and status
  const getCurrentStep = (): number => {
    if (status === "completed") return 4;
    if (status === "failed") return -1;

    // Smart step progression based on elapsed time
    if (status === "pending") return 0; // Upload completed, waiting for processing
    if (elapsedTime < 2) return 1; // Extraction starting
    if (elapsedTime < 6) return 2; // Extraction in progress
    if (elapsedTime < 15) return 3; // Analysis in progress
    return 3; // Still analyzing (can take longer)
  };

  const currentStep = getCurrentStep();

  return (
    <div className="space-y-6">
      {/* Steps List */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isPending = stepNumber > currentStep;

          const Icon = step.icon;

          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`flex items-center gap-4 p-4 rounded-lg transition-all ${
                isCompleted
                  ? "bg-green-50 border-2 border-green-200"
                  : isCurrent
                    ? "bg-blue-50 border-2 border-blue-400 shadow-lg scale-105"
                    : "bg-gray-50 border-2 border-gray-200"
              }`}
            >
              {/* Icon */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  isCompleted
                    ? "bg-green-500"
                    : isCurrent
                      ? "bg-blue-500"
                      : "bg-gray-300"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                ) : isCurrent ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Icon className="w-6 h-6 text-white" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4
                    className={`font-semibold ${
                      isCompleted
                        ? "text-green-900"
                        : isCurrent
                          ? "text-blue-900"
                          : "text-gray-600"
                    }`}
                  >
                    {step.label}
                  </h4>
                  <span
                    className={`text-sm ${
                      isCompleted
                        ? "text-green-700"
                        : isCurrent
                          ? "text-blue-700"
                          : "text-gray-500"
                    }`}
                  >
                    {isCompleted
                      ? "✓"
                      : isCurrent
                        ? t("inProgress")
                        : step.estimatedTime}
                  </span>
                </div>

                {/* Progress bar for current step */}
                {isCurrent && (
                  <div className="mt-2 h-1.5 bg-blue-200 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-blue-500"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{
                        duration:
                          stepNumber === 2 ? 4 : stepNumber === 3 ? 10 : 2,
                        ease: "linear",
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Time Info */}
      <div className="text-center text-sm text-gray-600 space-y-1">
        <p>
          Temps écoulé :{" "}
          <span className="font-semibold text-gray-900">{elapsedTime}s</span>
        </p>
        <p className="text-xs text-gray-500">
          {status === "processing"
            ? "Traitement en cours sur Modal Labs..."
            : status === "pending"
              ? "Préparation du traitement..."
              : "Finalisation..."}
        </p>
      </div>
    </div>
  );
}
