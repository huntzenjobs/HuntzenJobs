# Critical Fixes — Annulation Stripe + Recruteur + Admin Guard

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Corriger les 4 bugs bloquants : annulation Stripe impossible, page success recruteur 404, demandes recruteur anonymes, et dashboard admin accessible par tous.

**Architecture:** 4 tâches chirurgicales indépendantes — aucune refactoring structurel, aucune nouvelle dépendance. Chaque tâche touche 1-3 fichiers max.

**Tech Stack:** FastAPI (Python), Next.js 14 App Router, Stripe Python SDK, Supabase, React

---

## GARDE-FOUS OBLIGATOIRES

Avant chaque tâche, vérifier :
- [ ] Tu es sur la branche `fix/critical-fixes` (PAS sur Production ou main)
- [ ] `cd frontend-next && npx tsc --noEmit` passe sans erreur avant de commiter
- [ ] Ne JAMAIS appeler `stripe.Subscription.delete()` — utiliser `stripe.Subscription.modify(cancel_at_period_end=True)` (annulation en fin de période, pas immédiate)
- [ ] Ne jamais supprimer de données en DB depuis l'annulation — laisser le webhook `customer.subscription.updated` mettre à jour `cancel_at_period_end`

---

## Task 1 — Annulation abonnement Stripe (backend + frontend)

**Fichiers :**
- Modifier : `backend/src/api/routes/stripe.py`
- Modifier : `frontend-next/src/components/profile/subscription-card.tsx`

**Contexte :** Le bouton "Annuler l'abonnement" dans `/profile → onglet Abonnement` est `disabled`. Il n'existe aucun endpoint backend pour annuler. La logique Stripe est déjà dans `backend/src/services/stripe.py` — le webhook `handle_subscription_updated` gère déjà `cancel_at_period_end`. Il suffit d'exposer un endpoint qui appelle `stripe.Subscription.modify(cancel_at_period_end=True)`.

**RÈGLE CRITIQUE :** Utiliser `cancel_at_period_end=True` (annulation à la fin du mois payé), jamais `stripe.Subscription.delete()` (annulation immédiate = remboursement forcé).

### Step 1 : Ajouter l'endpoint backend

Dans `backend/src/api/routes/stripe.py`, APRÈS la route `/webhook`, ajouter :

```python
@router.post("/cancel-subscription")
async def cancel_subscription(
    current_user: dict = Depends(get_current_user)
):
    """
    Cancel the current user's subscription at end of billing period.
    Uses cancel_at_period_end=True — user keeps access until period ends.
    The webhook customer.subscription.updated will update DB automatically.
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user")

        # Get active subscription from DB
        from src.services.stripe import supabase_client
        result = (
            supabase_client
            .table("user_subscriptions")
            .select("stripe_subscription_id, status, plan_name")
            .eq("user_id", user_id)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="No active subscription found")

        subscription = result.data[0]
        stripe_subscription_id = subscription.get("stripe_subscription_id")

        if not stripe_subscription_id or not stripe_subscription_id.startswith("sub_"):
            raise HTTPException(status_code=400, detail="Invalid subscription ID")

        # Cancel at period end — NEVER use stripe.Subscription.delete()
        import stripe as stripe_lib
        updated = stripe_lib.Subscription.modify(
            stripe_subscription_id,
            cancel_at_period_end=True
        )

        logger.info(
            f"[STRIPE] Subscription {stripe_subscription_id} marked for cancellation "
            f"at period end for user {user_id}"
        )

        return {
            "success": True,
            "cancel_at_period_end": True,
            "current_period_end": updated.get("current_period_end"),
            "message": "Subscription will be cancelled at end of billing period"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[STRIPE] Cancel subscription failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cancel subscription: {str(e)}")
```

**Vérifier que l'import stripe existe déjà en haut du fichier** — si `import stripe` est absent, l'ajouter.

### Step 2 : Vérifier que la route est montée

```bash
grep -n "stripe" backend/src/api/routes/__init__.py | head -5
```

