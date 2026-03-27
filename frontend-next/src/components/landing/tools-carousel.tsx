"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  Search,
  FileText,
  UserCheck,
  Briefcase,
  Award,
  Mic,
  Linkedin,
  Calendar,
  Bookmark,
  UserCheck2,
  FilePlus,
  Globe,
} from "lucide-react";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 } as const,
  transition: { duration: 0.5 },
};

interface ToolItem {
  name: string;
  desc: string;
  badge: string | null;
}

interface ToolsCarouselProps {
  texts: {
    title: string;
    subtitle: string;
  };
  items: ToolItem[];
}

const ICONS: React.ElementType[] = [
  Search, FileText, UserCheck, Briefcase, Award, Mic,
  Linkedin, Calendar, Bookmark, UserCheck2, FilePlus, Globe,
];

export function ToolsCarousel({ texts, items }: ToolsCarouselProps) {
  return (
    <section id="how" className="py-16 sm:py-24 bg-white overflow-hidden">
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
      </div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-32 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          className="flex gap-4 w-max"
        >
          {[0, 1].map((dupeIndex) =>
            items.map((item, i) => {
              const Icon = ICONS[i % ICONS.length];
              return (
                <div
                  key={`${dupeIndex}-${i}`}
                  className="flex-shrink-0 w-56 sm:w-64 bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 hover:border-[#00D9FF]/40 hover:shadow-lg transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-slate-600" />
                    </div>
                    {item.badge && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">
                    {item.name}
                  </h3>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              );
            }),
          )}
        </motion.div>
      </div>
    </section>
  );
}
