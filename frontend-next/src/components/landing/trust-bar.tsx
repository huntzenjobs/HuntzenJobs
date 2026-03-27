"use client";

import { motion } from "framer-motion";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

interface TrustBarProps {
  texts: {
    title: string;
    andMore: string;
  };
}

export function TrustBar({ texts }: TrustBarProps) {
  return (
    <section className="py-12 bg-gradient-to-b from-slate-900 to-slate-50">
      <div className="container mx-auto px-4 sm:px-6 text-center">
        <motion.p
          {...fadeUp}
          className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-6"
        >
          {texts.title}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {[
            "France Travail",
            "Indeed",
            "LinkedIn",
            "Welcome to the Jungle",
            "HelloWork",
            "APEC",
          ].map((name) => (
            <span
              key={name}
              className="px-4 py-1.5 rounded-full bg-slate-200 border border-slate-300 text-slate-600 text-sm font-semibold"
            >
              {name}
            </span>
          ))}
          <span className="px-4 py-1.5 rounded-full bg-slate-200 border border-slate-300 text-slate-500 text-sm font-semibold italic">
            {texts.andMore}
          </span>
        </motion.div>
      </div>
    </section>
  );
}