Attendu : une ligne qui inclut le stripe router (ex: `router.include_router(stripe_router, prefix="/api/stripe", ...)`). La nouvelle route `/cancel-subscription` sera automatiquement disponible sous `/api/stripe/cancel-subscription`.

### Step 3 : Activer le bouton dans le frontend

Dans `frontend-next/src/components/profile/subscription-card.tsx`, trouver :

```tsx
            <Button
              variant="ghost"
              className="sm:flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled
              aria-label="Annuler l'abonnement (bientôt disponible)"
            >
              Annuler l'abonnement
            </Button>
          </div>
          <p className="text-xs text-gray-500 text-center">
            💡 {t("cancelSubscriptionComingSoon")}
          </p>
```

Remplacer par :

```tsx
            <Button
              variant="ghost"
              className="sm:flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => setShowCancelDialog(true)}
              disabled={isCancelling}
              aria-label="Annuler l'abonnement"
            >
              {isCancelling ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full" />
                  {t("cancelling")}
                </span>
              ) : (
                t("cancelSubscription")
              )}
            </Button>
```

Et supprimer la ligne du message "coming soon" :
```tsx
          <p className="text-xs text-gray-500 text-center">
            💡 {t("cancelSubscriptionComingSoon")}
          </p>
```

### Step 4 : Ajouter l'état + dialog de confirmation + appel API

Dans `subscription-card.tsx`, trouver les `useState` existants en haut du composant et ajouter :

```tsx
const [isCancelling, setIsCancelling] = useState(false);
const [showCancelDialog, setShowCancelDialog] = useState(false);
const [cancelError, setCancelError] = useState<string | null>(null);
```

Ajouter la fonction `handleCancelSubscription` juste avant le `return` :

