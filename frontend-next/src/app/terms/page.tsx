'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { FileText, Users, CreditCard, Scale, ChevronRight, AlertCircle } from 'lucide-react'
import { LandingHeader } from '@/components/landing-header'
import { useTranslations } from 'next-intl'

export default function TermsPage() {
  const t = useTranslations('terms')

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
                <Scale className="w-6 h-6 text-[#00D9FF]" />
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
              { icon: Users, label: t('quickLinks.profiles'), href: '#profils' },
              { icon: FileText, label: t('quickLinks.services'), href: '#services' },
              { icon: CreditCard, label: t('quickLinks.pricing'), href: '#prix' },
              { icon: AlertCircle, label: t('quickLinks.responsibilities'), href: '#responsabilites' },
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
          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('whoWeAre.title')}</h2>
            {/* Static i18n content from translation files - safe to render as HTML */}
            <div className="p-6 bg-blue-50 border-l-4 border-[#00D9FF] rounded-r-lg">
              <p className="text-gray-700 leading-relaxed m-0" dangerouslySetInnerHTML={{ __html: t('whoWeAre.intro') }} />
            </div>
            <div className="mt-6 space-y-4 text-gray-700">
              <p dangerouslySetInnerHTML={{ __html: t('whoWeAre.thanks') }} />
              <p>{t('whoWeAre.important')}</p>
              <p dangerouslySetInnerHTML={{ __html: t('whoWeAre.contactIntro') }} />
              <ul className="list-none pl-0 space-y-2">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>{t('whoWeAre.phonePT')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>{t('whoWeAre.phoneFR')}</span>
                </li>
              </ul>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('applicability.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('applicability.content1')}</p>
              <p>{t('applicability.content2')}</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">
                    <strong>{t('applicability.warningLabel')}</strong> {t('applicability.warning')}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('intellectualProperty.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('intellectualProperty.content1')}</p>
              <p>{t('intellectualProperty.content2')}</p>
              <p>{t('intellectualProperty.content3')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('siteContent.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('siteContent.content1')}</p>
              <p>{t('siteContent.content2')}</p>
            </div>
          </section>

          <section id="profils" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <Users className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('userProfiles.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>{t('userProfiles.intro')}</p>
              <div className="grid gap-4 mt-6">
                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{t('userProfiles.clientTitle')}</h3>
                  <p className="m-0">{t('userProfiles.clientDesc')}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{t('userProfiles.recruiterTitle')}</h3>
                  <p className="m-0">{t('userProfiles.recruiterDesc')}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-6 border-l-4 border-[#00D9FF]">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{t('userProfiles.candidateTitle')}</h3>
                  <p className="m-0">{t('userProfiles.candidateDesc')}</p>
                </div>
              </div>
            </div>
          </section>

          <section id="services" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('servicesDescription.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{t('servicesDescription.clientTitle')}</h3>
                  <p>{t('servicesDescription.clientDesc')}</p>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{t('servicesDescription.recruiterTitle')}</h3>
                  <p>{t('servicesDescription.recruiterDesc')}</p>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{t('servicesDescription.candidateTitle')}</h3>
                  <p>{t('servicesDescription.candidateDesc')}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('serviceAccess.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('serviceAccess.content1')}</p>
              <p>{t('serviceAccess.content2')}</p>
              <p>{t('serviceAccess.content3')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('registration.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('registration.content1')}</p>
              <p>{t('registration.content2')}</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">{t('registration.warning')}</p>
                </div>
              </div>
              <p>{t('registration.content3')}</p>
            </div>
          </section>

          <section id="prix" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('pricingSection.title')}</h2>
            </div>
            <div className="space-y-4 text-gray-700">
              <p>{t('pricingSection.content1')}</p>
              <p>{t('pricingSection.content2')}</p>
              <h3 className="text-xl font-bold text-gray-900 mt-8 mb-4">{t('pricingSection.financialConditions')}</h3>
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">{t('pricingSection.clientTitle')}</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>{t('pricingSection.clientBullet1')}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>{t('pricingSection.clientBullet2')}</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">{t('pricingSection.recruiterTitle')}</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      {/* Static i18n content with <strong> tags - safe */}
                      <span dangerouslySetInnerHTML={{ __html: t('pricingSection.recruiterBullet1') }} />
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span dangerouslySetInnerHTML={{ __html: t('pricingSection.recruiterBullet2') }} />
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>{t('pricingSection.recruiterBullet3')}</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gray-50 rounded-lg p-6">
                  <h4 className="font-bold text-gray-900 mb-3">{t('pricingSection.candidateTitle')}</h4>
                  <ul className="space-y-2 list-none pl-0">
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span dangerouslySetInnerHTML={{ __html: t('pricingSection.candidateBullet1') }} />
                    </li>
                    <li className="flex items-start gap-2">
                      <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                      <span>{t('pricingSection.candidateBullet2')}</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section id="responsabilites" className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-[#00D9FF]/10 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-[#00D9FF]" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900 m-0">{t('obligations.title')}</h2>
            </div>
            <div className="space-y-6 text-gray-700">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{t('obligations.huntzenTitle')}</h3>
                <p>{t('obligations.huntzenContent1')}</p>
                <p>{t('obligations.huntzenContent2')}</p>
                <p>{t('obligations.huntzenContent3')}</p>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{t('obligations.clientTitle')}</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.clientBullet1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.clientBullet2')}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{t('obligations.recruiterTitle')}</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.recruiterBullet1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.recruiterBullet2')}</span>
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{t('obligations.candidateTitle')}</h3>
                <ul className="space-y-2 list-none pl-0">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.candidateBullet1')}</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                    <span>{t('obligations.candidateBullet2')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('liability.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('liability.content1')}</p>
              <p>{t('liability.content2')}</p>
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <p className="text-gray-700 m-0">{t('liability.warning')}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('applicableLaw.title')}</h2>
            <div className="space-y-4 text-gray-700">
              <p>{t('applicableLaw.content1')}</p>
              <p>{t('applicableLaw.content2')}</p>
              <p>{t('applicableLaw.content3')}</p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">{t('contact.title')}</h2>
            <div className="bg-gray-50 rounded-lg p-6">
              <p className="text-gray-700 mb-4">{t('contact.content1')}</p>
              <p className="text-gray-700 mb-4">{t('contact.content2')}</p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>{t('contact.phone')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-5 h-5 text-[#00D9FF] mt-0.5 flex-shrink-0" />
                  <span>{t('contact.email')}</span>
                </li>
              </ul>
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
                <li><Link href="/privacy" className="hover:text-[#00D9FF] transition-colors">{t('footerLinks.privacy')}</Link></li>
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
        .prose h4 { margin-top: 1rem; margin-bottom: 0.5rem; }
        .prose p { margin-bottom: 1rem; }
        .prose ul { margin-bottom: 1rem; }
      `}</style>
    </div>
  )
}
