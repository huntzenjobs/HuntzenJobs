"use client";

import { motion } from "framer-motion";
import { LandingPricingSection } from "@/components/landing/pricing-section";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

interface PricingLandingWrapperProps {
  texts: {
    title: string;
    subtitle: string;
  };
}

export function PricingLandingWrapper({ texts }: PricingLandingWrapperProps) {
  return (
    <section className="py-16 sm:py-20 bg-slate-50">
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
            className="text-slate-500 text-base max-w-2xl mx-auto"
          >
            {texts.subtitle}
          </motion.p>
        </div>
        <LandingPricingSection />
      </div>
    </section>
  );
}
