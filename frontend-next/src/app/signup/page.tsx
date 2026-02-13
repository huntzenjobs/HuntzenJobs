"use client";

/**
 * Signup Page - Modern Design
 * Email/Password + Google OAuth registration
 */

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  CheckCircle2,
  User,
  Mail,
  Lock as LockIcon,
  X,
} from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, signInWithGoogle, signUpWithEmail, error, clearError } =
    useAuth();

  // Detect CV analysis redirect
  const redirectTo = searchParams.get("redirectTo");
  const message = searchParams.get("message");
  const showCVMessage =
    redirectTo === "/cv-analysis" || message === "auth_required";

  // Detect success state
  const success = searchParams.get("success");
  const emailFromUrl = searchParams.get("email");
  const [showSuccessModal, setShowSuccessModal] = useState(success === "true");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isTimeout, setIsTimeout] = useState(false);

  // Close modal and clean URL
  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    // Clean URL without reload
    window.history.replaceState({}, "", "/signup");
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      clearError();
      await signInWithGoogle();
    } catch (err) {
      setLoading(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate password match
    if (password !== confirmPassword) {
      setPasswordError("Les mots de passe ne correspondent pas");
      return;
    }

    // Validate password strength
    if (password.length < 6) {
      setPasswordError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    try {
      setLoading(true);
      setPasswordError("");
      setIsTimeout(false);
      clearError();

      await signUpWithEmail(email, password, fullName);

      // Reset form après succès
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("[SIGNUP] Error:", err);

      // Détecter timeout pour afficher message spécifique
      if (err.message?.includes("prend trop de temps") || err.message?.includes("timeout")) {
        setIsTimeout(true);
      }
    } finally {
      // ⚠️ CRITIQUE: Toujours arrêter le loading, même en cas d'erreur
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={closeSuccessModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ duration: 0.3 }}
              className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={closeSuccessModal}
                className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>

              {/* Success icon */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-600" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-center text-gray-900 mb-4">
                Inscription réussie ! 🎉
              </h2>

              {/* Message */}
              <div className="space-y-4 mb-6">
                <p className="text-center text-gray-700 leading-relaxed">
                  Nous venons d'envoyer un email de confirmation à :
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-center font-semibold text-blue-900 break-all">
                    {emailFromUrl || email}
                  </p>
                </div>
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                  <p className="text-sm text-gray-700">
                    <strong>Vérifiez votre boîte mail</strong> (et vos spams)
                    pour confirmer votre adresse email avant de vous connecter.
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-3">
                <Link href="/login" className="block">
                  <Button className="w-full bg-[#00D9FF] hover:bg-[#00C4EA] text-white h-12 rounded-xl font-semibold">
                    Aller à la connexion
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  onClick={closeSuccessModal}
                  className="w-full h-12 rounded-xl border-2"
                >
                  Fermer
                </Button>
              </div>

              {/* Help text */}
              <p className="text-xs text-center text-gray-500 mt-4">
                Vous n'avez pas reçu l'email ? Attendez quelques minutes ou
                vérifiez vos spams.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-8">
        {/* Header */}
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-3xl font-bold text-gray-900 mb-2"
          >
            Créer votre compte
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-gray-600"
          >
            {showCVMessage
              ? "Commencez votre analyse CV gratuitement"
              : "Rejoignez HuntZen et boostez votre carrière"}
          </motion.p>
        </div>

        {/* CV Analysis Specific Banner */}
        {showCVMessage && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5"
          >
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-xl">🎯</span>
              Offre de bienvenue :
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>
                  <strong>1 analyse CV gratuite</strong> par jour
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Score ATS détaillé</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Matching emploi</strong>
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span>
                  <strong>Historique</strong> complet
                </span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Error Messages */}
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

        {passwordError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert variant="destructive">
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Timeout Warning */}
        {isTimeout && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Alert variant="destructive" className="border-orange-200 bg-orange-50">
              <AlertCircle className="h-4 w-4 text-orange-600" />
              <AlertDescription className="text-orange-800">
                <strong>Connexion lente détectée</strong>
                <br />
                La requête a pris trop de temps. Vérifiez votre connexion internet et réessayez dans quelques instants.
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Google Sign Up */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
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
                <span className="font-medium">S'inscrire avec Google</span>
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
            <span className="px-4 bg-white text-gray-500 font-medium">
              Ou avec email
            </span>
          </div>
        </div>

        {/* Email/Password Form */}
        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          onSubmit={handleEmailSignUp}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label
              htmlFor="fullName"
              className="text-sm font-medium text-gray-700"
            >
              Nom complet
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="fullName"
                type="text"
                placeholder="Jean Dupont"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={loading}
                className="pl-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="email"
              className="text-sm font-medium text-gray-700"
            >
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
                className="pl-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="password"
              className="text-sm font-medium text-gray-700"
            >
              Mot de passe
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="Minimum 6 caractères"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                className="pl-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-gray-700"
            >
              Confirmer le mot de passe
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Retapez votre mot de passe"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                className="pl-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold shadow-lg shadow-[#00D9FF]/30 transition-all mt-6 rounded-xl"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Création en cours...
              </>
            ) : (
              "Créer mon compte gratuitement"
            )}
          </Button>
        </motion.form>

        {/* Login link */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="text-center text-sm text-gray-600"
        >
          Vous avez déjà un compte ?{" "}
          <Link
            href="/login"
            className="text-[#00D9FF] hover:text-[#00C4EA] font-semibold transition-colors"
          >
            Se connecter
          </Link>
        </motion.p>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="text-center text-xs text-gray-500 pt-4"
        >
          En créant un compte, vous acceptez nos{" "}
          <Link
            href="/terms"
            className="underline hover:text-gray-700 transition-colors"
          >
            Conditions d'utilisation
          </Link>{" "}
          et notre{" "}
          <Link
            href="/privacy"
            className="underline hover:text-gray-700 transition-colors"
          >
            Politique de confidentialité
          </Link>
        </motion.p>
      </div>
    </AuthLayout>
  );
}

// Main page component with Suspense boundary
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <Loader2 className="w-8 h-8 animate-spin text-[#00D9FF]" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
