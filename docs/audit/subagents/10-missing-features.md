# Audit — Features manquantes
Date : 2026-03-18
Score : 30/100

## Resume executif

HuntZen dispose de pages legales (CGU, Privacy) substantielles et bien redigees, d'une FAQ riche, et d'un footer avec liens legaux. Cependant, plusieurs elements **bloquants pour un lancement commercial en France** sont absents : banniere cookies RGPD, page mentions legales, suppression de compte fonctionnelle, export des donnees RGPD. Le Stripe Customer Portal est implemente cote backend mais le frontend le branche correctement. L'onboarding est inexistant. Plusieurs features backend a forte valeur commerciale n'ont pas d'UI.

---

## 🔴 BLOQUANTS LEGAUX (obligatoires avant tout lancement en France)

### 1. Banniere cookies RGPD — MANQUANTE (-20 pts)
- **Statut :** manquant
- **Fichier verifie :** `frontend-next/src/app/layout.tsx` — aucun composant de banniere cookies. Grep sur `cookie-banner`, `consent`, `gdpr`, `rgpd` dans `src/` : zero resultat.
- **Probleme :** Le RGPD et la directive ePrivacy exigent un consentement explicite AVANT le depot de cookies non-essentiels (analytics, tracking). La page Privacy mentionne les cookies et dit "il est propose aux Utilisateurs d'accepter ou de refuser" mais aucun mecanisme technique n'existe.
- **Impact legal :** Amende CNIL jusqu'a 4% du CA. La CNIL a sanctionne Google (150M EUR), Amazon (35M EUR) et de nombreuses PME pour absence de bandeau cookies.
- **Action requise :** Implementer un composant `CookieBanner` avec consentement granulaire (cookies fonctionnels vs analytics vs marketing). Bloquer les scripts analytics (Sentry, tracking) tant que le consentement n'est pas donne. Stocker le choix en cookie + permettre de le modifier.

### 2. Page Mentions Legales — MANQUANTE (-10 pts)
- **Statut :** manquant
- **Fichier verifie :** `frontend-next/src/app/legal/` — repertoire inexistant. Le footer contient un lien `/legal` (dans `LEGAL_LINKS`) mais la page n'existe pas → **404 en production**.
- **Probleme :** La loi francaise (LCEN, art. 6-III) impose des mentions legales sur tout site commercial : editeur, directeur de publication, hebergeur, numero d'immatriculation, etc. Les CGU contiennent certaines infos (SIRET portugais, adresse) mais pas dans le format legalement requis.
- **Impact legal :** Contravention de 5e classe (1500 EUR par infraction) + defaut de confiance utilisateur.
- **Action requise :** Creer `frontend-next/src/app/legal/page.tsx` avec : raison sociale, forme juridique, capital, siege social, NIF 516481320, directeur de publication, hebergeur (Vercel Inc.), contact, numero TVA.

### 3. Page Contact — MANQUANTE
- **Statut :** manquant
- **Fichier verifie :** `frontend-next/src/app/contact/` — repertoire inexistant. Le footer contient un lien `/contact` (dans `LEGAL_LINKS`) mais la page n'existe pas → **404 en production**.
- **Probleme :** Lien casse dans le footer visible sur toutes les pages.
- **Action requise :** Creer `frontend-next/src/app/contact/page.tsx` avec formulaire ou coordonnees.

### 4. Suppression de compte — NON FONCTIONNELLE (-5 pts)
- **Statut :** incomplet
- **Fichier verifie :** `frontend-next/src/components/profile/settings-section.tsx:381-387`
- **Probleme :** Le bouton "Supprimer mon compte" existe mais est **desactive** avec le message `deleteAccountComingSoon`. L'endpoint backend existe uniquement dans `admin.py` (admin-only). L'utilisateur ne peut PAS supprimer son propre compte.
- **Impact legal :** Le RGPD art. 17 garantit le droit a l'effacement. L'utilisateur doit pouvoir demander la suppression de ses donnees. Actuellement, il doit contacter le support par email.
- **Action requise :** Creer un endpoint `DELETE /api/users/me` cote backend + activer le bouton frontend avec confirmation modale.