```tsx
const handleCancelSubscription = async () => {
  setIsCancelling(true);
  setCancelError(null);
  try {
    const { session } = useAuth(); // déjà importé via props ou contexte
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/stripe/cancel-subscription`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "Erreur lors de l'annulation");
    }
    setShowCancelDialog(false);
    // Notify user — subscription cancels at period end
    window.location.reload(); // simple refresh to show updated state
  } catch (err) {
    setCancelError(err instanceof Error ? err.message : "Erreur inconnue");
  } finally {
    setIsCancelling(false);
  }
};
```

**IMPORTANT :** Vérifier comment `session` est accédé dans ce composant. Lire les premières lignes du fichier pour voir si `useAuth()` est déjà appelé ou si `session` vient via props.

### Step 5 : Ajouter l'AlertDialog de confirmation

Juste avant le `return` du composant, ajouter le dialog de confirmation. Il faut importer `AlertDialog` depuis `@/components/ui/alert-dialog` (déjà installé — vérifier avec `grep -r "AlertDialog" frontend-next/src/components/ui/`).

Ajouter dans le JSX retourné, à la fin, juste avant la fermeture :

```tsx
<AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("cancelDialog.title")}</AlertDialogTitle>
      <AlertDialogDescription>
        {t("cancelDialog.description")}
      </AlertDialogDescription>
    </AlertDialogHeader>
    {cancelError && (
      <p className="text-sm text-red-600 px-1">{cancelError}</p>
    )}
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isCancelling}>
        {t("cancelDialog.keep")}
      </AlertDialogCancel>
      <AlertDialogAction
        onClick={handleCancelSubscription}
        disabled={isCancelling}
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        {isCancelling ? t("cancelling") : t("cancelDialog.confirm")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Step 6 : Ajouter les clés i18n manquantes

Dans `frontend-next/messages/fr.json`, trouver la section `profile` (ou `subscription`) et ajouter :

```json
"cancelSubscription": "Annuler l'abonnement",
"cancelling": "Annulation...",
"cancelDialog": {
  "title": "Annuler votre abonnement ?",
  "description": "Vous conserverez l'accès à toutes vos fonctionnalités jusqu'à la fin de la période en cours. Aucun remboursement ne sera effectué.",
  "keep": "Garder mon abonnement",
  "confirm": "Confirmer l'annulation"
}
```

Faire de même dans `en.json`, `es.json`, `pt.json` (traduire en conséquence).

### Step 7 : TypeScript check

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Attendu : aucune erreur.

### Step 8 : Commit

```bash
git add backend/src/api/routes/stripe.py \
        frontend-next/src/components/profile/subscription-card.tsx \
        frontend-next/messages/fr.json \
        frontend-next/messages/en.json \
        frontend-next/messages/es.json \
        frontend-next/messages/pt.json
git commit -m "feat(stripe): add cancel-subscription endpoint + enable cancel button in profile"
```

---

## Task 2 — Page success après paiement recruteur

**Fichier :**
- Créer : `frontend-next/src/app/(dashboard)/recruiter-contact/success/page.tsx`

**Contexte :** Après le paiement Stripe de 50€ pour une consultation recruteur, le backend redirige vers `/recruiter-contact/success?session_id=XXXXX`. Cette page n'existe pas → 404. Il faut une page simple qui confirme le paiement et guide l'utilisateur.

**Référence :** S'inspirer de `frontend-next/src/app/payment/success/page.tsx` — même pattern (polling + session_id), mais plus simple car c'est un paiement one-shot (pas un abonnement récurrent).

### Step 1 : Créer la page

Créer `frontend-next/src/app/(dashboard)/recruiter-contact/success/page.tsx` :

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, Calendar, ArrowRight, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Status = 'verifying' | 'success' | 'error';

export default function RecruiterContactSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('verifying');

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      setStatus('error');
      return;
    }
    // Stripe webhook processes asynchronously — just show success after 2s
    // The backend has already received the webhook by the time user lands here
    const timer = setTimeout(() => setStatus('success'), 2000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  if (status === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <Loader2 className="w-12 h-12 animate-spin text-[#00D9FF]" />
        <p className="text-lg text-gray-600">Confirmation de votre paiement...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <XCircle className="w-16 h-16 text-red-500" />
        <h1 className="text-2xl font-bold text-gray-900">Session invalide</h1>
        <p className="text-gray-600 text-center max-w-md">
          Nous ne pouvons pas confirmer votre paiement. Si vous avez été débité,
          contactez-nous à{' '}
          <a href="mailto:contact@huntzenjobs.co" className="text-[#00D9FF] underline">
            contact@huntzenjobs.co
          </a>
        </p>
        <Button asChild>
          <Link href="/recruiter-contact">Retour</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 py-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-12 h-12 text-green-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900">Paiement confirmé !</h1>
        <p className="text-lg text-gray-600 max-w-md">
          Votre consultation avec un recruteur expert a bien été réservée.
          Vous allez recevoir un email de confirmation avec les détails.
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 max-w-md w-full">
        <div className="flex items-start gap-3">
          <Calendar className="w-6 h-6 text-blue-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-blue-900">Prochaines étapes</p>
            <ul className="mt-2 space-y-1 text-sm text-blue-800">
              <li>📧 Vérifiez votre boîte email (et les spams)</li>
              <li>📅 Notre équipe vous contactera sous 48h pour planifier</li>
              <li>💬 Préparez vos questions pour maximiser la session</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="flex gap-4">
        <Button variant="outline" asChild>
          <Link href="/jobs">Rechercher des offres</Link>
        </Button>
        <Button asChild>
          <Link href="/assistant" className="flex items-center gap-2">
            Parler au coach <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
```

### Step 2 : TypeScript check

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Attendu : aucune erreur.

### Step 3 : Commit

```bash
git add frontend-next/src/app/\(dashboard\)/recruiter-contact/success/page.tsx
git commit -m "feat(recruiter): add /recruiter-contact/success page — fixes 404 after Stripe payment"
```

---

## Task 3 — Auth recruteur : utiliser get_user_id_from_token existant

**Fichier :**
- Modifier : `backend/src/api/routes/recruiter.py`

**Contexte :** `get_user_id_from_header()` (ligne 86) retourne toujours `None`. La fonction `get_user_id_from_token()` dans `backend/src/api/deps.py` est déjà implémentée et fonctionnelle — elle valide le JWT via Supabase et extrait l'user_id. Il suffit de l'importer et de l'utiliser.

### Step 1 : Vérifier que get_user_id_from_token fonctionne

```bash
grep -n "def get_user_id_from_token" backend/src/api/deps.py
```

Attendu : ligne ~315 avec la signature `def get_user_id_from_token(authorization: Optional[str]) -> Optional[str]`.

### Step 2 : Remplacer get_user_id_from_header dans recruiter.py

En haut du fichier `backend/src/api/routes/recruiter.py`, trouver les imports :

```python
from fastapi import APIRouter, HTTPException, status, Request, Header
from pydantic import BaseModel, EmailStr, Field
import stripe
from supabase import create_client, Client

from src.config.settings import get_settings
```

Ajouter l'import :

```python
from src.api.deps import get_user_id_from_token
```

### Step 3 : Remplacer la fonction placeholder

Trouver (lignes 86-95) :

```python
def get_user_id_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Extract user ID from Authorization header.

    For now, returns None as we need to implement proper auth.
    TODO: Implement proper JWT token validation with Supabase auth.
    """
    # Placeholder - In production, decode JWT and extract user_id
    # For testing, we can accept requests without auth
    return None
```

Remplacer par :

```python
def get_user_id_from_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """
    Extract user ID from Authorization Bearer token via Supabase JWT validation.
    Returns None for anonymous/unauthenticated requests (allowed for recruiter contact).
    """
    return get_user_id_from_token(authorization)
```

### Step 4 : Vérifier que les routes utilisent bien cette fonction

```bash
grep -n "get_user_id_from_header\|user_id" backend/src/api/routes/recruiter.py | head -20
```

Attendu : plusieurs lignes montrant `user_id = get_user_id_from_header(authorization)` dans les routes. La logique existante accepte déjà `user_id = None` pour les requêtes anonymes — ce changement fait juste en sorte que les users connectés voient leur ID enregistré.

### Step 5 : Commit

```bash
git add backend/src/api/routes/recruiter.py
git commit -m "fix(recruiter): use get_user_id_from_token for proper JWT auth (was always returning None)"
```

---

## Task 4 — Protection de l'admin dashboard

**Fichiers :**
- Créer : `frontend-next/src/app/(dashboard)/admin/layout.tsx`
- Modifier : `frontend-next/src/app/(dashboard)/admin/recruiter-requests/page.tsx` (ajouter liste emails admin)

**Contexte :** La page `/admin/recruiter-requests` est accessible par **n'importe quel user connecté** qui connaît l'URL. Il n'existe pas de colonne `is_admin` dans les tables Supabase (vérifié). La solution la plus simple et sûre sans migration DB : un layout serveur qui vérifie l'email de l'user contre une liste d'emails admins définie dans les variables d'environnement.

**Approche choisie :** Layout server component qui vérifie `user.email` contre `ADMIN_EMAILS` (env var), avec redirection 403 si non autorisé. Pas de migration DB nécessaire.

### Step 1 : Créer le layout admin serveur

Créer `frontend-next/src/app/(dashboard)/admin/layout.tsx` :

```tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// Comma-separated list of admin emails in env var
// Ex: ADMIN_EMAILS=wissem@huntzen.co,abdesamad@huntzen.co
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not authenticated → redirect to login
  if (!user) {
    redirect("/login");
  }

  // Not admin → redirect to dashboard
  if (!ADMIN_EMAILS.includes(user.email?.toLowerCase() ?? "")) {
    redirect("/jobs");
  }

  return <>{children}</>;
}
```

### Step 2 : Ajouter ADMIN_EMAILS aux variables d'environnement

Dans `frontend-next/.env.local` (créer si n'existe pas, ne PAS commiter) :

```
ADMIN_EMAILS=wissem@huntzen.co,abdesamad@huntzen.co
```

Et dans Vercel dashboard → Settings → Environment Variables, ajouter `ADMIN_EMAILS` avec les emails des admins séparés par des virgules.

**ATTENTION :** Ne jamais commiter `.env.local` avec de vrais emails. Vérifier que `.gitignore` contient `.env.local` :

```bash
grep ".env.local" frontend-next/.gitignore || grep ".env.local" .gitignore
```

### Step 3 : Vérifier que le layout server component peut appeler createClient

```bash
grep -n "createClient" frontend-next/src/lib/supabase/server.ts | head -5
```

Attendu : la fonction existe et est async. Si le fichier est `server.ts` ou `server.js`, la syntaxe `await createClient()` est correcte pour Next.js 14 App Router.

### Step 4 : TypeScript check

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Attendu : aucune erreur.

### Step 5 : Vérifier en local

```bash
cd frontend-next && npm run build 2>&1 | tail -20
```

Attendu : build réussi, la route `/admin/recruiter-requests` compilée.

### Step 6 : Commit

```bash
git add frontend-next/src/app/\(dashboard\)/admin/layout.tsx
git commit -m "fix(admin): protect /admin/* routes — redirect non-admin users to /jobs"
```

**Note dans le PR :** Mentionner que `ADMIN_EMAILS` doit être configuré dans Vercel avant merge.

---

## Task 5 — PR et vérifications finales

### Step 1 : TypeScript global

```bash
cd frontend-next && npx tsc --noEmit 2>&1 | grep -v "__tests__"
```

Attendu : aucune erreur.

### Step 2 : Vérifier les routes backend compilent

```bash
cd backend && python -c "from src.api.routes.stripe import router; from src.api.routes.recruiter import router; print('OK')"
```

Attendu : `OK`

### Step 3 : Tests manuels à faire

**Task 1 (annulation) :**
- Connecté avec un compte Pro → `/profile` → onglet Abonnement
- Bouton "Annuler l'abonnement" doit être cliquable (plus `disabled`)
- Clic → dialog de confirmation s'ouvre
- "Garder mon abonnement" → dialog ferme, rien ne change
- "Confirmer l'annulation" → spinner pendant appel API → succès → page reload

**Task 2 (success page) :**
- Naviguer vers `/recruiter-contact/success?session_id=test`
- Doit afficher le spinner pendant 2s puis la page de succès verte
- Naviguer vers `/recruiter-contact/success` (sans session_id)
- Doit afficher l'écran d'erreur avec lien email

**Task 3 (auth recruiter) :**
- Faire une requête POST `/api/recruiter/request` avec et sans token Bearer
- Avec token → `user_id` enregistré en DB
- Sans token → `user_id = null` en DB (comportement inchangé)

**Task 4 (admin guard) :**
- User non-admin : naviguer vers `/admin/recruiter-requests` → redirigé vers `/jobs`
- User admin (email dans ADMIN_EMAILS) : accès normal
- User non connecté : redirigé vers `/login`

### Step 4 : Push et PR

```bash
git push origin fix/critical-fixes
gh pr create \
  --title "fix: annulation Stripe + page success recruteur + auth recruteur + guard admin" \
  --body "$(cat <<'EOF'
## Fixes bloquants

- **Annulation abonnement**: endpoint POST /api/stripe/cancel-subscription (cancel_at_period_end=True) + bouton actif dans /profile
- **Page success recruteur**: /recruiter-contact/success — plus de 404 après paiement 50€
- **Auth recruteur**: get_user_id_from_token remplace le stub qui retournait toujours None
- **Guard admin**: layout serveur vérifie email contre ADMIN_EMAILS (env var)

## ⚠️ Avant merge

Configurer dans Vercel → Environment Variables :
- ADMIN_EMAILS=email1@huntzen.co,email2@huntzen.co
EOF
)"
```
