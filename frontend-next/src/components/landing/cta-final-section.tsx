"use client";

import Link from "next/link";
import { motion } from "framer-motion";

const GRID_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%2300D9FF' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E\")";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

interface CtaFinalSectionProps {
  texts: {
    title: string;
    subtitle: string;
    cta: string;
  };
}

export function CtaFinalSection({ texts }: CtaFinalSectionProps) {
  return (
    <section className="relative py-20 sm:py-28 bg-slate-900 overflow-hidden">
      <div
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: GRID_PATTERN, backgroundSize: "60px 60px" }}
      />
      <motion.div
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.15, 0.1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-0 left-1/4 w-96 h-96 bg-[#00D9FF]/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.08, 0.12, 0.08] }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 1,
        }}
        className="absolute bottom-0 right-1/4 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl"
      />
      <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center">
        <motion.h2
          {...fadeUp}
          className="text-3xl sm:text-4xl md:text-5xl font-black text-white mb-4"
        >
          {texts.title}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-white/70 text-lg mb-10"
        >
          {texts.subtitle}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-2xl hover:shadow-[#00D9FF]/30 hover:-translate-y-0.5"
          >
            {texts.cta}
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
