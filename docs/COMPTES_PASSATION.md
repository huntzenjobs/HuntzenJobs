# Inventaire des comptes — Passation HuntZen

Formulaire à compléter pour la passation. Une fois rempli, le contenu de la section 2 du `RUNBOOK.md` peut y faire référence.

> ⚠️ **Confidentialité** : ne pas committer ce fichier rempli sans avoir vérifié qu'il ne contient pas de secrets. Une version remplie peut être stockée hors git (gestionnaire de mots de passe, coffre-fort partagé, document chiffré).

---

## Légende

- **Login** : Google SSO · GitHub SSO · Email/password · SAML/SSO entreprise
- **2FA** : OUI (avec codes de récupération stockés où ?) · NON
- **Plan** : Free · Hobby · Pro · Team · Business · Enterprise · Autre
- **Rôle** : Owner · Admin · Developer · Read-only

---

## 🏗️ Infrastructure

### Railway
- Email propriétaire : `huntzenproject@gmail.com` *(confirmé)*
- Login : →
- 2FA : →
- Plan : →
- Codes de récupération stockés à : →
- Co-propriétaires / membres : →
- Service worker (séparé du backend ?) : OUI / NON →
- Si OUI, `JINA_API_KEY` posée dessus aussi ? : OUI / NON →
- URL dashboard : https://railway.app/project/`<project_id>`
- Notes : →

### Vercel
- Email propriétaire : →
- Login : →
- 2FA : →
- Plan : →
- Team / Org name : →
- Membres et rôles : →
- URL dashboard : →
- Notes : →

### Domaine `huntzenjobs.com`
- Registrar : → (OVH / Gandi / Namecheap / Cloudflare Registrar / Autre)
- Email du compte registrar : →
- Date d'expiration : →
- Auto-renouvellement actif : OUI / NON →
- Compte de facturation : →
- Notes : →

### DNS (si distinct du registrar)
- Provider : → (Cloudflare / Registrar direct / Autre)
- Email : →
- Plan : →
- Notes : →

---

## 🗄️ Base de données & Cache

### Supabase
*Variables Railway : `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_POOLER_URL`, `SUPABASE_JWT_SECRET`, `DATABASE_URL`*
- Email propriétaire : →
- Login : →
- 2FA : →
- Plan : →
- Project ref : `ngiakfikbuyugqfqtfwp` *(confirmé)*
- Région : `aws-1-eu-west-1` *(confirmé)*
- Membres et rôles : →
- URL dashboard : https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp
- Notes : →

### Upstash Redis (rate limiting)
*Variables Railway : `REDIS_LIMITER_URL`, `REDIS_TOKEN`*
- Email propriétaire : →
- Login : →
- 2FA : →
- Plan : →
- URL dashboard : https://console.upstash.com/
- Notes : →

### Redis Railway interne (broker ARQ)
*Variable Railway : `REDIS_URL` → `redis.railway.internal`*
- Service géré directement par Railway, pas de compte séparé
- Pas de credentials externes à inventorier

---

## 💰 Paiements (sensible)

### Stripe (compte LIVE)
*Variables Railway : `STRIPE_SECRET_KEY` (sk_live), `STRIPE_PUBLISHABLE_KEY` (pk_live), `STRIPE_WEBHOOK_SECRET`, `RECRUITER_CONTACT_PRICE_ID`*
- Email propriétaire : →
- Account holder name (légal) : →
- Login : →
- 2FA : →
- Adresse business déclarée : →
- Compte bancaire de payout (IBAN / account holder) : →
- Membres avec accès et rôles : →
- **Transfert de propriété possible ?** (changement legal entity) : →
- URL dashboard : https://dashboard.stripe.com/
- Notes : →

---

## 🤖 LLM & IA

### Groq
*Variable Railway : `GROQ_API_KEY`*
- Email : →
- Login : →
- 2FA : →
- Plan / quotas : →
- Nombre de clés actives (rotation ?) : →
- URL dashboard : https://console.groq.com/
- Notes : →

### Jina AI (embeddings)
*Variable Railway : `JINA_API_KEY`*
- **Pas de compte utilisateur** : la clé EST l'identité
- Clé sauvegardée dans gestionnaire de mots de passe ? : OUI / NON →
- Solde restant (10M offerts au départ) — à vérifier sur https://jina.ai onglet API
- Notes : →

### LangSmith (tracing LangChain)
*Variables Railway : `LANGCHAIN_API_KEY`, `LANGCHAIN_ENDPOINT`, `LANGCHAIN_PROJECT`*
- Email : →
- Login : →
- 2FA : →
- Plan : →
- Endpoint : `https://eu.api.smith.langchain.com` *(confirmé EU)*
- URL dashboard : →
- Notes : →

---

## 📧 Email & Monitoring

### Resend
*Variables Railway : `RESEND_API_KEY`, `FROM_EMAIL=no-reply@huntzenjobs.com`, `ADMIN_EMAIL`*
- Email propriétaire : →
- Login : →
- 2FA : →
- Plan : →
- Domaine `huntzenjobs.com` vérifié pour `no-reply@` : OUI / NON →
- DKIM configuré : OUI / NON →
- SPF configuré : OUI / NON →
- DMARC configuré : OUI / NON →
- URL dashboard : https://resend.com/
- Notes : →

### Sentry
*Variable Railway : `SENTRY_DSN`*
- Email : →
- Login : →
- 2FA : →
- Plan : →
- Org slug : →
- URL dashboard : →
- Notes : →

---

## 🔌 Sources de données — APIs externes

