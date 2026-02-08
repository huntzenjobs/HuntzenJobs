'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Briefcase,
  FileText,
  Bot,
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
  { name: 'Salons & Forums', href: '/salons', icon: Calendar, premium: false },
  { name: 'Analyse CV', href: '/cv-analysis', icon: FileText, premium: false },
  { name: 'Assistant', href: '/assistant', icon: Bot, premium: false },
  { name: 'Jobs sauvegardes', href: '/saved-jobs', icon: Bookmark, premium: true },
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
    <div className="flex flex-col h-full">
      {/* Header with Logo */}
      <div className="sidebar-header flex items-center justify-between p-6 border-b border-white/10">
        <Link href="/jobs" className="sidebar-logo flex items-center gap-2.5">
          <span className="logo-text text-white font-bold text-xl tracking-tight">
            HuntZen
          </span>
          <span className="w-2 h-2 rounded-full bg-huntzen-blue"></span>
        </Link>
        <button
          className="lg:hidden text-white/70 hover:text-white p-2"
          onClick={() => setIsMobileMenuOpen(false)}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-5 overflow-y-auto">
        <div className="px-3">
          <span className="nav-section-label block text-white/50 text-[0.7rem] font-semibold tracking-widest px-3 mb-3">
            OUTILS
          </span>

          {navigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const isLocked = item.premium && (!user || isFreePlan)
            const isNavigating = navigatingTo === item.href

            return (
              <Link
                key={item.name}
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
                  'nav-item flex items-center gap-3.5 px-4 py-3.5 mb-1 rounded-xl text-sm font-medium transition-all relative group',
                  isActive
                    ? 'bg-[rgba(37,99,235,0.18)] text-white'
                    : 'text-white/70 hover:bg-[rgba(37,99,235,0.12)] hover:text-white',
                  isLocked && 'opacity-60'
                )}
              >
                {/* Active indicator */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[60%] bg-huntzen-blue rounded-r" />
                )}
                {isNavigating ? (
                  <Loader2 className="w-5 h-5 animate-spin text-huntzen-blue" />
                ) : (
                  <item.icon className={cn(
                    'w-5 h-5 transition-all',
                    isActive ? 'text-huntzen-blue' : 'group-hover:text-huntzen-blue'
                  )} />
                )}
                <span className="nav-label flex-1">{item.name}</span>
                {/* Badge (ex: "50€" pour contact recruteur) */}
                {'badge' in item && item.badge && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold">
                    {item.badge}
                  </span>
                )}
                {isLocked && (
                  <Lock className="w-4 h-4 text-white/40" />
                )}
              </Link>
            )
          })}

          {/* Mon Utilisation button - only show if logged in */}
          {user && (
            <button
              onClick={() => {
                setIsUsageModalOpen(true)
                setIsMobileMenuOpen(false)
              }}
              className="nav-item flex items-center gap-3.5 px-4 py-3.5 mb-1 rounded-xl text-sm font-medium transition-all text-white/70 hover:bg-[rgba(37,99,235,0.12)] hover:text-white w-full"
            >
              <Activity className="w-5 h-5" />
              <span className="nav-label flex-1 text-left">Mon Utilisation</span>
            </button>
          )}
        </div>

        {/* Usage summary for free users - only show if logged in */}
        {user && isFreePlan && (
          <div className="px-4 mt-4">
            <UsageSummary className="p-4 rounded-xl bg-white/5 border border-white/10" />
          </div>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 py-4 border-t border-white/10">
        {isAuthLoading ? (
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <Skeleton className="w-9 h-9 rounded-full bg-white/10" />
            <div className="flex-1">
              <Skeleton className="h-4 w-32 mb-2 bg-white/10" />
              <Skeleton className="h-3 w-40 bg-white/10" />
            </div>
          </div>
        ) : user ? (
          <Link
            href="/profile"
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2 mb-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
              <User className="w-4 h-4 text-white/70 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white truncate group-hover:text-huntzen-blue transition-colors">
                  {user.user_metadata?.full_name || 'Utilisateur'}
                </p>
                {planBadge && (
                  <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-white',
                    planBadge.color
                  )}>
                    {planBadge.icon}
                    {planBadge.label}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50 truncate">
                {user.email}
              </p>
            </div>
          </Link>
        ) : (
          <div className="px-3 py-2 mb-2">
            <p className="text-sm text-white/70 mb-3">
              Connectez-vous pour sauvegarder vos donnees
            </p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-huntzen-blue text-white text-sm font-medium hover:bg-huntzen-blue/90 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                Connexion
              </Link>
              <Link
                href="/signup"
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition-colors"
              >
                S&apos;inscrire
              </Link>
            </div>
          </div>
        )}

        {/* Upgrade button for free users - only show if logged in */}
        {user && isFreePlan && (
          <button
            onClick={() => openPricingModal()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/20"
          >
            <Sparkles className="w-4 h-4" />
            Passer Premium
          </button>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="sidebar-footer px-3 py-3 border-t border-white/10">
        <Link
          href="/pricing"
          className="nav-item nav-item-secondary flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-white/60 hover:bg-[rgba(37,99,235,0.12)] hover:text-white transition-all"
        >
          <Crown className="w-5 h-5" />
          <span className="nav-label">Tarifs</span>
        </Link>

        <Link
          href="#"
          className="nav-item nav-item-secondary flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-white/60 hover:bg-[rgba(37,99,235,0.12)] hover:text-white transition-all"
        >
          <HelpCircle className="w-5 h-5" />
          <span className="nav-label">Aide</span>
        </Link>

        <Link
          href="https://huntzen.co"
          target="_blank"
          className="nav-item nav-item-secondary flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-white/60 hover:bg-[rgba(37,99,235,0.12)] hover:text-white transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="nav-label">Retour a huntzen.co</span>
        </Link>

        {user && (
          <button
            onClick={handleLogout}
            className="nav-item nav-item-secondary flex items-center gap-3.5 px-4 py-3 rounded-xl text-sm font-medium text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all w-full"
          >
            <LogOut className="w-5 h-5" />
            <span className="nav-label">Deconnexion</span>
          </button>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Mobile header */}
      <div className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-[50] h-14 flex items-center justify-between px-4 bg-huntzen-dark">
        <button
          className="hamburger-btn text-white text-xl p-2 hover:text-huntzen-blue transition-colors"
          onClick={() => setIsMobileMenuOpen(true)}
        >
          <Menu className="w-6 h-6" />
        </button>

        <Link href="/jobs" className="mobile-logo flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
            <span className="text-sm font-bold text-white">H</span>
          </div>
        </Link>

        <span className="mobile-tool-name text-white/70 text-sm">
          {navigation.find(n => pathname.startsWith(n.href))?.name || 'HuntZen'}
        </span>
      </div>

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop lg:hidden fixed inset-0 z-[45] bg-black/50 transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          'huntzen-sidebar lg:hidden fixed inset-y-0 left-0 z-[50] w-[280px] bg-sidebar transform transition-transform duration-300 ease-out',
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Desktop sidebar */}
      <aside className="huntzen-sidebar hidden lg:flex lg:flex-col lg:w-[280px] lg:fixed lg:inset-y-0 bg-sidebar">
        <SidebarContent />
      </aside>

      {/* Usage Modal */}
      <UsageModal isOpen={isUsageModalOpen} onClose={() => setIsUsageModalOpen(false)} />
    </>
  )
}
