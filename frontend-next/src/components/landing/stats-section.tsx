"use client";

import React from "react";
import { motion } from "framer-motion";
import { Users, CheckCircle2, TrendingUp } from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

const ICONS: React.ElementType[] = [Users, CheckCircle2, TrendingUp];

interface StatsSectionProps {
  texts: {
    title: string;
    subtitle: string;
    disclaimer: string;
    stats: { value: string; label: string }[];
  };
}

export function StatsSection({ texts }: StatsSectionProps) {
  return (
    <section className="py-16 sm:py-20 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <motion.h2
            {...fadeUp}
            className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3"
          >
            {texts.title}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-slate-500 text-base"
          >
            {texts.subtitle}
          </motion.p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {texts.stats.map((stat, index) => {
            const Icon = ICONS[index % ICONS.length];
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="text-center bg-slate-50 rounded-2xl p-8 border border-slate-200 hover:border-[#00D9FF]/30 hover:shadow-lg transition-all"
              >
                <div className="flex justify-center mb-4">
                  <div className="w-12 h-12 flex items-center justify-center bg-[#00D9FF]/10 rounded-2xl">
                    <Icon className="w-6 h-6 text-[#00D9FF]" />
                  </div>
                </div>
                <div className="text-4xl sm:text-5xl font-black text-[#00D9FF] mb-2">
                  {stat.value}
                </div>
                <div className="text-slate-600 font-medium text-sm">
                  {stat.label}
                </div>
              </motion.div>
            );
          })}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          {texts.disclaimer}
        </p>
      </div>
    </section>
  );
}