### 5. Export des donnees personnelles (RGPD art. 20) — MANQUANT
- **Statut :** manquant
- **Fichier verifie :** Grep sur `export.*data`, `portabilit` : aucun mecanisme d'export des donnees personnelles. Les exports existants (`lib/export/`) concernent les conversations coach (PDF/Markdown), pas les donnees utilisateur.
- **Probleme :** Le RGPD art. 20 donne le droit a la portabilite des donnees dans un format structure (JSON, CSV).
- **Impact legal :** Non-conformite RGPD. Moindre risque que les cookies, mais obligatoire.
- **Action requise :** Ajouter un bouton "Exporter mes donnees" dans le profil → endpoint backend qui genere un ZIP avec : profil, CV uploades, historique coach, offres sauvegardees, analyses CV.

---

## 🟠 IMPORTANTS (bloquants commerciaux)

### 6. Onboarding utilisateur — INEXISTANT
- **Statut :** manquant
- **Fichier verifie :** Grep sur `onboarding`, `tour`, `getting-started` : aucun composant de tour produit ou checklist premier login.
- **Probleme :** Un nouvel utilisateur inscrit arrive sur le dashboard sans aucune guidance. Pas de tour interactif, pas de checklist "Premiers pas", pas d'email de bienvenue avec guide (le backend envoie un email de confirmation Supabase standard).
- **Impact commercial :** Taux d'activation faible. Les utilisateurs ne decouvrent pas les features cles (analyse CV, coaches IA) et quittent rapidement.
- **Action requise :**
  1. Modal/tour de bienvenue au premier login (3-4 etapes : upload CV → explorer les offres → decouvrir les coaches)
  2. Email de bienvenue avec CTA vers les features cles
  3. Etats vides avec guidance dans chaque section (deja partiellement en place via welcome-screen.tsx dans l'assistant)

### 7. CGU — Contenu deconnecte du produit actuel
- **Statut :** present mais inadapte
- **Fichier verifie :** `frontend-next/src/app/terms/page.tsx`
- **Probleme :** Les CGU decrivent un modele de "marketplace recrutement" avec des profils Client/Recruteur/Candidat et des primes de 70%/50%. Ce modele ne correspond **pas du tout** au produit actuel (SaaS B2C d'aide a la recherche d'emploi avec abonnement). Les CGU ne mentionnent pas : le plan gratuit/pro, les limitations d'usage, l'IA/LLM, la conservation des CV, le traitement automatise, le droit de retractation 14 jours pour les abonnements en ligne.
- **Impact legal :** CGU inapplicables → aucune protection juridique reelle en cas de litige.
- **Action requise :** Recrire les CGU pour refleter le modele SaaS actuel : description du service IA, plans et tarifs, limitations, politique d'annulation, traitement automatise des donnees, responsabilite sur les recommandations IA.

### 8. Politique de confidentialite — Insuffisante sur les details RGPD
- **Statut :** present mais incomplet
- **Fichier verifie :** `frontend-next/src/app/privacy/page.tsx`
- **Probleme :** La politique est bien structuree et couvre les bases (droits, cookies, transferts internationaux). Mais elle manque de details obligatoires :
  - **Pas de liste precise des donnees collectees** (email, nom, CV, historique de chat, adresse IP...)
  - **Pas de finalites detaillees** (analyse CV par IA, matching emploi, coaching IA, analytics...)
  - **Pas de durees de conservation precises** (juste "duree prevue par la loi applicable")
  - **Pas de base legale du traitement** (consentement, execution du contrat, interet legitime)
  - **Pas de mention des sous-traitants** (Supabase, Groq, Stripe, Sentry, Vercel, Railway)
  - **Pas de mention du DPO** (ou responsable de la protection des donnees)
- **Action requise :** Enrichir la politique avec ces elements obligatoires du RGPD art. 13-14.

### 9. FAQ — Contenu partiellement inexact
- **Statut :** present
- **Fichier verifie :** `frontend-next/src/app/faq/faq-data.ts`
- **Probleme :** La FAQ contient des affirmations marketing non verifiees :
  - "87% de nos utilisateurs HuntZen Jobs recoivent plus de reponses" — metrique non verifiee
  - "chat en direct (24/7)" — aucun chat en direct n'existe
  - "app mobile HuntZen Jobs (iOS/Android)" — aucune app mobile native n'existe (PWA seulement)
  - "alertes emploi personnalisees par email ou SMS" — les alertes SMS n'existent pas
  - "7 jours d'essai gratuit" — a verifier si c'est toujours actuel
  - "tutoriels video, guides PDF, et webinaires" — aucun contenu de ce type n'existe
  - "support@huntzenjobs.com" vs "contact@huntzenjobs.co" — deux emails differents mentionnes
- **Impact commercial :** Publicite mensongere (sanctions DGCCRF) + perte de confiance utilisateur quand il decouvre que les fonctionnalites annoncees n'existent pas.
- **Action requise :** Corriger toutes les affirmations pour refleter la realite du produit.

---

## 🟡 AMELIORATIONS (v2, nice to have)

### 10. Email de bienvenue structure
- **Statut :** manquant
- Le backend a un service email (`services/email.py`) et Resend configure, mais pas d'email de bienvenue avec guide de demarrage.
- **Action :** Template email welcome avec 3 CTAs (analyser CV, explorer offres, decouvrir coaches).

### 11. Page About — Metriques non verifiees
- **Statut :** present
- **Fichier verifie :** `frontend-next/src/app/about/page.tsx`
- **Probleme :** "50 000 utilisateurs actifs", "87% taux de satisfaction" — metriques non verifiees. Risque de publicite mensongere.
- **Action :** Soit verifier et documenter la source, soit retirer ou remplacer par "des milliers d'utilisateurs".

---

## ✅ CE QUI EST EN PLACE

- [x] **CGU** : Page `/terms` existante avec contenu substantiel, bien designee, lien dans le footer. Contenu deconnecte du produit actuel mais la page existe.
- [x] **Politique de confidentialite** : Page `/privacy` existante avec sections RGPD (droits, cookies, securite, transferts). Incomplete mais solide base.
- [x] **FAQ** : Page `/faq` avec Schema.org FAQPage pour Google Featured Snippets, 6 categories, 22 questions. Bien structuree techniquement.
- [x] **Page About** : Page `/about` avec contenu SEO riche, sections features, stats, comparaison concurrents.
- [x] **Footer avec liens legaux** : Composant `Footer` avec 4 colonnes (Produit, Ressources, Legal, Brand). Liens vers `/privacy`, `/terms`, `/contact`, `/legal` (les 2 derniers en 404).
- [x] **Stripe Customer Portal** : Backend `routes/stripe.py` implemente `billing_portal.Session.create()`. Frontend `subscription-card.tsx` le reference. L'utilisateur peut gerer son abonnement via le portail Stripe.
- [x] **Bouton suppression compte** : UI presente dans `settings-section.tsx` mais desactivee (`coming soon`).
- [x] **Backend support** : Route `support.py` existante + service notifications.
- [x] **Systeme de support** : Hook `use-support.ts` existe cote frontend.

---

## Features backend activables rapidement (quick wins)

| Feature | Backend pret | Effort UI estime | Valeur commerciale |
|---|---|---|---|
| Lettre de motivation (`POST /adapt/generate-cover-letter`) | Oui, PDF+JSON | 2-3 jours (modal + preview PDF) | TRES HAUTE — differenciateur majeur vs Indeed/LinkedIn |
| CV adapte a une offre (`POST /adapt` + `/adapt/pdf`) | Oui, PDF+JSON | 2-3 jours (bouton sur JobCard + preview) | TRES HAUTE — feature killer pour les candidats |
| Simulateur entretien (`POST /api/assistant/interview-sim`) | Oui, feature flag `ENABLE_INTERVIEW_SIMULATOR=false` | 3-5 jours (UI chat + mode questions/reponses) | HAUTE — differenciant unique |
| Hunter.io recruiter finder | Oui, configure | 1-2 jours (afficher infos recruteur sur JobCard) | MOYENNE — utile mais niche |
| Apollo.io contacts | Oui, configure | 1-2 jours | FAIBLE — doublon avec Hunter.io |

---

## Calcul du score

| Critere | Points deduits | Raison |
|---|---|---|
| CGU presentes mais inadaptees | -15 | Contenu deconnecte du produit actuel (pas -25 car la page existe) |
| Privacy presente mais incomplete | -10 | Manque details obligatoires RGPD |
| Banniere cookies absente | -20 | RGPD/ePrivacy non respecte |
| Customer portal present | 0 | Implemente |
| Suppression compte non fonctionnelle | -5 | Bouton desactive |
| Export donnees absent | -5 | RGPD art. 20 |
| Page mentions legales absente | -5 | LCEN non respecte |
| Pages Contact/Legal en 404 | -5 | Liens casses dans le footer |
| FAQ avec infos fausses | -5 | Risque publicite mensongere |

**Score final : 30/100**

Les 3 actions prioritaires avant lancement :
1. **Banniere cookies RGPD** (obligatoire, 1-2 jours)
2. **Page mentions legales** (obligatoire, 0.5 jour)
3. **Recrire les CGU** pour le modele SaaS actuel (obligatoire, 1-2 jours avec juriste)