### Adzuna (offres d'emploi + salaires)
*Variables Railway : `ADZUNA_APP_ID`, `ADZUNA_API_KEY`*
- Email : →
- Plan / quota mensuel : →
- Coût mensuel : →
- URL dashboard : https://developer.adzuna.com/
- Notes : →

### France Travail (OAuth API)
*Variables Railway : `CLIENT_ID`, `CLIENT_SECRET` **ET** `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET`*
- **⚠️ Doublon détecté** : deux paires `CLIENT_ID/SECRET`. Laquelle est utilisée ?
- Email compte développeur : →
- Plan : →
- Doublon à supprimer (laquelle ?) : →
- URL dashboard : https://francetravail.io/
- Notes : →

### SerpAPI (Google Jobs + Events)
*Variable Railway : `SERPAPI_KEY`*
- Email : →
- Plan / quota mensuel : →
- Coût mensuel : →
- URL dashboard : https://serpapi.com/
- Notes : →

### RapidAPI (JSearch)
*Variable Railway : `RAPIDAPI_KEY`*
- Email : →
- Subscriptions actives (lesquelles ?) : →
- Coût mensuel total : →
- URL dashboard : https://rapidapi.com/
- Notes : →

### Hunter.io (recherche emails)
*Variable Railway : `HUNTER_API_KEY`*
- Email : →
- Plan / quota mensuel : →
- Coût mensuel : →
- URL dashboard : https://hunter.io/
- Notes : →

### Apollo.io (recherche contacts)
*Variable Railway : `APOLLO_API_KEY`*
- Email : →
- Plan / quota mensuel : →
- Coût mensuel : →
- URL dashboard : https://app.apollo.io/
- Notes : →

### Jooble (offres d'emploi)
*Variable Railway : `JOOBLE_API_KEY`*
- **À clarifier** : non listé dans la doc technique. Clé dormante ou utilisée activement ?
- Email : →
- Plan : →
- URL dashboard : https://jooble.org/api/
- Notes : →

### Careerjet (programme affilié)
*Variable Railway : `CAREERJET_AFFID` (uniquement un affid, pas une clé secrète)*
- **À clarifier** : non listé dans la doc technique. Utilisé activement ?
- Email du programme affilié : →
- Notes : →

---

## 🛠️ Infrastructure tierce

### Modal Labs (extraction PDF serverless)
*Variables Railway : `MODAL_WEBHOOK_URL`, `MODAL_PDF_EXTRACT_URL`, `MODAL_CALLBACK_SECRET`*
- Email propriétaire : →
- Login : →
- 2FA : →
- Plan : →
- URL dashboard : https://modal.com/
- Notes : →

---

## 🐙 GitHub

### Organisation `huntzenjobs`
- Email Owner de l'org : →
- Login Owner (Google/Email + 2FA) : →
- Membres et rôles (Owner / Admin / Write / Read) : →
- Personal Access Tokens utilisés pour CI/Actions (lesquels, par qui ?) : →
- Repositories principaux : `HuntzenJobs` *(et autres si applicable)* →
- URL : https://github.com/huntzenjobs
- Notes : →

---

## 📬 Comptes email opérationnels

### `huntzenproject@gmail.com`
- Mot de passe stocké à : →
- 2FA active : OUI / NON →
- Codes de récupération à : →
- Adresses de récupération configurées : →
- Notes : →

### Autres adresses (`no-reply@huntzenjobs.com`, `contact@huntzenjobs.com`, etc.)
- Fournisseur (Google Workspace / Resend / Forwarder simple) : →
- Email propriétaire compte fournisseur : →
- Membres ayant accès : →
- Notes : →

---

## 🔐 Récapitulatif sécurité

- [ ] Tous les comptes ont la 2FA activée
- [ ] Tous les codes de récupération sont stockés à un endroit accessible au repreneur
- [ ] Un gestionnaire de mots de passe partagé existe (1Password / Bitwarden / autre) : →
- [ ] Adresse email de récupération de chaque compte appartient bien à l'entité qui détient HuntZen
- [ ] Les clés API sensibles ne sont pas exposées dans des commits anciens (rotation effectuée si oui)

---

## 💸 Vue d'ensemble des coûts mensuels

| Service | Coût/mois | Notes |
|---|---|---|
| Railway | → | Backend + Worker + Redis interne |
| Vercel | → | Frontend |
| Supabase | → | DB + Auth + Storage |
| Upstash Redis | → | Rate limiting |
| Stripe | → | Frais sur transactions (variable) |
| Groq | → | Quota / overage |
| Jina | 0 € | Free tier 10M tokens |
| LangSmith | → | Tracing |
| Resend | → | Emails transactionnels |
| Sentry | → | Monitoring |
| Adzuna | → | Job board API |
| SerpAPI | → | Recherche Google + Events |
| RapidAPI | → | JSearch + autres |
| Hunter.io | → | Recherche emails |
| Apollo.io | → | Recherche contacts |
| France Travail | 0 € *(à confirmer)* | OAuth gratuit |
| Modal | → | Extraction PDF serverless |
| Domaine huntzenjobs.com | → | Renouvellement annuel |
| **TOTAL mensuel estimé** | **→** | |

---

## 🧪 Procédure post-passation (à exécuter par le repreneur)

1. [ ] Vérifier l'accès à chaque compte ci-dessus
2. [ ] Faire rotation des clés API sensibles (Stripe, Groq, Supabase service_role, JWT secrets) après le transfert
3. [ ] Mettre à jour les emails de récupération vers une boîte du repreneur
4. [ ] Activer 2FA partout si manquant
5. [ ] Documenter dans le gestionnaire de mots de passe partagé
6. [ ] Mettre à jour `docs/RUNBOOK.md` section 2 avec les nouvelles infos
