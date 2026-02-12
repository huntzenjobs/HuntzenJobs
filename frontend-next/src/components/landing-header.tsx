'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useOptionalAuth } from '@/contexts/auth-context'
import { Menu, X, User } from 'lucide-react'

export function LandingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const auth = useOptionalAuth()
  const user = auth?.user

  // Detect scroll to change header style
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <motion.header
      initial={{ backgroundColor: 'rgba(0, 0, 0, 0.05)' }}
      animate={{
        backgroundColor: isScrolled ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.05)',
        borderColor: isScrolled ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)',
      }}
      transition={{ duration: 0.3 }}
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md border-b"
    >
      <div className="container mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <div className="relative w-10 h-10 sm:w-12 sm:h-12">
            <Image
              src="/logo.png"
              alt="HuntZen"
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex items-center gap-1">
            <span className={`font-black text-xl sm:text-2xl tracking-tight transition-colors ${isScrolled ? 'text-black' : 'text-white'}`}>
              Jobs
            </span>
            <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse"></span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-8">
          <Link href="/jobs" className={`relative text-base font-bold transition-colors pb-1 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}>
            Recherche d&apos;emploi
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="/cv-analysis" className={`relative text-base font-bold transition-colors pb-1 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}>
            Analyse CV
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="/assistant" className={`relative text-base font-bold transition-colors pb-1 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}>
            Assistant Carrière
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="/salons" className={`relative text-base font-bold transition-colors pb-1 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}>
            Salons & Forums
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
          <Link href="/pricing" className={`relative text-base font-bold transition-colors pb-1 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}>
            Tarifs
            <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
          </Link>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-2 sm:gap-3">
          {user ? (
            <Link href="/jobs">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${isScrolled ? 'bg-gray-100 hover:bg-gray-200' : 'bg-white/10 hover:bg-white/20'}`}>
                <div className="w-7 h-7 rounded-full bg-[#00D9FF]/20 flex items-center justify-center">
                  <User className="w-4 h-4 text-[#00D9FF]" />
                </div>
                <span className={`text-sm font-medium hidden md:inline ${isScrolled ? 'text-black' : 'text-white'}`}>
                  {user.user_metadata?.full_name || user.email?.split('@')[0]}
                </span>
              </div>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className={`hidden md:inline-flex items-center px-4 lg:px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${isScrolled ? 'text-gray-700 hover:text-[#00D9FF]' : 'text-white hover:text-[#00D9FF]'}`}
              >
                CONNEXION
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-bold text-white bg-[#00D9FF] hover:bg-[#00C4EA] transition-all shadow-lg hover:shadow-[#00D9FF]/50"
              >
                S&apos;INSCRIRE
              </Link>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`lg:hidden p-2 transition-colors ${isScrolled ? 'text-black' : 'text-white'}`}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`lg:hidden absolute top-20 left-0 right-0 backdrop-blur-md border-b ${isScrolled ? 'bg-white/95 border-gray-200' : 'bg-black/95 border-white/10'}`}
        >
          <nav className="container mx-auto px-6 py-4 flex flex-col gap-4">
            <Link
              href="/jobs"
              onClick={() => setMobileMenuOpen(false)}
              className={`relative text-base font-bold transition-colors py-2 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}
            >
              Recherche d&apos;emploi
              <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
            </Link>
            <Link
              href="/cv-analysis"
              onClick={() => setMobileMenuOpen(false)}
              className={`relative text-base font-bold transition-colors py-2 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}
            >
              Analyse CV
              <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
            </Link>
            <Link
              href="/assistant"
              onClick={() => setMobileMenuOpen(false)}
              className={`relative text-base font-bold transition-colors py-2 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}
            >
              Assistant Carrière
              <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
            </Link>
            <Link
              href="/salons"
              onClick={() => setMobileMenuOpen(false)}
              className={`relative text-base font-bold transition-colors py-2 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}
            >
              Salons & Forums
              <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className={`relative text-base font-bold transition-colors py-2 group ${isScrolled ? 'text-gray-700 hover:text-black' : 'text-white/90 hover:text-white'}`}
            >
              Tarifs
              <span className="absolute bottom-0 left-0 w-0 h-1 bg-[#00D9FF] transition-all duration-300 group-hover:w-full"></span>
            </Link>
          </nav>
        </motion.div>
      )}
    </motion.header>
  )
}
