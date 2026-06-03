# Passation HuntZen — comptes et accès

Ne pas committer ce fichier rempli. Garder une version locale dans un gestionnaire de mots de passe ou un coffre partagé.

## En deux phrases

Tout passe par `huntzenproject@gmail.com` : la majorité des services se connectent via "Sign in with Google". Une fois sur Railway, toutes les clés API runtime sont dans les variables d'environnement, donc l'app peut tourner sans avoir à se connecter ailleurs.

## À transmettre au repreneur

- Mot de passe Gmail `huntzenproject@gmail.com`
- Codes de récupération Google (myaccount.google.com → Sécurité → Validation en 2 étapes → Codes de secours)
- Codes de récupération 2FA Stripe (compte LIVE, 2FA obligatoire)
- Login France Travail sur francetravail.io (pas de SSO, compte gouvernemental)
- Login du registrar du domaine `huntzenjobs.com`

## Services et accès

| Service | Connexion | Variables Railway | Dashboard |
|---|---|---|---|
| Railway | Google SSO | — | https://railway.app |
| Vercel | Google SSO | — | https://vercel.com |
| Supabase | Google SSO | `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_POOLER_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL` | https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp |
| Upstash Redis | Google SSO | `REDIS_LIMITER_URL`, `REDIS_TOKEN` | https://console.upstash.com |
| Stripe (LIVE) | Google SSO + 2FA obligatoire | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RECRUITER_CONTACT_PRICE_ID` | https://dashboard.stripe.com |
| Groq | Google SSO | `GROQ_API_KEY` | https://console.groq.com |
| Jina AI | Google SSO (dashboard seulement, l'API marche avec la clé seule) | `JINA_API_KEY` | https://jina.ai |
| LangSmith | Google SSO | `LANGCHAIN_API_KEY`, `LANGCHAIN_ENDPOINT`, `LANGCHAIN_PROJECT` | https://eu.smith.langchain.com |
| Resend | Google SSO | `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL` | https://resend.com |
| Sentry | Google SSO | `SENTRY_DSN` | https://sentry.io |
| Adzuna | À vérifier, sinon mot de passe oublié via Gmail | `ADZUNA_APP_ID`, `ADZUNA_API_KEY` | https://developer.adzuna.com |
| France Travail | Pas de SSO, login séparé | `CLIENT_ID`, `CLIENT_SECRET`, `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET` | https://francetravail.io |
| SerpAPI | Google SSO | `SERPAPI_KEY` | https://serpapi.com |
| RapidAPI (JSearch) | Google SSO | `RAPIDAPI_KEY` | https://rapidapi.com |
| Hunter.io | Google SSO | `HUNTER_API_KEY` | https://hunter.io |
| Apollo.io | Google SSO | `APOLLO_API_KEY` | https://app.apollo.io |
| Jooble | À vérifier, sinon mot de passe oublié via Gmail | `JOOBLE_API_KEY` | https://jooble.org/api |
| Careerjet | À vérifier, sinon mot de passe oublié via Gmail | `CAREERJET_AFFID` | — |
| Modal Labs | Google ou GitHub SSO | `MODAL_WEBHOOK_URL`, `MODAL_PDF_EXTRACT_URL`, `MODAL_CALLBACK_SECRET` | https://modal.com |
| GitHub (org `huntzenjobs`) | Login séparé, reset password via Gmail si email lié | — | https://github.com/huntzenjobs |
| Domaine `huntzenjobs.com` | Compte registrar séparé (OVH/Gandi/Cloudflare/autre — à confirmer) | — | — |

## Points d'attention

- France Travail a deux paires `CLIENT_ID/SECRET` dans Railway. Il y a un doublon à clarifier.
- Jooble et Careerjet sont configurés dans Railway mais pas mentionnés comme actifs dans la doc technique. Clés dormantes ou réellement utilisées, à vérifier.
- La clé `JINA_API_KEY` est une free tier de 10M tokens. Vérifier le solde restant sur jina.ai.
- Stripe est en mode LIVE (`sk_live_...`). Toute manipulation impacte de vrais paiements.

## Coûts mensuels

Chiffres tirés de `docs/architecture/scaling.md` pour les services principaux. Le reste est à confirmer sur les dashboards.

| Service | Plan | Coût/mois |
|---|---|---|
| Railway | Pro | ~20–35 $ |
| Vercel | Pro | ~20 $ |
| Supabase | Pro | 25 $ |
| Upstash Redis | Pay-as-you-go | ~2–5 $ |
| Modal Labs | Serverless pay-as-you-go | ~3–6 $ |
| Groq | Développeur (gratuit, à upgrader si on dépasse les quotas) | 0 $ aujourd'hui, ~25–50 $ à 1000 DAU |
| Jina AI | Free tier 10M tokens | 0 € |
| France Travail | OAuth gratuit | 0 € (à confirmer) |
| Stripe | Pas d'abonnement, frais sur transactions (~2,5% + 0,25 €) | variable |
| LangSmith | Plan à vérifier | à confirmer |
| Resend | Plan à vérifier (free tier 3000 emails, sinon Pro ~20 $) | à confirmer |
| Sentry | Plan à vérifier (free tier 5K events) | à confirmer |
| Adzuna | Plan à confirmer | à confirmer |
| SerpAPI | Plan à confirmer | à confirmer |
| RapidAPI (JSearch) | Subscription à confirmer | à confirmer |
| Hunter.io | Plan à confirmer | à confirmer |
| Apollo.io | Plan à confirmer | à confirmer |
| Domaine huntzenjobs.com | Renouvellement annuel chez le registrar | ~1–2 € (~15–20 €/an lissé) |
| **Total connu** | | **~70–91 $/mois** (sans les "à confirmer") |
