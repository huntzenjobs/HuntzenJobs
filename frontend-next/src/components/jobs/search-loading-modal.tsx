"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = [
  {
    emoji: "🔍",
    text: "On fouille internet comme si votre emploi en dépendait... (il en dépend)",
  },
  {
    emoji: "🤖",
    text: "Nos robots consultent discrètement des centaines d'offres en ce moment",
  },
  {
    emoji: "☕",
    text: "Pendant ce temps, vos futurs collègues boivent leur 3ème café de la journée",
  },
  {
    emoji: "🕵️",
    text: "Infiltration discrète en cours sur les meilleurs job boards du web",
  },
  {
    emoji: "🐢",
    text: "C'est un peu long ? Les bons recruteurs ne répondent pas vite non plus...",
  },
  {
    emoji: "✨",
    text: "Les astres s'alignent pour votre prochaine aventure professionnelle",
  },
  {
    emoji: "🎯",
    text: "Calibration du radar à opportunités en cours... Beep. Beep. Beep.",
  },
  {
    emoji: "📊",
    text: "Analyse de 87 variables pour trouver le job parfait. (Ce chiffre est totalement inventé)",
  },
  {
    emoji: "🧠",
    text: "Nos algorithmes consultent leurs algorithmes qui consultent d'autres algorithmes",
  },
  {
    emoji: "🗺️",
    text: "On cartographie le marché de l'emploi pour vous, comme un GPS de carrière",
  },
];

interface SearchLoadingModalProps {
  isOpen: boolean;
  searchQuery?: string;
}

export function SearchLoadingModal({
  isOpen,
  searchQuery,
}: SearchLoadingModalProps) {
  const [elapsed, setElapsed] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setElapsed(0);
      setMessageIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const rotator = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 4000);
    return () => clearInterval(rotator);
  }, [isOpen]);

  const progress = Math.min((elapsed / 30) * 100, 95);
  const currentMessage = MESSAGES[messageIndex];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            backgroundColor: "rgba(15, 23, 42, 0.80)",
          }}
        >
          <motion.div
            initial={{ scale: 0.88, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: -12 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="relative mx-4 w-full max-w-md"
          >
            {/* Glow halo behind card */}
            <div
              className="absolute -inset-px rounded-2xl opacity-40"
              style={{
                background:
                  "linear-gradient(135deg, #2563eb 0%, #00d4aa 100%)",
                filter: "blur(24px)",
              }}
            />

            {/* Card */}
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                background: "rgba(15, 23, 42, 0.92)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow:
                  "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              {/* Top gradient bar — animated */}
              <div
                className="h-[3px] w-full"
                style={{
                  background:
                    "linear-gradient(90deg, #2563eb, #00d4aa, #2563eb)",
                  backgroundSize: "200% 100%",
                  animation: "gradient-x 2.5s ease infinite",
                }}
              />

              <div className="px-8 py-8">
                {/* Radar pulse animation */}
                <div className="mb-7 flex justify-center">
                  <div className="relative h-[72px] w-[72px]">
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ border: "1px solid rgba(37,99,235,0.4)" }}
                      animate={{ scale: [1, 1.9], opacity: [0.6, 0] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ border: "1px solid rgba(0,212,170,0.4)" }}
                      animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: 0.7,
                      }}
                    />

                    {/* Center orb */}
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-full"
                      style={{
                        background:
                          "linear-gradient(135deg, #2563eb 0%, #00d4aa 100%)",
                        boxShadow: "0 0 20px rgba(37,99,235,0.5)",
                      }}
                    >
                      <motion.span
                        className="text-2xl"
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ duration: 3, repeat: Infinity }}
                      >
                        🎯
                      </motion.span>
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div className="mb-6 text-center">
                  <h2
                    className="text-[19px] font-bold tracking-tight"
                    style={{ color: "#f1f5f9" }}
                  >
                    Recherche en cours
                    {searchQuery && (
                      <span style={{ color: "#00d4aa" }}> · {searchQuery}</span>
                    )}
                  </h2>
                  <p
                    className="mt-1.5 text-sm"
                    style={{ color: "rgba(148,163,184,0.9)" }}
                  >
                    Environ 30 secondes, promis 🤝
                  </p>
                </div>

                {/* Rotating funny message */}
                <div
                  className="mb-6 flex min-h-[72px] items-center justify-center rounded-xl px-4 py-3"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={messageIndex}
                      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
                      transition={{ duration: 0.35 }}
                      className="text-center"
                    >
                      <span className="mb-1.5 block text-xl">
                        {currentMessage.emoji}
                      </span>
                      <p
                        className="text-[13px] italic leading-relaxed"
                        style={{ color: "rgba(148,163,184,0.85)" }}
                      >
                        &ldquo;{currentMessage.text}&rdquo;
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div
                    className="h-[5px] w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #2563eb, #00d4aa)",
                      }}
                      initial={{ width: "0%" }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: "rgba(100,116,139,0.9)" }}
                    >
                      ⏱ {elapsed}s
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="h-1 w-1 rounded-full"
                          style={{ background: "#2563eb" }}
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{
                            duration: 1.2,
                            repeat: Infinity,
                            delay: i * 0.3,
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className="font-mono text-[11px]"
                      style={{ color: "rgba(100,116,139,0.9)" }}
                    >
                      ~30s
                    </span>
                  </div>
                </div>

                <p
                  className="mt-5 text-center text-[11px]"
                  style={{ color: "rgba(71,85,105,0.9)" }}
                >
                  Ne fermez pas cette page 🙏
                </p>
              </div>
            </div>
          </motion.div>

          {/* Injected keyframe for gradient animation */}
          <style>{`
            @keyframes gradient-x {
              0%, 100% { background-position: 0% 50%; }
              50% { background-position: 100% 50%; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
