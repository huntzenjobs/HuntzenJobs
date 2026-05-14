# Audit -- Business Logic
Date : 2026-03-18
Score : 60/100

## Resume executif

L'authentification est solide (Supabase SSR, auto-refresh, inactivity timeout). Le systeme de plans/quotas est bien architecture avec verification backend via RPC Supabase. Cependant, plusieurs failles critiques existent : les recherches d'emploi sont accessibles sans authentification et sans quota pour les users anonymes, le job tracking est un placeholder renvoyant toujours `remaining: 999`, le coach IA n'utilise pas le contexte CV de l'utilisateur, et `invoice.payment_failed` ne notifie pas l'utilisateur par email. Le flux CV analysis est bien implemente avec Modal Labs async + quota check pre-upload.

## BLOQUANTS

### 1. Recherche d'emploi sans quota pour les utilisateurs anonymes
- **Fichier :** `backend/src/api/routes/jobs.py:193-195` (POST) et `:281-283` (GET)
- **Probleme :** Le quota n'est verifie que si `user_id` est present (`if user_id: _check_job_search_quota(user_id)`). Un utilisateur non authentifie peut effectuer des recherches illimitees via l'API directement, sans aucune restriction.
- **Impact client :** Un bot ou un concurrent peut scraper toutes les offres sans limite. Les users Free n'ont aucune raison de s'inscrire puisque la recherche fonctionne sans compte.
- **Fix :** Ajouter un rate limit IP plus strict pour les requetes non authentifiees OU exiger l'authentification pour la recherche. La route a deja `@limiter.limit("50/minute")` par IP mais c'est genereux pour un scraper.

### 2. Job view tracking est un placeholder -- quota jamais applique
- **Fichier :** `backend/src/api/routes/jobs.py:431-456`
- **Probleme :** L'endpoint `/track-view` retourne toujours `"remaining": 999` et `"tracked": True` sans aucune logique reelle. Le commentaire dit `# TODO: Implement actual tracking logic`. Le plan Free est cense limiter `jobs_visible` a 10 (`use-freemium-limits.ts:22`) mais cette limite n'est verifiee que cote frontend (localStorage).
- **Impact client :** Les limites de visibilite des offres pour le plan Free sont purement cosmetiques et contournables via l'API.
- **Fix :** Implementer le tracking reel dans la DB via `increment_usage` RPC, ou supprimer la limitation frontend si elle n'a pas de valeur commerciale.

## IMPORTANTS

### 3. invoice.payment_failed ne notifie pas l'utilisateur
- **Fichier :** `backend/src/services/stripe.py:821-846`
- **Probleme :** `handle_payment_failed()` met a jour le statut en `past_due` dans Supabase et invalide le cache, mais n'envoie aucun email a l'utilisateur et ne cree aucune notification in-app.
- **Impact client :** L'utilisateur ne sait pas que son paiement a echoue. Il peut perdre son acces sans comprendre pourquoi.
- **Fix :** Ajouter un appel a `send_payment_failed_email()` et/ou creer une notification Supabase (`user_notifications`) pour informer l'utilisateur.

### 4. Le Coach IA n'utilise pas le contexte CV de l'utilisateur
- **Fichier :** `backend/src/api/routes/coach.py:125-242`
- **Probleme :** L'endpoint `/chat` du coach ne recupere ni ne passe le CV de l'utilisateur a l'agent. Le `CareerCoachAgent` ne recoit que `message`, `history`, `language` et `deep_analysis`. Aucune reference au CV dans `backend/src/agents/coach/`.
- **Impact client :** Le coach IA donne des conseils generiques sans connaitre le profil reel de l'utilisateur. C'est une perte de valeur significative pour un produit payant.
- **Fix :** Recuperer le dernier CV analyse depuis `cv_analyses` (Supabase) et le passer comme contexte systeme a l'agent coach.

