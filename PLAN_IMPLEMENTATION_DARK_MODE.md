# 🌓 PLAN D'IMPLÉMENTATION DARK MODE + FIXES UX

## 📦 FICHIERS À CRÉER/MODIFIER

### Phase 1: Infrastructure Dark Mode

#### 1. Theme Context (`frontend-next/src/contexts/theme-context.tsx`)
```typescript
'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: ResolvedTheme
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  // Charger le thème depuis localStorage au montage
  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('huntzen-theme') as Theme | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored)
    }
  }, [])

  // Écouter les changements du système
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateResolvedTheme = () => {
      if (theme === 'system') {
        setResolvedTheme(mediaQuery.matches ? 'dark' : 'light')
      } else {
        setResolvedTheme(theme as ResolvedTheme)
      }
    }

    updateResolvedTheme()
    mediaQuery.addEventListener('change', updateResolvedTheme)
    return () => mediaQuery.removeEventListener('change', updateResolvedTheme)
  }, [theme])

  // Appliquer le thème au document
  useEffect(() => {
    if (!mounted) return

    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)

    // Smooth transition pour éviter le flash
    root.style.colorScheme = resolvedTheme
  }, [resolvedTheme, mounted])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('huntzen-theme', newTheme)
  }

  // Prévenir le flash au chargement initial
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

#### 2. Theme Toggle Component (`frontend-next/src/components/theme/theme-toggle.tsx`)
```typescript
'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { motion } from 'framer-motion'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`
            relative w-10 h-10 rounded-full
            border-2 border-gray-200 dark:border-gray-700
            hover:border-[#00D9FF] dark:hover:border-[#00D9FF]
            bg-white dark:bg-gray-800
            transition-all duration-300
            ${className}
          `}
          aria-label="Changer le thème"
        >
          <motion.div
            initial={false}
            animate={{ rotate: resolvedTheme === 'dark' ? 180 : 0 }}
            transition={{ duration: 0.3 }}
          >
            {resolvedTheme === 'dark' ? (
              <Moon className="h-5 w-5 text-gray-300" />
            ) : (
              <Sun className="h-5 w-5 text-[#00D9FF]" />
            )}
          </motion.div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      >
        <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">
          Apparence
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            ${theme === 'light' ? 'bg-gray-100 dark:bg-gray-700' : ''}
          `}
        >
          <Sun className="mr-2 h-4 w-4" />
          <span>Clair</span>
          {theme === 'light' && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            ${theme === 'dark' ? 'bg-gray-100 dark:bg-gray-700' : ''}
          `}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>Sombre</span>
          {theme === 'dark' && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className={`
            cursor-pointer
            hover:bg-gray-100 dark:hover:bg-gray-700
            ${theme === 'system' ? 'bg-gray-100 dark:bg-gray-700' : ''}
          `}
        >
          <Monitor className="mr-2 h-4 w-4" />
          <span>Système</span>
          {theme === 'system' && (
            <span className="ml-auto text-[#00D9FF]">✓</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

#### 3. Dark Mode Variables (`frontend-next/src/styles/dark-mode.css`)
```css
/* Dark Mode Variables - Optimisées pour HuntZen */

@layer base {
  :root {
    /* ===========================
       LIGHT MODE (Défaut)
       =========================== */

    /* Backgrounds Light */
    --bg-primary: 255 255 255;           /* #ffffff - Cards, main content */
    --bg-secondary: 248 250 252;         /* #f8fafc - Subtle backgrounds */
    --bg-tertiary: 241 245 249;          /* #f1f5f9 - Even subtler */

    /* Text Light */
    --text-primary: 15 23 42;            /* #0f172a - Main text */
    --text-secondary: 71 85 105;         /* #475569 - Secondary text */
    --text-tertiary: 100 116 139;        /* #64748b - Muted text */

    /* Borders Light */
    --border-primary: 226 232 240;       /* #e2e8f0 - Main borders */
    --border-secondary: 203 213 225;     /* #cbd5e1 - Subtle borders */
  }

  .dark {
    /* ===========================
       DARK MODE
       =========================== */

    /* Backgrounds Dark */
    --bg-primary: 15 23 42;              /* #0f172a - Slate-900 */
    --bg-secondary: 30 41 59;            /* #1e293b - Slate-800 */
    --bg-tertiary: 51 65 85;             /* #334155 - Slate-700 */

    /* Text Dark */
    --text-primary: 241 245 249;         /* #f1f5f9 - Slate-100 */
    --text-secondary: 203 213 225;       /* #cbd5e1 - Slate-300 */
    --text-tertiary: 148 163 184;        /* #94a3b8 - Slate-400 */

    /* Borders Dark */
    --border-primary: 51 65 85;          /* #334155 - Slate-700 */
    --border-secondary: 71 85 105;       /* #475569 - Slate-600 */
  }
}

/* Smooth transitions */
*,
*::before,
*::after {
  transition-property: background-color, border-color, color;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

#### 4. Script anti-flash (Alternative sécurisée)
Au lieu de `dangerouslySetInnerHTML`, utiliser la solution Next.js recommandée:

**SOLUTION SÉCURISÉE:** Ajouter dans `next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: true,
  },
}

module.exports = nextConfig
```

Et utiliser le `Script` component de Next.js dans `layout.tsx`:
```typescript
import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Theme initialization script - SAFE: controlled static content */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >
          {`
            (function() {
              const theme = localStorage.getItem('huntzen-theme') || 'light';
              const resolved = theme === 'system'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : theme;
              document.documentElement.classList.add(resolved);
              document.documentElement.style.colorScheme = resolved;
            })();
          `}
        </Script>
      </head>
      <body>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

---

### Phase 2: Fixes Signup Loading

#### 5. Fix Auth Context (`frontend-next/src/contexts/auth-context.tsx`)
```typescript
const SIGNUP_TIMEOUT_MS = 30000 // 30 secondes

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<SignUpResponse> {
  // Créer une promesse avec timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error('Délai d\'attente dépassé. Vérifiez votre connexion et réessayez.'))
    }, SIGNUP_TIMEOUT_MS)
  })

  // Course entre signup et timeout
  try {
    const result = await Promise.race([
      supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      }),
      timeoutPromise
    ])

    if (result.error) {
      console.error('[AUTH] Signup error:', result.error)
      throw result.error
    }

    console.log('[AUTH] Signup success')
    return result
  } catch (error) {
    console.error('[AUTH] Signup failed:', error)
    throw error
  }
}
```

#### 6. Fix Signup Page (`frontend-next/src/app/signup/page.tsx`)
```typescript
const [isTimeout, setIsTimeout] = useState(false)

