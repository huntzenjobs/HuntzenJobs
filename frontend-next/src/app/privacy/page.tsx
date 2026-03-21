'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, Lock, Eye, FileText, ChevronRight } from 'lucide-react'
import { LandingHeader } from '@/components/landing-header'
import { useTranslations } from 'next-intl'

export default function PrivacyPage() {
  const t = useTranslations('privacy')

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader />

      {/* Hero Section */}
      <div className="pt-20 bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-[#00D9FF]/20 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-[#00D9FF]" />
              </div>
              <h1 className="text-4xl sm:text-5xl font-black">
                {t('title')}
              </h1>
            </div>
            <p className="text-xl text-white/80">
              {t('subtitle')}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-wrap gap-3">
            {[
              { icon: FileText, label: t('quickLinks.dataCollection'), href: '#collecte' },
              { icon: Eye, label: t('quickLinks.rights'), href: '#droits' },
              { icon: Lock, label: t('quickLinks.security'), href: '#securite' },
            ].map((item, index) => (
              <motion.a
                key={index}
                href={item.href}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-200 hover:border-[#00D9FF] hover:bg-[#00D9FF]/5 transition-colors text-sm font-medium text-gray-700 hover:text-[#00D9FF]"
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </motion.a>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="prose prose-lg max-w-none"
        >
          {/* Intro - static i18n content with trusted <strong> tags from translation files */}
          <div className="mb-12 p-6 bg-blue-50 border-l-4 border-[#00D9FF] rounded-r-lg">
            <p className="text-gray-700 leading-relaxed m-0" dangerouslySetInnerHTML={{ __html: t('intro') }} />
          </div>

          <section id="collecte" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('dataCollection.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>{t('dataCollection.content1')}</p>
              <p>{t('dataCollection.content2')}</p>
              <p>{t('dataCollection.content3')}</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>{t('dataCollection.bullet1')}</li>
                <li>{t('dataCollection.bullet2')}</li>
                <li>{t('dataCollection.bullet3')}</li>
                <li>{t('dataCollection.bullet4')}</li>
                <li>{t('dataCollection.bullet5')}</li>
              </ul>
            </div>
          </section>

          <section id="droits" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Eye className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('userRights.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>{t('userRights.content1')}</p>
              <p>{t('userRights.content2')}</p>
              <p>{t('userRights.content3')}</p>
              <div className="bg-gray-50 rounded-lg p-6 mt-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4">{t('userRights.contactTitle')}</h3>
                <ul className="space-y-2">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('userRights.contactEmail')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('userRights.contactAddress')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('dataRetention.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('dataRetention.content1')}</p>
              <p>{t('dataRetention.content2')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('dataSharing.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('dataSharing.content1')}</p>
              <ul className="list-disc pl-6 space-y-3">
                <li>{t('dataSharing.bullet1')}</li>
                <li>{t('dataSharing.bullet2')}</li>
              </ul>
            </div>
          </section>

          <section id="securite" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Lock className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('security.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>{t('security.content1')}</p>
              <p>{t('security.content2')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('cookiesSection.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <h3 className="text-xl font-bold text-gray-900">{t('cookiesSection.whatIsTitle')}</h3>
              <p>{t('cookiesSection.whatIsContent')}</p>
              <p>{t('cookiesSection.firstVisit')}</p>
              <p>{t('cookiesSection.ownCookies')}</p>
              <h3 className="text-xl font-bold text-gray-900 mt-8">{t('cookiesSection.controlTitle')}</h3>
              <p>{t('cookiesSection.controlContent')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('internationalTransfers.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('internationalTransfers.content1')}</p>
              <p>{t('internationalTransfers.content2')}</p>
              <p>{t('internationalTransfers.content3')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('complaints.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('complaints.content1')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('questions.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('questions.content1')}</p>
              <div className="bg-gray-50 rounded-lg p-6 mt-4">
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('questions.phone')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('questions.email')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('questions.address')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('policyChanges.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('policyChanges.content1')}</p>
            </div>
          </section>

          <div className="mt-12 p-6 bg-gray-50 rounded-lg border-l-4 border-[#00D9FF]">
            <p className="text-sm text-gray-600 m-0">
              <strong>{t('lastUpdated')}</strong> {t('lastUpdatedDate')}
            </p>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="bg-black text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-white font-bold text-xl tracking-tight">HuntZen</span>
                <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></span>
              </div>
              <p className="text-white/70 text-sm">
                {t('footerLinks.tagline')}
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-4">{t('footerLinks.importantLinks')}</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li><Link href="/" className="hover:text-[#00D9FF] transition-colors">{t('footerLinks.home')}</Link></li>
                <li><Link href="/pricing" className="hover:text-[#00D9FF] transition-colors">{t('footerLinks.pricing')}</Link></li>
                <li><Link href="/terms" className="hover:text-[#00D9FF] transition-colors">{t('footerLinks.terms')}</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">{t('footerLinks.contact')}</h3>
              <ul className="space-y-2 text-sm text-white/70">
                <li>+351 21 111 9967</li>
                <li>+33 (1) 84 19 26 61</li>
                <li>contact@huntzenjobs.co</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-white/10 text-center text-sm text-white/50">
            {t('footerLinks.copyright', { year: new Date().getFullYear() })}
          </div>
        </div>
      </footer>

      <style jsx global>{`
        body {
          font-family: var(--font-dm-sans), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        .prose h2 { margin-top: 2rem; margin-bottom: 1rem; }
        .prose h3 { margin-top: 1.5rem; margin-bottom: 0.75rem; }
        .prose p { margin-bottom: 1rem; }
        .prose ul { margin-bottom: 1rem; }
      `}</style>
    </div>
  )
}
