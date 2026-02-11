'use client'

/**
 * Login Page - Modern Design
 * Email/Password + Google OAuth sign in
 */

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '@/contexts/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, Lock as LockIcon } from 'lucide-react'
import { AuthLayout } from '@/components/auth/auth-layout'

// Separate component that uses useSearchParams (must be wrapped in Suspense)
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, signInWithGoogle, signInWithEmail, error, clearError } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Check for success/error messages in URL
  useEffect(() => {
    const msg = searchParams.get('message')
    const err = searchParams.get('error')

    if (msg) setMessage(msg)
    if (err) setMessage(err)

    // Auto-clear après 5s
    if (msg || err) {
      const timer = setTimeout(() => {
        setMessage(null)
        // Nettoyer URL sans reload
        window.history.replaceState({}, '', window.location.pathname)
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [searchParams])

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true)
      clearError()
      await signInWithGoogle()
    } catch (err) {
      setLoading(false)
    }
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      clearError()
      await signInWithEmail(email, password)

      // Reset form après succès
      setEmail('')
      setPassword('')
    } catch (err) {
      setLoading(false)
    }
  }

  return (
    <AuthLayout type="login">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-gray-900 mb-2"
          >
            Bon retour !
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-gray-600"
          >
            Connectez-vous pour accéder à votre espace
          </motion.p>
        </div>

        {/* Messages */}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Google Sign In */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 border-2 border-gray-200 hover:border-gray-300 shadow-sm h-12"
            size="lg"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="font-medium">Continuer avec Google</span>
              </>
            )}
          </Button>
        </motion.div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-gray-50 text-gray-500 font-medium">Ou avec email</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          onSubmit={handleEmailSignIn}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              Adresse email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="vous@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="pl-10 h-12 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Mot de passe
              </Label>
              <Link
                href="/forgot-password"
                className="text-sm text-[#00D9FF] hover:text-[#00C4EA] font-medium transition-colors"
              >
                Mot de passe oublié ?
              </Link>
            </div>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="pl-10 h-12 border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold shadow-lg shadow-[#00D9FF]/30 transition-all rounded-xl"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Connexion en cours...
              </>
            ) : (
              'Se connecter'
            )}
          </Button>
        </motion.form>

        {/* Sign up link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="text-center text-sm text-gray-600"
        >
          Pas encore de compte ?{' '}
          <Link href="/signup" className="text-[#00D9FF] hover:text-[#00C4EA] font-semibold transition-colors">
            Créer un compte gratuitement
          </Link>
        </motion.p>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-xs text-gray-500 pt-4"
        >
          En continuant, vous acceptez nos{' '}
          <Link href="/terms" className="underline hover:text-gray-700 transition-colors">
            Conditions d'utilisation
          </Link>{' '}
          et notre{' '}
          <Link href="/privacy" className="underline hover:text-gray-700 transition-colors">
            Politique de confidentialité
          </Link>
        </motion.p>
      </div>
    </AuthLayout>
  )
}

// Main page component with Suspense boundary
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-[#00D9FF]" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