const handleEmailSignUp = async (e: React.FormEvent) => {
  e.preventDefault()

  // Validations...
  if (password !== confirmPassword) {
    setPasswordError("Les mots de passe ne correspondent pas")
    return
  }

  if (password.length < 6) {
    setPasswordError("Le mot de passe doit contenir au moins 6 caractères")
    return
  }

  try {
    setLoading(true)
    setIsTimeout(false)
    setPasswordError('')
    clearError()

    await signUpWithEmail(email, password, fullName)

    // Succès - reset form
    setFullName('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')

  } catch (err: any) {
    console.error('[SIGNUP] Error:', err)

    // Détecter timeout
    if (err.message?.includes('Délai') || err.message?.includes('timeout')) {
      setIsTimeout(true)
    }

  } finally {
    // ⚠️ CRITIQUE: Toujours arrêter le loading
    setLoading(false)
  }
}

// Dans le JSX, afficher message de timeout
{isTimeout && (
  <Alert variant="destructive" className="mb-4">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Connexion lente</AlertTitle>
    <AlertDescription>
      La requête a pris trop de temps. Vérifiez votre connexion internet et réessayez.
    </AlertDescription>
  </Alert>
)}
```

---

## 🔄 ORDRE D'IMPLÉMENTATION

### Jour 1: Infrastructure Dark Mode
1. ✅ Créer `theme-context.tsx`
2. ✅ Créer `theme-toggle.tsx`
3. ✅ Créer `dark-mode.css`
4. ✅ Intégrer dans `layout.tsx` avec Script component sécurisé
5. ✅ Tester toggle et persistance

### Jour 2: Adapter Composants UI
1. ✅ Card (`card.tsx`) - ajouter classes dark:
2. ✅ Button (`button.tsx`) - variants dark
3. ✅ Input (`input.tsx`) - borders et bg dark
4. ✅ Alert (`alert.tsx`) - couleurs dark
5. ✅ Tester tous les composants

### Jour 3: Adapter Pages
1. ✅ Landing Page - headers, sections, cards
2. ✅ Dashboard (Jobs, CV, Assistant)
3. ✅ Auth pages (Login, Signup)
4. ✅ QA visuel complet

### Jour 4: Fix Signup + Tests
1. ✅ Modifier `auth-context.tsx` avec timeout
2. ✅ Modifier `signup/page.tsx` avec error handling
3. ✅ Tests manuels du flow signup
4. ✅ Tests E2E si disponibles

### Jour 5: Polish & Documentation
1. ✅ Vérifier transitions smooth
2. ✅ Tester accessibilité (contraste)
3. ✅ Browser testing (Chrome, Safari, Firefox)
4. ✅ Mise à jour documentation

---

## ✅ CHECKLIST DE VALIDATION

### Dark Mode
- [ ] Toggle visible dans header (landing)
- [ ] Toggle visible dans sidebar (dashboard)
- [ ] Thème persiste après refresh
- [ ] Option "System" fonctionne
- [ ] Pas de flash au chargement
- [ ] Transitions smooth light↔dark
- [ ] Tous composants UI cohérents
- [ ] Contraste WCAG AA >= 4.5:1
- [ ] Shadows visibles en dark

### Signup Fix
- [ ] Pas de loading infini
- [ ] Timeout après 30s max
- [ ] Message d'erreur clair
- [ ] Success modal s'affiche
- [ ] Email de confirmation envoyé
- [ ] Logs pour debugging

### Accessibilité
- [ ] Ratios de contraste validés
- [ ] Focus states visibles
- [ ] Navigation clavier OK
- [ ] ARIA labels présents
- [ ] Screen reader testé

---

## 🎨 EXEMPLES D'ADAPTATION DARK MODE

### Card Component
```typescript
// Avant
<Card className="bg-white border-gray-200">

// Après
<Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
```

### Text Colors
```typescript
// Avant
<h1 className="text-gray-900">Titre</h1>
<p className="text-gray-600">Description</p>

// Après
<h1 className="text-gray-900 dark:text-gray-100">Titre</h1>
<p className="text-gray-600 dark:text-gray-400">Description</p>
```

### Buttons
```typescript
// Primary button - déjà OK (couleur brand)
<Button className="bg-[#00D9FF] hover:bg-[#00C4EA]">

// Outline button
<Button variant="outline" className="
  border-gray-200 dark:border-gray-700
  hover:bg-gray-100 dark:hover:bg-gray-700
">
```

---

Fin du plan d'implémentation ✅
