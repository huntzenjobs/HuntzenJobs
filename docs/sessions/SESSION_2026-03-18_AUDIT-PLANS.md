# SESSION — 2026-03-18 — Audit Plans/Pricing/Stripe

## Ce qui a été fait

Audit complet 4 couches du système plans/pricing/abonnements/Stripe,
suivi du fix des 5 bugs critiques identifiés.

### AUDIT (Phase 1 → 3)

- Cartographie exhaustive du système (frontend + backend + DB + intégrations)
- 4 subagents lancés en parallèle (Frontend, Backend, Database, Integration)
- Rapport consolidé : 7 bugs critiques, 7 incohérences, 5 manquants
- Score initial : 4/10

### FIXES APPLIQUÉS (Phase 4)

**Commit `4fa4246` — Frontend :**
- **C1** : Annulation d'abonnement maintenant fonctionnelle — `antiChurnPopup` passe
  `onSecondaryAction: () => setShowCancelDialog(true)`. Le `AlertDialog` de confirmation
  était monté mais `showCancelDialog` restait toujours `false`.
- **C2** : CTAs popups de conversion convertissent maintenant — comportement par défaut :
  redirect vers `checkoutUrl` si disponible, sinon `/pricing`. `useConversionPopup`
  accepte `options?: { onUpgrade, onSecondaryAction }` sans casser les 5 usages existants.
