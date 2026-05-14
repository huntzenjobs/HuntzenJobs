# Auth — Forgot Password + Signup Confirmation Flow Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Fix two auth bugs: missing forgot-password flow (→ 404) and signup success modal never shown after email registration.

**Architecture:** Next.js App Router + Supabase SSR. Two new pages (`/forgot-password`, `/reset-password`), updates to auth-context (new functions), `/auth/callback/route.ts` (handle `type=recovery`), signup page (resend email button), and fr.json i18n keys (synced to en/es/pt via DeepL).

**Tech Stack:** Next.js 14 App Router, Supabase JS v2 (`@supabase/ssr`), next-intl, Tailwind CSS, shadcn/ui, framer-motion

**Branch:** `fix/87-auth-forgot-password-signup-flow`

---

## Context

### Key files
- `frontend-next/src/contexts/auth-context.tsx` — auth state, signUpWithEmail, signIn, signOut
- `frontend-next/src/app/auth/callback/route.ts` — handles OAuth + email confirmation redirect
- `frontend-next/src/app/signup/page.tsx` — has success modal triggered by `?success=true`
- `frontend-next/src/app/login/page.tsx:217` — has broken `<Link href="/forgot-password">`
- `frontend-next/src/middleware.ts:128` — redirects `/login` and `/signup` to `/jobs` if user is authenticated
- `frontend-next/messages/fr.json` — i18n source of truth

### Root causes found
1. **404 on /forgot-password**: Page doesn't exist. Auth-context has no `resetPasswordForEmail`. `/auth/callback` doesn't handle `type=recovery`. No `/reset-password` page.
2. **Signup modal never shown**: `signUpWithEmail()` always redirects to `/signup?success=true`. If Supabase email confirm is OFF, session is created immediately → middleware sees authenticated user on `/signup` → redirects to `/jobs`. User never sees the confirmation modal.

### Supabase client patterns
- **Client-side**: `import { createClient } from "@/lib/supabase/client"` → `const supabase = createClient()`
- **Server-side (Route Handler)**: `import { createClient } from "@/lib/supabase/server"` → `const supabase = await createClient()`
- **Resend confirmation**: `supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: ... } })`
- **Reset password**: `supabase.auth.resetPasswordForEmail(email, { redirectTo: ... })`
- **Update password**: `supabase.auth.updateUser({ password: newPassword })`

### i18n pattern
- All text strings go in `frontend-next/messages/fr.json` (source of truth)
- Use `const t = useTranslations("namespace")` in components
- After adding to fr.json, run: `cd frontend-next && npm run sync-translations` (syncs en/es/pt via DeepL)

---

## Task 1 — Add i18n keys to fr.json

**Files:**
- Modify: `frontend-next/messages/fr.json`

**What to add:**

In `auth.signup.success` (existing namespace), add 2 new keys after `"noEmail"`:
```json
"resendButton": "Renvoyer l'email de confirmation",
"resendSuccess": "Email renvoyé ! Vérifiez votre boîte mail."
```

After `auth.signup` and before `auth.errors`, add two new namespaces:
```json
"forgotPassword": {
  "title": "Mot de passe oublié",
  "subtitle": "Saisissez votre adresse email et nous vous enverrons un lien de réinitialisation.",
  "emailLabel": "Adresse email",
  "emailPlaceholder": "vous@example.com",
  "submitButton": "Envoyer le lien",
  "loading": "Envoi en cours...",
  "successTitle": "Email envoyé !",
  "successMessage": "Si un compte existe avec cette adresse, vous recevrez un email de réinitialisation dans quelques minutes. Vérifiez vos spams.",
  "backToLogin": "Retour à la connexion"
},
"resetPassword": {
  "title": "Nouveau mot de passe",
  "subtitle": "Choisissez un mot de passe sécurisé pour votre compte.",
  "passwordLabel": "Nouveau mot de passe",
  "passwordPlaceholder": "Minimum 6 caractères",
  "confirmLabel": "Confirmer le mot de passe",
  "confirmPlaceholder": "Retapez votre mot de passe",
  "submitButton": "Mettre à jour le mot de passe",
  "loading": "Mise à jour...",
  "successMessage": "Mot de passe mis à jour avec succès !",
  "mismatchError": "Les mots de passe ne correspondent pas",
  "tooShortError": "Le mot de passe doit contenir au moins 6 caractères",
  "expiredError": "Le lien de réinitialisation a expiré. Veuillez recommencer.",
  "showPassword": "Afficher le mot de passe",
  "hidePassword": "Masquer le mot de passe"
}
```

