"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

interface SearchLoadingModalProps {
  isOpen: boolean;
  searchQuery?: string;
}

export function SearchLoadingModal({
  isOpen,
  searchQuery,
}: SearchLoadingModalProps) {
  const t = useTranslations("jobs.searchLoadingModal");
  const STEPS = [
    { label: t("steps.connectingJobBoards"), duration: 5 },
    { label: t("steps.analyzingSearch"), duration: 10 },
    { label: t("steps.filteringRelevance"), duration: 18 },
    { label: t("steps.verifyingOffers"), duration: 24 },
    { label: t("steps.sortingResults"), duration: 30 },
  ];
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (isOpen) setElapsed(0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  const progress = Math.min((elapsed / 30) * 100, 95);
  const currentStepIndex = STEPS.findIndex((s) => elapsed < s.duration);
  const activeStep =
    currentStepIndex === -1 ? STEPS.length - 1 : currentStepIndex;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            backgroundColor: "rgba(241, 245, 249, 0.75)",
          }}
        >
          <motion.div
            initial={{ scale: 0.97, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: -8 }}
            transition={{ type: "spring", damping: 30, stiffness: 340 }}
            className="relative mx-4 w-full max-w-sm bg-white rounded-2xl overflow-hidden"
            style={{
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)",
              border: "1px solid rgba(0,0,0,0.06)",
            }}
          >
            {/* Progress line at top */}
            <div className="h-[3px] w-full bg-gray-100">
              <motion.div
                className="h-full rounded-full"
                style={{ background: "#2563eb" }}
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              />
            </div>

            <div className="px-8 py-8">
              {/* Header */}
              <div className="mb-7">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-1.5">
                  {t("title")}
                </p>
                <h2 className="text-[17px] font-semibold text-gray-900 leading-snug">
                  {searchQuery ? (
                    <span className="text-gray-900">{searchQuery}</span>
                  ) : (
                    t("defaultQuery")
                  )}
                </h2>
              </div>

              {/* Step list */}
              <div className="space-y-3 mb-7">
                {STEPS.map((step, i) => {
                  const isDone = i < activeStep;
                  const isActive = i === activeStep;

                  return (
                    <motion.div
                      key={i}
                      className="flex items-center gap-3"
                      initial={false}
                    >
                      {/* Step indicator */}
                      <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
                        {isDone ? (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{
                              type: "spring",
                              damping: 20,
                              stiffness: 400,
                            }}
                            className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ background: "#00d4aa" }}
                          >
                            <Check
                              className="w-3 h-3 text-white"
                              strokeWidth={2.5}
                            />
                          </motion.div>
                        ) : isActive ? (
                          <div className="relative w-4 h-4 flex items-center justify-center">
                            <motion.div
                              className="absolute w-4 h-4 rounded-full border-2"
                              style={{ borderColor: "#2563eb" }}
                              animate={{ rotate: 360 }}
                              transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "linear",
                              }}
                            />
                            <div
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: "#2563eb" }}
                            />
                          </div>
                        ) : (
                          <div
                            className="w-4 h-4 rounded-full border-2"
                            style={{ borderColor: "#e2e8f0" }}
                          />
                        )}
                      </div>

                      {/* Label */}
                      <span
                        className="text-[13.5px] leading-none transition-all duration-300"
                        style={{
                          color: isDone
                            ? "#94a3b8"
                            : isActive
                              ? "#1e293b"
                              : "#cbd5e1",
                          fontWeight: isActive ? 500 : 400,
                        }}
                      >
                        {step.label}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Footer */}
              <p className="text-[11px] text-gray-300 text-center">
                {t("footer")}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
