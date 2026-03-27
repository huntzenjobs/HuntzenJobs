"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";

interface FeaturesShowcaseProps {
  texts: {
    jobs: {
      badge: string;
      title: string;
      description: string;
      bullets: string[];
      cta: string;
    };
    cv: {
      badge: string;
      title: string;
      description: string;
      bullets: string[];
      cta: string;
    };
    coaches: {
      badge: string;
      title: string;
      description: string;
      cta: string;
      list: { name: string; desc: string }[];
    };
  };
}

export function FeaturesShowcase({ texts }: FeaturesShowcaseProps) {
  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6 max-w-6xl">
        {/* Feature A — Recherche */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20 sm:mb-28">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl relative"
          >
            <Image
              src="https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=2340&auto=format&fit=crop"
              alt="Recherche d'emploi sur ordinateur"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
              {texts.jobs.badge}
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              {texts.jobs.title}
            </h3>
            <p className="text-slate-600 text-base leading-relaxed mb-6">
              {texts.jobs.description}
            </p>
            <ul className="space-y-3 mb-6">
              {texts.jobs.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700 text-sm">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/jobs"
              className="text-[#00D9FF] font-semibold hover:underline text-sm"
            >
              {texts.jobs.cta}
            </Link>
          </motion.div>
        </div>

        {/* Feature B — CV ATS */}
        <div className="grid md:grid-cols-2 gap-12 items-center mb-20 sm:mb-28">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
              {texts.cv.badge}
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              {texts.cv.title}
            </h3>
            <p className="text-slate-600 text-base leading-relaxed mb-6">
              {texts.cv.description}
            </p>
            <ul className="space-y-3 mb-6">
              {texts.cv.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700 text-sm">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/cv-analysis"
              className="text-[#00D9FF] font-semibold hover:underline text-sm"
            >
              {texts.cv.cta}
            </Link>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl relative"
          >
            <Image
              src="https://images.unsplash.com/photo-1586281380349-632531db7ed4?q=80&w=2340&auto=format&fit=crop"
              alt="Analyse de CV professionnel"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </motion.div>
        </div>

        {/* Feature C — Coachs */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl overflow-hidden aspect-square border-2 border-slate-200 shadow-xl relative"
          >
            <Image
              src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=2340&auto=format&fit=crop"
              alt="Coaching carrière personnalisé"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-3 py-1 rounded-full bg-[#00D9FF]/10 text-[#00D9FF] text-xs font-bold tracking-widest mb-4">
              {texts.coaches.badge}
            </span>
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
              {texts.coaches.title}
            </h3>
            <p className="text-slate-600 text-base leading-relaxed mb-6">
              {texts.coaches.description}
            </p>
            <ul className="space-y-3 mb-6">
              {texts.coaches.list.map((coach, i) => (
                <li key={i} className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[#00D9FF] flex-shrink-0 mt-0.5" />
                  <span className="text-slate-700 text-sm">
                    <strong>{coach.name}</strong> · {coach.desc}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/assistant"
              className="text-[#00D9FF] font-semibold hover:underline text-sm"
            >
              {texts.coaches.cta}
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
