'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Briefcase,
  FileText,
  MessageSquare,
  Bookmark,
  HelpCircle,
  ArrowLeft,
  User,
  LogOut,
  Menu,
  X,
  Lock,
  Sparkles,
  Crown,
  LogIn,
  Calendar,
  Activity,
  Users,
  Loader2
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useOptionalSubscription } from '@/contexts/subscription-context'
import { useOptionalAuth } from '@/contexts/auth-context'
import { UsageSummary } from '@/components/freemium/usage-counter'
import { UsageModal } from '@/components/freemium/usage-modal'

const navigation = [
  { name: 'Recherche d\'emplois', href: '/jobs', icon: Briefcase, premium: false },
  { name: 'Analyse CV', href: '/cv-analysis', icon: FileText, premium: false },
  { name: 'Assistant Carrière', href: '/assistant', icon: MessageSquare, premium: false },
  { name: 'Salons & Forums', href: '/salons', icon: Calendar, premium: false },
  { name: 'Jobs sauvegardés', href: '/saved-jobs', icon: Bookmark, premium: true },
  { name: 'Contact Recruteur', href: '/recruiter-contact', icon: Users, premium: false, badge: '50€' },
]

interface SidebarProps {
  className?: string
}

const PLAN_BADGES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  free: { label: 'Gratuit', color: 'bg-gray-500', icon: null },
  starter: { label: 'Starter', color: 'bg-blue-500', icon: <Sparkles className="w-3 h-3" /> },
  pro: { label: 'Pro', color: 'bg-violet-500', icon: <Sparkles className="w-3 h-3" /> },
  premium: { label: 'Premium', color: 'bg-amber-500', icon: <Crown className="w-3 h-3" /> },
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUsageModalOpen, setIsUsageModalOpen] = useState(false)
  const [navigatingTo, setNavigatingTo] = useState<string | null>(null)

  // Use auth context as single source of truth
  const auth = useOptionalAuth()
  const isAuthLoading = auth?.loading ?? true
  const user = auth?.user ?? null

  // Use subscription context - with fallback for when context is not available
  const subscription = useOptionalSubscription()
  const plan = subscription?.plan || 'free'
  const isFreePlan = subscription?.isFreePlan ?? true
  const openPricingModal = subscription?.openPricingModal || (() => {})

  const planBadge = PLAN_BADGES[plan]

  const handleLogout = async () => {
    try {
      // Use the Auth context signOut which handles logging and state management
      if (auth?.signOut) {
        await auth.signOut()
      } else {
        // Fallback if context not available
        const supabase = createClient()
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
      }
    } catch (error) {
      console.error('Logout error:', error)
      // Still redirect on error
      router.push('/login')
      router.refresh()
    }
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white">
      {/* Header with Logo */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="sidebar-header flex items-center justify-between p-6 border-b border-gray-200"
      >
        <Link href="/jobs" className="sidebar-logo flex items-center gap-2.5 group">
          <span className="logo-text text-black font-bold text-2xl tracking-tight group-hover:text-[#00D9FF] transition-colors">
            HuntZen
          </span>
          <motion.span
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 rounded-full bg-[#00D9FF]"
          ></motion.span>
        </Link>
        <button
          className="lg:hidden text-gray-600 hover:text-black p-2 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </motion.div>

      {/* Navigation */}
      <nav className="flex-1 py-6 overflow-y-auto">
        <div className="px-4">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="nav-section-label block text-gray-500 text-[0.65rem] font-bold tracking-widest px-3 mb-4"
          >
            NAVIGATION
          </motion.span>

          {navigation.map((item, index) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const isLocked = item.premium && (!user || isFreePlan)
            const isNavigating = navigatingTo === item.href

            return (
              <motion.div
                key={item.name}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link
                  href={isLocked ? (user ? '#' : '/login') : item.href}
                  onClick={(e) => {
                    if (isLocked && user) {
                      e.preventDefault()
                      openPricingModal()
                    } else if (!isLocked) {
                      setNavigatingTo(item.href)
                    }
                    setIsMobileMenuOpen(false)
                  }}
                  className={cn(
                    'nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all relative group',
                    isActive
                      ? 'bg-[#00D9FF]/10 text-black'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-black',
                    isLocked && 'opacity-50'
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <motion.span
                      layoutId="activeTab"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-[70%] bg-[#00D9FF] rounded-r"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  {isNavigating ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#00D9FF]" />
                  ) : (
                    <item.icon className={cn(
                      'w-5 h-5 transition-all',
                      isActive ? 'text-[#00D9FF]' : 'text-gray-600 group-hover:text-[#00D9FF]'
                    )} />
                  )}
                  <span className="nav-label flex-1">{item.name}</span>
                  {/* Badge (ex: "50€" pour contact recruteur) */}
                  {'badge' in item && item.badge && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-semibold border border-emerald-200">
                      {item.badge}
                    </span>
                  )}
                  {isLocked && (
                    <Lock className="w-4 h-4 text-gray-400" />
                  )}
                </Link>
              </motion.div>
            )
          })}

          {/* Mon Utilisation button - only show if logged in */}
          {user && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: navigation.length * 0.05 }}
              onClick={() => {
                setIsUsageModalOpen(true)
                setIsMobileMenuOpen(false)
              }}
              className="nav-item flex items-center gap-3 px-4 py-3 mb-1 rounded-xl text-sm font-medium transition-all text-gray-700 hover:bg-gray-100 hover:text-black w-full group"
            >
              <Activity className="w-5 h-5 text-gray-600 group-hover:text-[#00D9FF] transition-colors" />
              <span className="nav-label flex-1 text-left">Mon Utilisation</span>
            </motion.button>
          )}
        </div>

        {/* Usage summary for free users - only show if logged in */}
        {user && isFreePlan && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-4 mt-6"
          >
            <UsageSummary className="p-4 rounded-xl bg-gray-50 border border-gray-200" />
          </motion.div>
        )}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-gray-200">
        {isAuthLoading ? (
          <div className="flex items-center gap-3 px-3 py-2 mb-3">
            <Skeleton className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2 bg-gray-200" />
              <Skeleton className="h-3 w-40 bg-gray-200" />
            </div>
          </div>
        ) : user ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Link
              href="/profile"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 mb-3 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-[#00D9FF]/10 transition-colors border border-gray-200">
                <User className="w-5 h-5 text-gray-600 group-hover:text-[#00D9FF] transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-black truncate group-hover:text-[#00D9FF] transition-colors">
                    {user.user_metadata?.full_name || 'Utilisateur'}
                  </p>
                  {subscription === null ? (
                    <span className="bg-gray-200 animate-pulse rounded-full px-2 py-0.5 w-14 h-4" />
                  ) : planBadge ? (
                    <span className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white',
                      planBadge.color
                    )}>
                      {planBadge.icon}
                      {planBadge.label}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </Link>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-3 py-2 mb-3"
          >
            <p className="text-sm text-gray-600 mb-3">
              Connectez-vous pour sauvegarder vos données
            </p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-[#00D9FF] text-white text-sm font-semibold hover:bg-[#00C4EA] transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Connexion
              </Link>
              <Link
                href="/signup"
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gray-100 text-black text-sm font-semibold hover:bg-gray-200 transition-colors border border-gray-200"
              >
                S&apos;inscrire
              </Link>
            </div>
          </motion.div>
        )}

        {/* Upgrade button for free users - only show if logged in */}
        {user && isFreePlan && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openPricingModal()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-[#00D9FF] to-[#00C4EA] text-white text-sm font-bold hover:shadow-lg hover:shadow-[#00D9FF]/30 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            Passer Premium
          </motion.button>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="sidebar-footer px-4 py-3 border-t border-gray-200">
        <Link
          href="/pricing"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black transition-all group"
        >
          <Crown className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">Tarifs</span>
        </Link>

        <Link
          href="mailto:contact@huntzenjobs.co"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black transition-all group"
        >
          <HelpCircle className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">Aide</span>
        </Link>

        <Link
          href="https://huntzen.co"
          target="_blank"
          rel="noopener noreferrer"
          className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-black transition-all group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:text-[#00D9FF] transition-colors" />
          <span className="nav-label">Retour à huntzen.co</span>
        </Link>

        {user && (
          <button
            onClick={handleLogout}
            className="nav-item nav-item-secondary flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all w-full group"
          >
            <LogOut className="w-4 h-4 group-hover:text-red-600 transition-colors" />
            <span className="nav-label">Déconnexion</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-[50] h-14 flex items-center justify-between px-4 bg-white border-b border-gray-200 shadow-sm">
        <button
          className="hamburger-btn text-black p-2 hover:text-[#00D9FF] transition-colors rounded-lg hover:bg-gray-100"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </button>

        <Link href="/jobs" className="mobile-logo flex items-center gap-2 group">
          <span className="text-lg font-bold text-black group-hover:text-[#00D9FF] transition-colors">HuntZen</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#00D9FF]"></span>
        </Link>

        <span className="mobile-tool-name text-gray-600 text-sm font-medium">
          {navigation.find(n => pathname.startsWith(n.href))?.name || 'HuntZen'}
        </span>
      </div>

      {/* Mobile backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="sidebar-backdrop lg:hidden fixed inset-0 z-[45] bg-black/50"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile sidebar */}
      <motion.aside
        initial={{ x: -280 }}
        animate={{ x: isMobileMenuOpen ? 0 : -280 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="huntzen-sidebar lg:hidden fixed inset-y-0 left-0 z-[50] w-[280px] bg-white shadow-2xl"
      >
        <SidebarContent />
      </motion.aside>

      {/* Desktop sidebar */}
      <aside className="huntzen-sidebar hidden lg:flex lg:flex-col lg:w-[280px] lg:fixed lg:inset-y-0 bg-white border-r border-gray-200">
        <SidebarContent />
      </aside>

      {/* Usage Modal */}
      <UsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} />
    </>
  )
}