**Steps:**

1. Open `frontend-next/messages/fr.json`
2. Find `"success"` block inside `auth.signup` (around line with `"noEmail"`)
3. Add the 2 resend keys after `"noEmail"`
4. Find the position after `auth.signup` block closes and before `auth.errors`
5. Insert the `forgotPassword` and `resetPassword` namespaces
6. Validate JSON is valid: `cd frontend-next && node -e "JSON.parse(require('fs').readFileSync('messages/fr.json','utf8')); console.log('JSON valid')"`
7. Sync translations: `cd frontend-next && npm run sync-translations`
8. Commit:
```bash
git add frontend-next/messages/
git commit -m "feat(i18n): add forgot-password and reset-password auth translations"
```

---

## Task 2 — Update auth-context: add resetPasswordForEmail + resendConfirmationEmail + fix signUpWithEmail

**Files:**
- Modify: `frontend-next/src/contexts/auth-context.tsx`

**Step 1: Update AuthContextType interface**

Find the interface definition (around line 32) and add 2 new function signatures:
```typescript
resetPasswordForEmail: (email: string) => Promise<void>;
resendConfirmationEmail: (email: string) => Promise<void>;
```

**Step 2: Fix signUpWithEmail to handle both cases**

Find the `signUpWithEmail` function. After `if (error) throw error;` and before `setLoading(false)`, replace the redirect logic:

**Current code (find this):**
```typescript
      // Show success message
      setError(null);

      // Reset loading AVANT la redirection
      setLoading(false);

      // Redirect to signup success (will show modal)
      router.push("/signup?success=true&email=" + encodeURIComponent(email));
```

**Replace with:**
```typescript
      setError(null);
      setLoading(false);

      // If session exists, email confirmation is disabled → user is already logged in
      // If session is null, email confirmation is required → show success modal
      if (data?.session) {
        router.push("/jobs");
      } else {
        router.push("/signup?success=true&email=" + encodeURIComponent(email));
      }
```

**Step 3: Add resetPasswordForEmail function**

Add this function after `signUpWithEmail` closes (before `signOut`):
```typescript
  const resetPasswordForEmail = async (email: string) => {
    try {
      setError(null);
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) throw error;
    } catch (err: any) {
      devError("Reset password error:", err);
      setError(err.message || "Failed to send reset email");
      throw err;
    }
  };
```

**Step 4: Add resendConfirmationEmail function**

Add this function after `resetPasswordForEmail`:
```typescript
  const resendConfirmationEmail = async (email: string) => {
    try {
      setError(null);
      const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      devError("Resend confirmation error:", err);
      setError(err.message || "Failed to resend confirmation email");
      throw err;
    }
  };
```

**Step 5: Expose new functions in the context value**

Find the `return` statement that returns the `AuthContext.Provider`. Add the two new functions to the `value` prop:
```typescript
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        resetPasswordForEmail,   // ADD
        resendConfirmationEmail,  // ADD
        error,
        clearError,
      }}
```

**Step 6: Verify TypeScript**

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or only pre-existing unrelated errors).

**Step 7: Commit**
```bash
git add frontend-next/src/contexts/auth-context.tsx
git commit -m "fix(auth): add resetPasswordForEmail + resendConfirmationEmail, fix signUpWithEmail session check"
```

---

## Task 3 — Update /auth/callback to handle type=recovery

**Files:**
- Modify: `frontend-next/src/app/auth/callback/route.ts`

**Current code** (lines 35-63 — the `if (code)` block):
```typescript
  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      // ...logs...
      const finalRedirect = redirectTo && redirectTo.startsWith('/')
        ? redirectTo
        : '/jobs'

      const response = NextResponse.redirect(`${origin}${finalRedirect}`)
      response.cookies.delete('huntzen_redirect_after_auth')
      return response
    }
    // ...error handling...
  }
```

**What to change:** Read the `type` query param. If `type=recovery`, redirect to `/reset-password` instead of `/jobs`.