- **I1** : `use-plans-config.ts` — `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_BACKEND_URL`
  (les deux vars existent en prod Vercel, c'était une incohérence de code uniquement).

**Commit `8a9d686` — Backend :**
- **C5** : Monthly→Annual — `stripe.Subscription.delete()` remplacé par
  `stripe.Subscription.modify(cancel_at_period_end=True)`. Si le user abandonne
  le checkout annuel, son abo mensuel reste actif. Le webhook + trigger DB gèrent
  la transition proprement.
- **C3** : GET `/api/jobs/search` — ajout `@limiter.limit("10/minute")` + `request: Request`
  + quota check optionnel pour users authentifiés. Endpoint était totalement ouvert
  (pas d'auth, pas de rate limit, accès aux filtres premium gratuits).

**M1 — Faux positif :**
- Le cron `reset-quotas` était déjà dans `vercel.json` — l'audit subagent s'était trompé.

## Décisions techniques prises

1. **Monthly→Annual : cancel_at_period_end vs delete immédiat**
   Choix : `cancel_at_period_end=True` AVANT le checkout (pas après).
   Raison : si user abandonne le checkout, il garde son abo mensuel actif.
   Le trigger DB `trigger_auto_cancel_previous_subscriptions` gère automatiquement
   la cancellation quand le nouvel abo annuel devient `active`.

2. **useConversionPopup : options optionnelles**
   Choix : `options?: { onUpgrade?, onSecondaryAction? }` au lieu de props obligatoires.
   Raison : 5 usages existants sans callbacks → rétrocompatibilité totale.
   Default behavior : redirect checkoutUrl → /pricing.

3. **GET jobs : rate limit 10/min (pas 30)**
   Choix : 10/minute (vs 30 pour POST).
   Raison : endpoint sans auth = surface d'abuse plus large. Rate limiter IP.

## Fichiers modifiés

| Fichier | Changement |
|---------|-----------|
| `frontend-next/src/components/freemium/conversion-popups.tsx` | +`onSecondaryAction`, défaut CTA primaire, `useConversionPopup` extensible |
| `frontend-next/src/components/profile/subscription-card.tsx` | `antiChurnPopup` avec `onSecondaryAction` + `onUpgrade` |
| `frontend-next/src/hooks/use-plans-config.ts` | `NEXT_PUBLIC_API_URL` → `NEXT_PUBLIC_BACKEND_URL` |
| `backend/src/services/stripe.py` | Monthly→Annual : `delete()` → `modify(cancel_at_period_end=True)` |
| `backend/src/api/routes/jobs.py` | GET /search : rate limit + quota check auth |

## État actuel

### Ce qui fonctionne maintenant
- Annulation d'abonnement depuis la page profile (dialog de confirmation fonctionnel)
- CTAs popups de conversion redirigent vers checkout ou /pricing
- Monthly→Annual ne supprime plus l'abo actif avant confirmation
- GET /jobs/search rate-limité à 10/min + quota vérifié pour users auth
- Variable env `use-plans-config.ts` cohérente avec le reste du projet

### En cours / incomplet
- C4 : `get_user_id_from_token` JWT forgeable (decode sans vérif signature) → `backend/src/api/deps.py`
- C6 : `user_feature_overrides` RLS `USING(true)` → migration SQL à écrire
- C7 : `cleanup_old_records()` plante (référence tables supprimées) → `20260211000004_cron_cleanup.sql`
- I2 : `subscription-card.tsx` lit limites depuis `PLAN_LIMITS` hardcodé au lieu de `useSubscription().limits`
- I3 : Double listener `token-expired` dans `subscription-context.tsx` (lignes 213-246)
- I5 : Contradiction Pro features : `features` marketing ≠ `feature_flags` DB (`has_email_alerts`, `has_coach_history`)
- I7 : Typo `'cancelled'` vs `'canceled'` dans migration `20260210180000`

## Reste à faire

### 🔴 Critiques
- [ ] C4 — `deps.py` : remplacer `get_user_id_from_token` (JWT forgeable) par vérification Supabase dans jobs.py et cv_analysis.py
- [ ] C6 — Migration SQL : corriger RLS `user_feature_overrides` (ajouter restriction rôle sur USING)
- [ ] C7 — `20260211000004_cron_cleanup.sql` : supprimer les DELETE sur `stripe_webhook_events` et `webhook_failures` (tables inexistantes)

### 🟠 Incohérences
- [ ] I2 — `subscription-card.tsx` ligne 136 : remplacer `PLAN_LIMITS[plan]` par `limits` de `useSubscription()`
- [ ] I3 — `subscription-context.tsx` lignes 231-246 : supprimer le useEffect dupliqué `token-expired`
- [ ] I5 — Aligner `subscription_plans.features` marketing avec `feature_flags` pour Pro (email_alerts, coach_history)
- [ ] I7 — Migration correctrice : `'cancelled'` → `'canceled'` (deux L vs un L)

### 🟡 Manquants
- [ ] Message toast quota cassé : `search-form-inline.tsx` ligne 209 — `"Rechargez à ${remaining}"` (remaining = 0 si limite atteinte)
- [ ] Endpoint `POST /api/stripe/reactivate-subscription` manquant (users ne peuvent pas réactiver sans Stripe Portal)
- [ ] Gestion état `"trialing"` dans l'UI (aucun composant ne l'affiche)
- [ ] `user_sessions` RLS `USING(true)` — tout user auth peut lire les CVs des autres

## Problèmes rencontrés

1. **Variable Railway vs Vercel** : `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_BACKEND_URL` sont
   TOUTES LES DEUX définies en prod Vercel → I1 n'était pas un bug de prod mais de cohérence code.

2. **M1 faux positif** : le cron `reset-quotas` était déjà dans `vercel.json` (l'audit subagent
   avait lu un fichier `vercel.json` à la racine qui n'existe pas, au lieu de `frontend-next/vercel.json`).

3. **Context window à 84%** : fixes C4, C6, C7 reportés à la prochaine session.

## Commits de cette session

```
8a9d686 fix(backend): monthly→annual safe + quota GET jobs + rate limit
4fa4246 fix(subscription): annulation fonctionnelle + CTAs popups conversion + env var plans
```

## Pour reprendre

**Branche** : `Production`
**État** : propre (rien en staging)

**Commandes de démarrage** :
```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
npm run dev  # lance frontend (3000) + backend (8000)
```

**Reprendre exactement ici** :
Lire ce fichier et commencer par **C4** (le plus critique restant) :
> Fix `get_user_id_from_token` dans `backend/src/api/deps.py` — remplacer le decode
> JWT local (sans vérification signature) par un appel Supabase `auth.get_user()` dans
> les routes `jobs.py` (quota check) et `cv_analysis.py` (quota check).
> Attention : `get_user_from_token` (avec vérif Supabase) existe déjà dans `deps.py`,
> il suffit de l'utiliser à la place de `get_user_id_from_token` dans ces 2 routes.

Ensuite : **C6** (migration RLS), **C7** (cleanup cron cassé), **I2**, **I3**, **I5**.
