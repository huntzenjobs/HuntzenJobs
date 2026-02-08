'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export function NavigationLoader() {
  const [isNavigating, setIsNavigating] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setIsNavigating(false)
  }, [pathname])

  // Écouteur global pour router.push
  useEffect(() => {
    const handleStart = () => setIsNavigating(true)
    const handleComplete = () => setIsNavigating(false)

    window.addEventListener('beforeunload', handleStart)

    return () => {
      window.removeEventListener('beforeunload', handleStart)
    }
  }, [])

  if (!isNavigating) return null

  return (
    <motion.div
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      className="fixed top-0 left-0 right-0 h-1 bg-huntzen-blue origin-left z-[100]"
      transition={{ duration: 0.4, ease: "easeOut" }}
    />
  )
}