**Replace the `if (code)` block with:**
```typescript
  if (code) {
    const supabase = await createClient()
    const type = requestUrl.searchParams.get('type')

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      await logSecurityEvent({
        eventType: 'auth.oauth_callback_success',
        severity: 'info',
        userId: data.user.id,
        metadata: {
          email: data.user.email,
          provider: data.user.app_metadata?.provider,
          type: type || 'oauth',
        }
      })

      // Password reset flow: redirect to reset-password page
      if (type === 'recovery') {
        return NextResponse.redirect(`${origin}/reset-password`)
      }

      // OAuth / email confirmation flow: redirect to final destination
      const finalRedirect = redirectTo && redirectTo.startsWith('/')
        ? redirectTo
        : '/jobs'

      const response = NextResponse.redirect(`${origin}${finalRedirect}`)
      response.cookies.delete('huntzen_redirect_after_auth')
      return response
    }

    await logSecurityEvent({
      eventType: 'auth.session_exchange_failed',
      severity: 'critical',
      metadata: { error: error?.message }
    })

    return NextResponse.redirect(
      `${origin}/login?error=Authentication failed. Please try again.`
    )
  }
```

**Verify:** `cd frontend-next && npx tsc --noEmit 2>&1 | head -20`

**Commit:**
```bash
git add frontend-next/src/app/auth/callback/route.ts
git commit -m "fix(auth): handle type=recovery in callback, redirect to /reset-password"
```

---

## Task 4 — Create /forgot-password page

**Files:**
- Create: `frontend-next/src/app/forgot-password/page.tsx`

**Full file content:**
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Mail, CheckCircle2, ArrowLeft } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const t = useTranslations("auth.forgotPassword");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await resetPasswordForEmail(email);
      setSuccess(true);
    } catch (err: any) {
      // Always show success to prevent email enumeration attacks
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 text-center"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{t("successTitle")}</h1>
          <p className="text-gray-600 leading-relaxed">{t("successMessage")}</p>
          <Link href="/login">
            <Button className="w-full h-12 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl">
              {t("backToLogin")}
            </Button>
          </Link>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {t("backToLogin")}
          </Link>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-gray-900 mb-2"
          >
            {t("title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-600"
          >
            {t("subtitle")}
          </motion.p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium text-gray-700">
              {t("emailLabel")}
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                {t("loading")}
              </>
            ) : (
              t("submitButton")
            )}
          </Button>
        </motion.form>
      </div>
    </AuthLayout>
  );
}
```

**Verify TypeScript:** `cd frontend-next && npx tsc --noEmit 2>&1 | head -20`

**Commit:**
```bash
git add frontend-next/src/app/forgot-password/page.tsx
git commit -m "feat(auth): create /forgot-password page with reset email flow"
```

---

## Task 5 — Create /reset-password page

**Files:**
- Create: `frontend-next/src/app/reset-password/page.tsx`

**Context:** User arrives here from `/auth/callback?type=recovery` after clicking the password reset link in email. At this point, Supabase has exchanged the code and the user has an active session (temporary, for password reset only).

**Full file content:**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Lock as LockIcon, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { useTranslations } from "next-intl";

export default function ResetPasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth.resetPassword");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("mismatchError"));
      return;
    }

    if (password.length < 6) {
      setError(t("tooShortError"));
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        if (updateError.message.toLowerCase().includes("expired") ||
            updateError.message.toLowerCase().includes("invalid")) {
          setError(t("expiredError"));
        } else {
          setError(updateError.message);
        }
        return;
      }

      setSuccess(true);
      // Auto-redirect to login after 2s
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6 text-center"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <p className="text-lg font-semibold text-gray-900">{t("successMessage")}</p>
          <Link href="/login">
            <Button className="w-full h-12 bg-[#00D9FF] hover:bg-[#00C4EA] text-white font-bold rounded-xl">
              Se connecter
            </Button>
          </Link>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="space-y-8">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-gray-900 mb-2"
          >
            {t("title")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-gray-600"
          >
            {t("subtitle")}
          </motion.p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium text-gray-700">
              {t("passwordLabel")}
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                className="pl-10 pr-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showPassword ? t("hidePassword") : t("showPassword")}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              {t("confirmLabel")}
            </Label>
            <div className="relative">
              <LockIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showConfirm ? "text" : "password"}
                placeholder={t("confirmPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                className="pl-10 pr-10 h-12 bg-white border-gray-300 focus:border-[#00D9FF] focus:ring-[#00D9FF]"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label={showConfirm ? t("hidePassword") : t("showPassword")}
              >
                {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
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
                {t("loading")}
              </>
            ) : (
              t("submitButton")
            )}
          </Button>
        </motion.form>
      </div>
    </AuthLayout>
  );
}
```

**Verify TypeScript:** `cd frontend-next && npx tsc --noEmit 2>&1 | head -20`

**Commit:**
```bash
git add frontend-next/src/app/reset-password/page.tsx
git commit -m "feat(auth): create /reset-password page for password reset flow"
```

---

## Task 6 — Add "Resend email" button to signup success modal