### 5. Downgrade via Subscription.modify applique le nouveau prix immediatement
- **Fichier :** `backend/src/services/stripe.py:361-394`
- **Probleme :** `_schedule_downgrade()` utilise `proration_behavior="none"` mais modifie le `price` immediatement via `Subscription.modify()`. Stripe va facturer le nouveau prix (inferieur) au prochain renouvellement, mais l'utilisateur garde le plan actuel avec les limites du NOUVEAU plan dans Supabase, car le webhook `customer.subscription.updated` met a jour le `plan_id` immediatement (ligne 748-749).
- **Impact client :** L'utilisateur qui downgrade perd immediatement les features de son plan actuel alors qu'il a paye jusqu'a la fin de la periode.
- **Fix :** Ne pas mettre a jour `plan_id` dans `handle_subscription_updated()` quand `cancel_at_period_end` est false et que le changement est un downgrade. Ou utiliser `subscription_schedule` de Stripe pour appliquer le changement a la date de renouvellement.

### 6. Auth callback /auth/recovery non verifie
- **Fichier :** `frontend-next/src/contexts/auth-context.tsx:383-392`
- **Probleme :** `resetPasswordForEmail()` redirige vers `/auth/recovery` mais aucune verification que cette page existe et gere correctement le flow de reinitialisation (token Supabase dans l'URL, formulaire de nouveau mot de passe).
- **Impact client :** Le flux "mot de passe oublie" pourrait ne pas fonctionner si la page `/auth/recovery` n'est pas implementee correctement.
- **Fix :** Verifier l'existence et le bon fonctionnement de `frontend-next/src/app/auth/recovery/page.tsx`.

### 7. console.log en production dans useSubscriptionApi
- **Fichier :** `frontend-next/src/hooks/use-subscription-api.ts:141,241,306,346-347,399,403`
- **Probleme :** Multiples `console.log` et `console.warn` actifs en production (pas conditionnes par `isDev`).
- **Impact client :** Fuite d'information technique dans la console du navigateur. Pas critique mais non professionnel pour un produit SaaS payant.
- **Fix :** Conditionner tous les logs avec `if (process.env.NODE_ENV !== 'production')` ou utiliser un logger conditionnel comme dans `auth-context.tsx`.

### 8. Redis cache 30s sur /api/auth/me peut retarder la mise a jour post-webhook
- **Fichier :** `backend/src/api/routes/auth.py:114-122` et `312-317`
- **Probleme :** Le cache Redis de 30s sur `/api/auth/me` signifie qu'apres un webhook Stripe, meme si le cache est invalide par `invalidate_user_quota_cache()`, si l'utilisateur fait un appel dans les 30s suivantes AVANT l'invalidation (race condition), il verra des donnees obsoletes.
- **Impact client :** Apres un paiement reussi, l'utilisateur peut voir "Plan Gratuit" pendant quelques secondes.
- **Fix :** Le webhook invalide deja le cache (bon), mais verifier que l'ordre `webhook -> invalidate -> next request` est garanti. Le TTL 30s est un bon compromis.

## AMELIORATIONS

### 9. Routes /training-recommendations et /career-plan non protegees par auth
- **Fichier :** `backend/src/api/routes/coach.py:245-301`
- **Probleme :** Les endpoints `POST /training-recommendations` et `POST /career-plan` n'ont ni `@limiter.limit` ni verification d'authentification.
- **Impact client :** Endpoints LLM (Groq) accessibles publiquement sans rate limit, exposant a l'abus et aux couts Groq.
- **Fix :** Ajouter `CurrentUserDep` et `@limiter.limit("10/minute")`.

### 10. Le fichier CV upload n'a pas de validation de type MIME server-side
- **Fichier :** `backend/src/api/routes/cv_analysis.py:125-189`
- **Probleme :** L'endpoint accepte `file: Optional[UploadFile]` sans verifier le content-type. La validation de taille existe dans `cv_adapter.py:398` (10MB) mais pas dans `cv_analysis.py`. Le format PDF n'est pas verifie par magic bytes.
- **Impact client :** Un utilisateur pourrait uploader un fichier non-PDF qui ferait planter le processing Modal.
- **Fix :** Ajouter une validation du content-type (`application/pdf`) et des magic bytes PDF (`%PDF`).

### 11. Coach session (active_coach_sessions) n'a pas de TTL/cleanup
- **Fichier :** `backend/src/api/routes/subscription.py:183-305`
- **Probleme :** Si le navigateur crash pendant une session coach, la session reste "active" indefiniment dans `active_coach_sessions`. Il n'y a pas de TTL ni de cron pour nettoyer les sessions abandonnees.
- **Impact client :** L'utilisateur ne peut plus demarrer une nouvelle session coach car une session fantome est bloquante.
- **Fix :** Ajouter un TTL (ex: 2h max par session) ou un cron qui supprime les sessions de plus de 2h.

### 12. Hardcoded plan prices fallback
- **Fichier :** `backend/src/api/routes/auth.py:198`
- **Probleme :** Fallback de prix en dur `{"free": 0, "starter": 8.90, "pro": 13.90, "premium": 19.90}` si la requete DB echoue. Ces prix pourraient devenir incorrects sans deploiement.
- **Impact client :** Affichage de mauvais prix si la DB est momentanement indisponible.
- **Fix :** Acceptable comme fallback de securite, mais logger un warning (deja fait) et envisager de ne pas afficher de prix plutot qu'un prix potentiellement faux.

## CE QUI FONCTIONNE BIEN

- **Authentification complete** : Signup email (avec timeout 30s), OAuth Google, login, logout avec nettoyage complet du state + full page reload, reset password, resend confirmation email. Middleware SSR solide avec `getUser()`.
- **Auto-refresh session** : `useAutoRefreshSession` gere proactivement le refresh 5min avant expiration, detecte l'inactivite (30min), et valide la session au retour sur la page (visibilitychange). Tres bien implemente.
- **Routes protegees** : `/dashboard`, `/profile`, `/saved-jobs`, `/admin` correctement proteges dans `middleware.ts:194`. Redirect vers `/login` avec `redirectTo` pour deep linking.
- **Redirect si deja authentifie** : `/login` et `/signup` redirigent vers `/jobs` si user connecte (middleware.ts:207-216).
- **Quota check backend** : Les quotas sont verifies AVANT le traitement pour `cv_analysis`, `job_search`, `coach`, `assistant_messages`. Verification via RPC Supabase `get_quota_status`. Code 429 avec detail structure (feature, limit, used, reset_at).
- **Increment quota apres succes** : Le quota CV est incremente uniquement apres succes du processing Modal (callback, `cv_analysis.py:340`). Meme pattern pour job search et assistant messages.
- **Reset quotidien des quotas** : Cron Vercel a minuit UTC (`vercel.json` + `route.ts`) qui appelle `reset_quotas_rpc` Supabase. Protege par `CRON_SECRET`.
- **Webhook Stripe signature** : Verification via `stripe.Webhook.construct_event()` avec rejection si secret manquant (`stripe.py:416-429`). Idempotence via RPC `is_webhook_event_processed` + `mark_webhook_event_processed`.
- **checkout.session.completed** : Cree/met a jour `user_subscriptions`, verifie l'existence du user, archive l'ancien abonnement si upgrade, invalide le cache Redis, envoie alerte admin, gere le referral.
- **customer.subscription.updated** : Met a jour status, prix, periodes, `cancel_at_period_end`, resolve le `plan_id` depuis `stripe_prices`, invalide le cache.
- **customer.subscription.deleted** : Passe le statut en `canceled`, invalide le cache.
- **Annulation** : `cancel_at_period_end=True` (jamais suppression immediate). La reactivation est aussi implementee.
- **Historique coach** : Persiste dans `coach_conversations` (Supabase) avec fallback in-memory. Cap a 50 messages en DB, 20 en memoire.
- **Upgrade avec proration** : `_upgrade_subscription()` utilise `proration_behavior="always_invoice"` pour facturer la difference immediatement.
- **Monthly to Annual** : Safe -- schedule cancel de la mensuelle + nouveau checkout annuel. Si l'utilisateur abandonne le checkout, la mensuelle reste active.
- **Annual to Monthly** : Correctement bloque avec message d'erreur explicite.

---

## Tableau recapitulatif du scoring

| Categorie | Findings | Deduction |
|-----------|----------|-----------|
| BLOQUANTS | 2 (recherche anonyme illimitee, job view tracking placeholder) | -40 |
| IMPORTANTS | 6 | -30 |
| AMELIORATIONS | 4 | -4 |
| **Bonus** : qualite code auth/webhook/quota | | +34 (base) |

**Score final : 60/100**

Les deux bloquants sont des failles de logique metier qui permettent de contourner le modele freemium. Les 6 points importants sont des lacunes fonctionnelles (pas de notif paiement echoue, coach sans contexte CV, downgrade premature) qui degradent l'experience client payant.
