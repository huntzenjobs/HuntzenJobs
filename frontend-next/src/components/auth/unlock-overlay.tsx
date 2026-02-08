'use client'

import { motion } from 'framer-motion'
import { Lock, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface UnlockOverlayProps {
  /** Title of the feature being locked */
  title: string
  /** Description of what this feature does */
  description: string
  /** Features/benefits list */
  features: string[]
  /** Icon to display */
  icon?: React.ReactNode
  /** Custom CTA text */
  ctaText?: string
  /** Redirect path after authentication */
  redirectPath?: string
  /** Position mode: 'fullscreen' covers entire page, 'right-side' only covers right portion */
  position?: 'fullscreen' | 'right-side'
}

export function UnlockOverlay({
  title,
  description,
  features,
  icon,
  ctaText = "Se connecter pour débloquer",
  redirectPath = "/cv-analysis",
  position = 'fullscreen'
}: UnlockOverlayProps) {
  const router = useRouter()

  const handleUnlock = (mode: 'login' | 'signup') => {
    const path = mode === 'login' ? '/login' : '/signup'
    router.push(`${path}?redirectTo=${encodeURIComponent(redirectPath)}`)
  }

  const isRightSide = position === 'right-side'

  return (
    <div className={`unlock-overlay ${isRightSide ? 'unlock-overlay-right' : ''}`}>
      {/* Backdrop with blur and gradient */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="unlock-backdrop"
      >
        {/* Animated gradient orbs - adjusted for right-side mode */}
        <div className={`unlock-orb unlock-orb-1 ${isRightSide ? 'unlock-orb-right' : ''}`} />
        <div className={`unlock-orb unlock-orb-2 ${isRightSide ? 'unlock-orb-right' : ''}`} />
        <div className={`unlock-orb unlock-orb-3 ${isRightSide ? 'unlock-orb-right' : ''}`} />
      </motion.div>

      {/* Main card with glassmorphism */}
      <div className="unlock-container">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            duration: 0.6,
            ease: [0.16, 1, 0.3, 1],
            delay: 0.1
          }}
          className="unlock-card"
        >
          {/* Lock icon with pulse animation */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              duration: 0.5,
              delay: 0.3,
              type: "spring",
              stiffness: 200
            }}
            className="unlock-icon-wrapper"
          >
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 0 0 rgba(59, 130, 246, 0.4)",
                  "0 0 0 20px rgba(59, 130, 246, 0)",
                  "0 0 0 0 rgba(59, 130, 246, 0)"
                ]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1
              }}
              className="unlock-icon-pulse"
            >
              <Lock className="w-8 h-8 text-white" strokeWidth={2.5} />
            </motion.div>
          </motion.div>

          {/* Custom icon or default sparkles */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="unlock-feature-icon"
          >
            {icon || <Sparkles className="w-12 h-12" />}
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="unlock-title"
          >
            {title}
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
            className="unlock-description"
          >
            {description}
          </motion.p>

          {/* Features list */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="unlock-features"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.4,
                  delay: 0.9 + (index * 0.1)
                }}
                className="unlock-feature-item"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span>{feature}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.2 }}
            className="unlock-actions"
          >
            <Button
              onClick={() => handleUnlock('signup')}
              className="unlock-btn unlock-btn-primary group"
              size="lg"
            >
              <span>Créer un compte</span>
              <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>

            <Button
              onClick={() => handleUnlock('login')}
              variant="ghost"
              className="unlock-btn unlock-btn-secondary"
              size="lg"
            >
              J'ai déjà un compte
            </Button>
          </motion.div>

          {/* Decorative badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 1.4 }}
            className="unlock-badge"
          >
            <Sparkles className="w-4 h-4" />
            <span>Accès gratuit pendant 14 jours</span>
          </motion.div>
        </motion.div>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Spectral:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');

        .unlock-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow: hidden;
        }

        .unlock-overlay-right {
          position: absolute;
          inset: auto;
          left: auto;
          right: 0;
          top: 0;
          bottom: 0;
          width: 100%;
          max-width: 650px;
          pointer-events: none;
        }

        .unlock-overlay-right .unlock-backdrop {
          pointer-events: auto;
          background: linear-gradient(
            to left,
            rgba(15, 23, 42, 0.95) 0%,
            rgba(15, 23, 42, 0.85) 50%,
            rgba(15, 23, 42, 0) 100%
          );
        }

        .unlock-overlay-right .unlock-card {
          pointer-events: auto;
          max-width: 500px;
          margin-right: 2rem;
        }

        .unlock-overlay-right .unlock-container {
          padding-right: 2rem;
        }

        .unlock-backdrop {
          position: absolute;
          inset: 0;
          backdrop-filter: blur(24px) saturate(150%);
          -webkit-backdrop-filter: blur(24px) saturate(150%);
          background:
            linear-gradient(
              135deg,
              rgba(15, 23, 42, 0.92) 0%,
              rgba(30, 41, 59, 0.88) 50%,
              rgba(51, 65, 85, 0.85) 100%
            );
        }

        .unlock-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.3;
          animation: float 20s ease-in-out infinite;
        }

        .unlock-orb-1 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, transparent 70%);
          top: -10%;
          left: -10%;
          animation-delay: 0s;
        }

        .unlock-orb-2 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, rgba(147, 51, 234, 0.5) 0%, transparent 70%);
          bottom: -5%;
          right: -5%;
          animation-delay: -7s;
        }

        .unlock-orb-3 {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, rgba(236, 72, 153, 0.4) 0%, transparent 70%);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation-delay: -14s;
        }

        .unlock-orb-right.unlock-orb-1 {
          top: 10%;
          left: auto;
          right: 10%;
        }

        .unlock-orb-right.unlock-orb-2 {
          bottom: 10%;
          left: auto;
          right: -5%;
        }

        .unlock-orb-right.unlock-orb-3 {
          top: 50%;
          left: auto;
          right: 20%;
          transform: translate(0, -50%);
        }

        @keyframes float {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -30px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }

        .unlock-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 2rem;
        }

        .unlock-card {
          position: relative;
          width: 100%;
          max-width: 560px;
          background: rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 32px;
          padding: 3.5rem 2.5rem;
          box-shadow:
            0 20px 60px rgba(0, 0, 0, 0.4),
            0 0 0 1px rgba(255, 255, 255, 0.1) inset,
            0 1px 0 rgba(255, 255, 255, 0.2) inset;
          overflow: hidden;
        }

        .unlock-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(59, 130, 246, 0.8),
            rgba(147, 51, 234, 0.8),
            transparent
          );
          animation: shimmer 3s ease-in-out infinite;
        }

        @keyframes shimmer {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }

        .unlock-icon-wrapper {
          display: flex;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .unlock-icon-pulse {
          width: 72px;
          height: 72px;
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(59, 130, 246, 0.4);
        }

        .unlock-feature-icon {
          display: flex;
          justify-content: center;
          margin-bottom: 2rem;
          color: #fbbf24;
          filter: drop-shadow(0 0 20px rgba(251, 191, 36, 0.5));
        }

        .unlock-title {
          font-family: 'Spectral', serif;
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.2;
          text-align: center;
          margin-bottom: 1rem;
          background: linear-gradient(
            135deg,
            #ffffff 0%,
            #e0e7ff 50%,
            #c7d2fe 100%
          );
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .unlock-description {
          font-family: 'DM Sans', sans-serif;
          font-size: 1.125rem;
          line-height: 1.7;
          text-align: center;
          color: rgba(255, 255, 255, 0.85);
          margin-bottom: 2.5rem;
          max-width: 420px;
          margin-left: auto;
          margin-right: auto;
        }

        .unlock-features {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2.5rem;
          padding: 0 1rem;
        }

        .unlock-feature-item {
          display: flex;
          align-items: center;
          gap: 0.875rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 500;
        }

        .unlock-actions {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .unlock-btn {
          font-family: 'DM Sans', sans-serif;
          font-weight: 600;
          width: 100%;
          font-size: 1.0625rem;
          border-radius: 14px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .unlock-btn-primary {
          background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
          border: none;
          color: white;
          height: 56px;
          box-shadow:
            0 4px 14px rgba(59, 130, 246, 0.4),
            0 1px 0 rgba(255, 255, 255, 0.2) inset;
          position: relative;
          overflow: hidden;
        }

        .unlock-btn-primary::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .unlock-btn-primary:hover::before {
          opacity: 1;
        }

        .unlock-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow:
            0 8px 24px rgba(59, 130, 246, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.3) inset;
        }

        .unlock-btn-primary:active {
          transform: translateY(0);
        }

        .unlock-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: rgba(255, 255, 255, 0.95);
          height: 52px;
          backdrop-filter: blur(10px);
        }

        .unlock-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
          color: white;
        }

        .unlock-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          font-weight: 600;
          color: #fbbf24;
          background: rgba(251, 191, 36, 0.1);
          border: 1px solid rgba(251, 191, 36, 0.3);
          border-radius: 9999px;
          padding: 0.625rem 1.25rem;
          width: fit-content;
          margin: 0 auto;
        }

        @media (max-width: 1024px) {
          .unlock-overlay-right {
            max-width: 100%;
            position: fixed;
            left: 0;
          }

          .unlock-overlay-right .unlock-backdrop {
            background: linear-gradient(
              135deg,
              rgba(15, 23, 42, 0.92) 0%,
              rgba(30, 41, 59, 0.88) 50%,
              rgba(51, 65, 85, 0.85) 100%
            );
          }

          .unlock-overlay-right .unlock-card {
            margin-right: auto;
            margin-left: auto;
          }
        }

        @media (max-width: 640px) {
          .unlock-card {
            padding: 2.5rem 1.75rem;
            border-radius: 24px;
          }

          .unlock-title {
            font-size: 2rem;
          }

          .unlock-description {
            font-size: 1rem;
          }

          .unlock-icon-pulse {
            width: 64px;
            height: 64px;
          }

          .unlock-icon-pulse svg {
            width: 1.75rem;
            height: 1.75rem;
          }
        }
      `}</style>
    </div>
  )
}