**Files:**
- Modify: `frontend-next/src/app/signup/page.tsx`

**Step 1: Import resendConfirmationEmail from auth context**

Find line 34:
```tsx
const { user, signInWithGoogle, signUpWithEmail, error, clearError } =
    useAuth();
```

Replace with:
```tsx
const { user, signInWithGoogle, signUpWithEmail, resendConfirmationEmail, error, clearError } =
    useAuth();
```

**Step 2: Add resend state**

After the existing state declarations (around line 57), add:
```tsx
const [resendLoading, setResendLoading] = useState(false);
const [resendSuccess, setResendSuccess] = useState(false);
```

**Step 3: Add resend handler**

After `closeSuccessModal` function, add:
```tsx
const handleResendEmail = async () => {
  const emailToResend = emailFromUrl || email;
  if (!emailToResend) return;

  setResendLoading(true);
  setResendSuccess(false);

  try {
    await resendConfirmationEmail(emailToResend);
    setResendSuccess(true);
  } catch (err) {
    // Fail silently — Supabase may throttle resend requests
    setResendSuccess(true); // Still show success to avoid confusion
  } finally {
    setResendLoading(false);
  }
};
```

**Step 4: Replace the "noEmail" help text with resend button**

Find (in the success modal, around line 189):
```tsx
              {/* Help text */}
              <p className="text-xs text-center text-gray-500 mt-4">
                {t("success.noEmail")}
              </p>
```

Replace with:
```tsx
              {/* Resend email */}
              <div className="mt-4 text-center">
                {resendSuccess ? (
                  <p className="text-sm text-green-600 font-medium">
                    {t("success.resendSuccess")}
                  </p>
                ) : (
                  <button
                    onClick={handleResendEmail}
                    disabled={resendLoading}
                    className="text-sm text-[#00D9FF] hover:text-[#00C4EA] font-medium transition-colors disabled:opacity-50"
                  >
                    {resendLoading ? (
                      <span className="flex items-center justify-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {t("loading")}
                      </span>
                    ) : (
                      t("success.resendButton")
                    )}
                  </button>
                )}
              </div>
```

**Verify TypeScript:** `cd frontend-next && npx tsc --noEmit 2>&1 | head -20`

**Commit:**
```bash
git add frontend-next/src/app/signup/page.tsx
git commit -m "feat(auth): add resend confirmation email button to signup success modal"
```

---

## Task 7 — Final verification + PR

**Step 1: Run TypeScript check**
```bash
cd frontend-next && npx tsc --noEmit 2>&1
```
Expected: no new errors.

**Step 2: Check all files are committed**
```bash
git status
```
Expected: clean working tree.

**Step 3: Manual verification checklist**
- [ ] Navigate to `/forgot-password` → page loads (no 404)
- [ ] Submit email on `/forgot-password` → success state shows
- [ ] Navigate to `/reset-password` directly → page loads
- [ ] Navigate to `/signup` and register → either goes to `/jobs` directly (confirm OFF) or shows modal (confirm ON)
- [ ] On signup success modal → "Renvoyer l'email" button visible and clickable
- [ ] `auth-context.tsx` exports `resetPasswordForEmail` and `resendConfirmationEmail`
- [ ] `/auth/callback` handles `type=recovery` correctly

**Step 4: Push and create PR**
```bash
git push -u origin fix/87-auth-forgot-password-signup-flow

gh pr create \
  --title "fix(auth): forgot-password flow + signup confirmation UX" \
  --body "$(cat <<'EOF'
## Summary
- Create `/forgot-password` page (form + email sent success state)
- Create `/reset-password` page (new password form)
- Update `/auth/callback` to detect `type=recovery` → redirect to `/reset-password`
- Fix `signUpWithEmail`: if Supabase session exists immediately (email confirm disabled), redirect to `/jobs` instead of showing stuck success modal
- Add `resendConfirmationEmail()` button to signup success modal
- Add `resetPasswordForEmail()` + `resendConfirmationEmail()` to auth-context
- i18n: fr/en/es/pt for all new strings

## Test plan
- [ ] `/forgot-password` loads without 404
- [ ] Forgot password email sent + success state shown
- [ ] Password reset link → `/auth/callback?type=recovery` → `/reset-password` page
- [ ] New password saved, redirect to `/login`
- [ ] Email signup → modal shown OR direct `/jobs` redirect (depending on Supabase config)
- [ ] "Renvoyer l'email" button works in success modal
- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] All strings translated (fr/en/es/pt)

Fixes #87
EOF
)"
```
