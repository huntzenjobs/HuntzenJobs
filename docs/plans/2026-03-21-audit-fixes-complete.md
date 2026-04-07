# SPEC COMPLETE -- Corrections audit commercial HuntZen

> Objectif : amener les 10 dimensions de ~67/100 moyen vers ~95/100 moyen
> Date : 2026-03-21
> Estimations : 8 sprints (1 sprint = 1 jour de travail max)
> Verification : 76 problemes verifies le 21/03. 60 confirmes, 10 partiels, 5 faux positifs.

## CORRECTIONS POST-VERIFICATION (21 mars 2026)

**5 faux positifs retires :**
1. ~~Temps recherche jobs > 15s~~ — mesure a 7.8s (pas 21s). Lent mais acceptable.
2. ~~Index user_notifications manquant~~ — l'index `idx_user_notifications_user_unread` existe deja.
3. ~~profiles.subscription_tier utilise~~ — references a `subscription_plans` (table), pas au champ deprecated.
4. ~~OG image manquant~~ — `og-image.svg` existe dans `public/`.
5. ~~faq/page.tsx "use client"~~ — la page FAQ n'est PAS en "use client".

**10 partiels nuances :**
- Rate limiting Stripe : 1 endpoint rate-limite (reactivate), pas 0. Fix 1.3 reste pertinent.
- Crons sans auth backend : 2 sur 4 (job-alerts, weekly-summary), pas tous.
- 4 composants ont useTranslations mais strings hardcodes restants (cv-upload-async, profile-form, settings-section, theme-toggle).
- Pages "use client" SEO : 4 sur 5 (pricing, about, jobs, salons). FAQ est OK.
- Skip link : fonctionne sur dashboard, pas sur pages publiques.

---

## RESUME DES SCORES

| Dimension | Actuel | Objectif | Delta |
|-----------|--------|----------|-------|
| 1. Logique metier | 89 | 98 | +9 |
| 2. Interface UI | 68 | 95 | +27 |
| 3. I18N | 38 | 90 | +52 |
| 4. Securite | 82 | 95 | +13 |
| 5. Base de donnees | 72 | 95 | +23 |
| 6. API et integrations | 68 | 90 | +22 |
| 7. Performance et SEO | 73 | 92 | +19 |
| 8. Accessibilite | 68 | 92 | +24 |
| 9. Qualite du code | 58 | 85 | +27 |
| 10. Features produit | 48 | 90 | +42 |

---

## SPRINT 1 -- Securite, auth et corrections critiques (Jour 1)

**Impact scores : Dim1 +3, Dim4 +10, Dim6 +2**
**Risque global : MOYEN (touche auth et paiements)**
**Necessite redeploy Railway : OUI**

---

### FIX 1.1 -- GET /api/saved-jobs retourne 200 sans auth au lieu de 401

- **Fichier** : `backend/src/api/routes/saved_jobs.py` ligne 62
- **Probleme** : Si `user_id` est `None`, retourne `{"success": True, "jobs": []}` au lieu de 401
- **Changement** :
  ```python
  # AVANT (ligne 61-62)
  if not user_id:
      return {"success": True, "jobs": []}

  # APRES
  if not user_id:
      raise HTTPException(
          status_code=status.HTTP_401_UNAUTHORIZED,
          detail="Token manquant ou invalide"
      )
  ```
- **Risque** : MOYEN -- le frontend doit gerer le 401 (verifier que le fetch dans le hook gere bien les erreurs HTTP). Verifier `frontend-next/src/app/(dashboard)/saved-jobs/page.tsx` et les hooks associes.
- **Test** : `curl -X GET https://huntzenjobs-production.up.railway.app/api/saved-jobs` doit retourner 401

### FIX 1.2 -- Upload CV sans validation MIME/extension/taille

- **Fichier** : `backend/src/api/routes/cv_analysis.py` ligne 125-132
- **Probleme** : L'endpoint `/api/cv/async` accepte n'importe quel fichier sans verification
- **Changement** : Ajouter validation AVANT le traitement dans `analyze_cv_async()` :
  ```python
  # Apres la ligne 127 (file: Optional[UploadFile] = File(None))
  # Ajouter validation si file est present :
  ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}
  ALLOWED_MIMES = {"application/pdf", "application/msword",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
  MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

  if file:
      # Verifier extension
      ext = os.path.splitext(file.filename or "")[1].lower()
      if ext not in ALLOWED_EXTENSIONS:
          raise HTTPException(status_code=422, detail=f"Format non supporte: {ext}. Formats acceptes: PDF, DOC, DOCX")

      # Verifier MIME type
      if file.content_type and file.content_type not in ALLOWED_MIMES:
          raise HTTPException(status_code=422, detail="Type de fichier non supporte")

      # Verifier taille
      content = await file.read()
      if len(content) > MAX_FILE_SIZE:
          raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 MB)")
      await file.seek(0)  # Rembobiner pour le traitement
  ```
- **Risque** : FAIBLE -- validation additionnelle, ne casse pas l'existant
- **Test** : Uploader un .exe, un fichier > 10MB, un fichier vide

### FIX 1.3 -- Rate limiting absent sur endpoints Stripe critiques

- **Fichier** : `backend/src/api/routes/stripe.py` lignes 21-26
- **Probleme** : `create-checkout-session` et `cancel-subscription` sans `@limiter.limit`
- **Changement** : Ajouter `request: Request` en parametre et `@limiter.limit` :
  ```python
  @router.post("/create-checkout-session")
  @limiter.limit("5/minute")
  async def create_stripe_checkout(
      request: Request,  # AJOUTER
      plan_name: str = Form(...),
      ...
  ```
  Idem pour `cancel-subscription` avec `@limiter.limit("3/minute")`
- **Risque** : FAIBLE -- protection additive
- **Test** : Envoyer 6 requetes en 1 minute, la 6e doit retourner 429

### FIX 1.4 -- Rate limit absent sur CV upload async

- **Fichier** : `backend/src/api/routes/cv_analysis.py` ligne 125
- **Probleme** : Endpoint `/async` sans rate limit
- **Changement** : Ajouter `@limiter.limit("10/minute")` et `request: Request` en parametre
- **Risque** : FAIBLE

### FIX 1.5 -- Endpoint test-debug expose hash commit publiquement

- **Fichier** : `backend/src/api/routes/auth.py` ligne 24-30
- **Probleme** : Expose le hash commit via subprocess, publiquement accessible, et retourne "unknown" en Docker
- **Changement** : Deux options :
  - Option A (recommandee) : Rendre l'endpoint accessible uniquement en dev/staging
    ```python
    @router.get("/api/auth/test-debug")
    async def test_debug():
        if settings.environment == "production":
            return {"status": "ok", "version": settings.app_version}
        # ... garder le reste pour dev/staging
    ```
  - Lire la version depuis `settings.app_version` (variable d'env `APP_VERSION`) au lieu de `subprocess.check_output`
- **Risque** : FAIBLE

### FIX 1.6 -- CORS potentiellement wildcard en prod

- **Fichier** : `backend/src/config/settings.py` ligne 120-121
- **Probleme** : `cors_origins_str` a pour defaut `"*"`
- **Changement** : Verifier la variable `CORS_ORIGINS` sur Railway Dashboard. Si elle est definie correctement (ex: `https://huntzenjobs.com`), pas de changement code. Sinon :
  ```python
  cors_origins_str: str = Field(
      default="https://huntzenjobs.com",
      description="Allowed CORS origins (comma-separated string)",
      validation_alias="CORS_ORIGINS"
  )
  ```
- **Risque** : ELEVE si mal configure -- peut bloquer tout le frontend. Verifier en staging d'abord.
- **Action** : Verifier `CORS_ORIGINS` sur Railway AVANT de changer le code

### FIX 1.7 -- Race condition total_conversions referral

- **Fichier** : `backend/src/services/stripe.py` lignes 695-698
- **Probleme** : SELECT + UPDATE non atomique sur `total_conversions`
- **Changement** : Remplacer par un appel RPC Supabase atomique ou utiliser une requete SQL avec increment :
  ```python
  # AVANT (lignes 695-698)
  conv_count = supabase_client.table("referrals").select("total_conversions") \
      .eq("id", signup["referral_id"]).single().execute().data["total_conversions"]
  supabase_client.table("referrals").update({"total_conversions": conv_count + 1}) \
      .eq("id", signup["referral_id"]).execute()

  # APRES -- utiliser RPC pour increment atomique
  supabase_client.rpc("increment_referral_conversions", {
      "p_referral_id": signup["referral_id"]
  }).execute()
  ```
  Migration SQL a creer :
  ```sql
  CREATE OR REPLACE FUNCTION increment_referral_conversions(p_referral_id uuid)
  RETURNS void AS $$
  BEGIN
      UPDATE referrals
      SET total_conversions = total_conversions + 1
      WHERE id = p_referral_id;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  ```
- **Risque** : MOYEN -- touche le webhook Stripe, tester en staging
- **Migration Supabase** : OUI (nouvelle fonction RPC)
- **Test** : Simuler 2 webhooks simultanement pour le meme referral

---

## SPRINT 2 -- Conformite legale et wording critique (Jour 2)

**Impact scores : Dim10 +30, Dim3 +5**
**Risque global : FAIBLE (wording uniquement)**
**Necessite redeploy Railway : NON**

---

### FIX 2.1 -- Incoherence entite juridique : CGU vs Mentions legales

- **Fichier CGU** : `frontend-next/src/app/terms/page.tsx` ligne 74
  - Mentionne correctement "HUNTZEN, Unipessoal Lda." avec NIPC 516481320
- **Fichier Mentions legales** : `frontend-next/src/app/legal/page.tsx` ligne 75
  - Mentionne "HuntZen SAS" sans SIRET ni capital
- **Changement** : Harmoniser `legal/page.tsx` sur l'entite portugaise :
  ```html
  <!-- AVANT -->
  <p><strong>Raison sociale :</strong> HuntZen SAS</p>
  <p><strong>Siege social :</strong> France</p>

  <!-- APRES -->
  <p><strong>Raison sociale :</strong> HUNTZEN, Unipessoal Lda.</p>
  <p><strong>Forme juridique :</strong> Sociedade Unipessoal por Quotas</p>
  <p><strong>Capital social :</strong> 15 000,00 EUR</p>
  <p><strong>Siege social :</strong> Rua dos Lusiadas 5 5b, 1300-365 Lisboa, Portugal</p>
  <p><strong>Numero d'immatriculation (NIPC) :</strong> 516481320</p>
  <p><strong>Directeur de publication :</strong> Wissem Jegham</p>
  ```
  Egalement mettre a jour dans `legal/page.tsx` toutes les references a "HuntZen SAS" (lignes 137, 143, 155, 156, 162) vers "HUNTZEN, Unipessoal Lda."
- **Risque** : AUCUN

### FIX 2.2 -- Emails contact incoherents : huntzenjobs.co vs .com

- **Fichier** : `backend/src/services/email.py` ligne 1134
- **Probleme** : `"to": ["contact@huntzenjobs.co"]` au lieu de `.com`
- **Changement** : `"to": ["contact@huntzenjobs.com"]`
- **Risque** : AUCUN -- les emails de contact partaient au mauvais domaine
- **Necessite redeploy Railway** : OUI (mais grouper avec sprint 1)

### FIX 2.3 -- FAQ : affirmations non implementees

- **Fichier** : `frontend-next/src/app/faq/faq-data.ts`
- **Problemes** :
  - Ligne 73 : "postuler en 1 clic" -- feature inexistante
  - Ligne 103 : "7 jours d'essai gratuit du plan Pro" -- non implemente
  - Ligne 111 : "garantie 14 jours satisfait ou rembourse" -- non implemente
- **Changement** :
  - Ligne 73 : Remplacer par "HuntZen Jobs vous permet de preparer votre candidature avec un CV optimise et une lettre de motivation generee par IA. Pour chaque offre sur HuntZen, vous pouvez adapter votre CV en un clic."
  - Ligne 103 : Supprimer "HuntZen Jobs offre aussi 7 jours d'essai gratuit du plan Pro." de la reponse
  - Ligne 111 : Remplacer par "Vous pouvez annuler votre abonnement a tout moment. L'annulation prend effet a la fin de la periode en cours."
- **Risque** : AUCUN

### FIX 2.4 -- Supprimer les affirmations "N.1 en France"

- **Fichier** : `frontend-next/messages/fr.json`
- **Lignes** : 1742, 1749, 1781, 1789
- **Changement** :
  - `"hero_title"` (1742) : "HuntZen Jobs : Votre Assistant Carriere Intelligent" (retirer "N.1 en France")
  - `"why_subtitle"` (1749) : Remplacer "la plateforme N.1" par "votre plateforme"
  - `"cta_subtitle"` (1781) : Remplacer "la plateforme N.1 en France" par "notre plateforme"
  - `"subtitle"` FAQ (1789) : Remplacer "la plateforme N.1 de recherche d'emploi en France" par "la plateforme de recherche d'emploi intelligente"
- **Risque** : AUCUN
- **Reporter dans** : `messages/en.json`, `messages/es.json`, `messages/pt.json` les equivalents

### FIX 2.5 -- Remplacer "+100 000 candidats" par formulation honnete

- **Fichiers** : `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/pt.json`
- **Lignes FR** : 28, 171, 245, 248, 1747, 1751, 1806
- **Changement** : Remplacer toutes les occurrences de "+100 000 candidats" par "Des milliers de candidats" / "Thousands of candidates" et "+100 000 offres" par "Des milliers d'offres d'emploi en France" / "Thousands of job listings in France"
- **Liste complete des cles a modifier** :
  - `home.socialProof` : "Des milliers de candidats nous font confiance"
  - `home.stats[N].value` (valeur "+ 100 000") : changer stat label/value pour un nombre verifiable OU retirer la stat
  - `home.ctaSubtitle` : retirer la reference au nombre
  - `about.who_p3` : "agrege des milliers d'offres" au lieu de "plus de 100 000"
  - `about.feature1_desc` : "agrege des milliers d'offres" au lieu de "+100 000"
  - `about.ctaSubtitle` : retirer le nombre
- **Risque** : AUCUN

### FIX 2.6 -- Garantie 14 jours et pricing "satisfait ou rembourse"

- **Fichiers** :
  - `messages/fr.json` ligne 522 : `"guarantee": "Satisfait ou rembourse pendant 14 jours"`
  - `messages/fr.json` ligne 288 : FAQ reponse remboursement
  - `messages/en.json` lignes 242-243 : FAQ refund
  - `frontend-next/src/components/cv/cv-upload-async.tsx` ligne 678
  - `frontend-next/src/components/auth/unlock-overlay.tsx` ligne 189
- **Changement** : Remplacer toutes les mentions de "satisfait ou rembourse" et "14 jours" par "Annulation possible a tout moment" / "Cancel anytime"
- **Risque** : AUCUN

### FIX 2.7 -- Mentions legales incompletes

- **Fichier** : `frontend-next/src/app/legal/page.tsx`
- **Probleme** : Pas de SIRET (normal si entite portugaise), pas de capital, pas d'adresse
- **Changement** : Deja couvert par FIX 2.1. Verifier que TOUTES les sections de la page sont coherentes avec l'entite Lda.
- **Risque** : AUCUN

---

## SPRINT 3 -- I18N pages legales et cookie banner (Jour 3)

**Impact scores : Dim3 +15, Dim10 +5, Dim2 +2**
**Risque global : FAIBLE**
**Necessite redeploy Railway : NON**

---

### FIX 3.1 -- Pages legales 100% hardcodees FR

- **Fichiers** :
  - `frontend-next/src/app/terms/page.tsx` (100% hardcode FR, ~400 lignes)
  - `frontend-next/src/app/privacy/page.tsx` (100% hardcode FR)
  - `frontend-next/src/app/legal/page.tsx` (100% hardcode FR)
- **Changement** : Pour chaque page :
  1. Ajouter `useTranslations("legal")` / `useTranslations("terms")` / `useTranslations("privacy")`
  2. Creer les cles dans `messages/fr.json` et `messages/en.json` sous les namespaces `legal`, `terms`, `privacy`
  3. Remplacer chaque string hardcode par `t("cle")`
- **Structure cles suggeree** (`terms` comme exemple) :
  ```json
  "terms": {
    "title": "Conditions Generales",
    "subtitle": "Les regles d'utilisation de notre plateforme...",
    "section1_title": "Objet",
    "section1_content": "...",
    "section2_title": "Inscription",
    "section2_content": "...",
    ...
  }
  ```
- **Risque** : FAIBLE -- ne change pas le comportement, juste i18n
- **Estimation** : ~2h par page (beaucoup de texte a externaliser)

### FIX 3.2 -- Cookie banner : textes hardcodes + refus non effectif

- **Fichier** : `frontend-next/src/components/layout/cookie-banner.tsx`
- **Probleme 1** : Textes hardcodes FR (lignes 49-57, 69, 76, 81)
- **Probleme 2** : Le refus stocke "declined" en localStorage mais ne desactive rien (Sentry, analytics, etc.)
- **Changement 1 -- i18n** :
  ```typescript
  const t = useTranslations("cookies")
  // Remplacer tous les textes hardcodes par t("...")
  ```
  Cles a ajouter dans `messages/fr.json` et `messages/en.json` :
  ```json
  "cookies": {
    "message": "Nous utilisons des cookies pour ameliorer votre experience sur HuntZen Jobs. Les cookies essentiels sont necessaires au fonctionnement du site.",
    "learnMore": "En savoir plus",
    "decline": "Refuser",
    "accept": "Accepter",
    "close": "Fermer"
  }
  ```
- **Changement 2 -- Refus effectif** :
  - Dans `handleDecline()`, ajouter la suppression des cookies non essentiels
  - Dans le root layout (`layout.tsx`), conditionner le chargement Sentry au consentement :
    ```typescript
    // Verifier le consentement avant d'initialiser Sentry
    if (typeof window !== 'undefined') {
      const consent = localStorage.getItem('huntzen_cookie_consent')
      if (consent === 'declined') {
        // Ne pas initialiser Sentry
        // Desactiver les trackers analytiques
      }
    }
    ```
  - Dans `sentry.client.config.ts`, wrapper l'initialisation par une verification du consentement
- **Risque** : MOYEN -- impacte Sentry (monitoring en prod). S'assurer que Sentry est bien initialise si consent=accepted ou non encore repondu.

### FIX 3.3 -- Footer dashboard hardcode FR

- **Fichier** : `frontend-next/src/app/(dashboard)/layout.tsx` lignes 46-57
- **Changement** :
  ```typescript
  // Convertir en Client Component wrapper OU passer les traductions en props
  // Option : creer un composant DashboardFooter client
  ```
  Cles a ajouter :
  ```json
  "dashboard": {
    "footer": {
      "privacy": "Confidentialite",
      "terms": "CGU",
      "contact": "Contact"
    }
  }
  ```
  Remplacer les strings hardcodes lignes 48, 52, 56 par `t("dashboard.footer.privacy")` etc.
- **Risque** : FAIBLE
- **Note** : Le layout est un Server Component. Utiliser `getTranslations` de `next-intl/server` ou creer un petit composant client pour le footer.

### FIX 3.4 -- dialog.tsx sr-only "Close" en anglais

- **Fichier** : `frontend-next/src/components/ui/dialog.tsx`
- **Probleme** : Le texte sr-only "Close" est en anglais hardcode
- **Changement** : Comme c'est un composant primitif UI (shadcn), le plus simple est d'ajouter un `aria-label` conditionnel. Cependant, les composants ui/ n'utilisent generalement pas `useTranslations`. Solution pragmatique :
  ```typescript
  <span className="sr-only">Close</span>
  // Remplacer par :
  <span className="sr-only">{t?.("close") ?? "Close"}</span>
  ```
  Ou plus simplement, accepter le texte bilingue en sr-only (les screen readers gerent bien).
  **Decision** : Laisser "Close" car c'est un standard sr-only compris internationalement. Marquer comme WONTFIX.
- **Risque** : AUCUN

### FIX 3.5 -- Harmoniser tutoiement/vouvoiement (74 tu vs 104 vous)

- **Fichiers** : `messages/fr.json` principalement
- **Changement** : Passer en revue toutes les cles FR contenant "tu ", "ton ", "ta ", "tes ", "te " et les remplacer par le vouvoiement ("vous", "votre", "vos")
- **Methode** :
  ```bash
  grep -n '".*\btu\b\|ton\b\|ta\b\|tes\b\|te\b' messages/fr.json
  ```
  Puis remplacer manuellement chaque occurrence en contexte.
- **Estimation** : 74 occurrences a modifier
- **Risque** : FAIBLE -- attention aux faux positifs ("tout", "tutoriel", etc.)

### FIX 3.6 -- Placeholders francais en version EN

- **Fichier** : `messages/en.json`
- **Probleme** : Placeholders "Marie Dupont", "+33 6 12 34 56 78", "Jean Dupont" dans la version anglaise
- **Changement** : Remplacer par des equivalents anglais :
  - "Marie Dupont" -> "Jane Smith"
  - "+33 6 12 34 56 78" -> "+1 555 123 4567"
  - "Jean Dupont" -> "John Smith"
- **Risque** : AUCUN

### FIX 3.7 -- 216 cles manquantes en ES et PT

- **Fichiers** : `messages/es.json`, `messages/pt.json`
- **Changement** : Lancer `npm run sync-translations` depuis la racine pour synchroniser les cles. Puis traduire manuellement ou par script les cles ajoutees (valeurs EN comme fallback acceptable en v1).
- **Risque** : AUCUN
- **Estimation** : 1h (sync auto + review)

---

## SPRINT 4 -- I18N strings hardcodes composants (Jour 4)

**Impact scores : Dim3 +25**
**Risque global : FAIBLE**
**Necessite redeploy Railway : NON**

---

### FIX 4.1 -- Strings hardcodes dans les composants (lot principal ~200 strings)

**Methode** : Pour chaque fichier liste, ajouter `useTranslations()` et externaliser les strings dans `messages/fr.json` et `messages/en.json`.

#### Fichiers priorite HAUTE (composants visibles par tous les users) :

| # | Fichier | Strings estimes | Namespace i18n |
|---|---------|----------------|----------------|
| 1 | `components/cv/cv-upload-async.tsx` | ~15 | `cv.upload` |
| 2 | `components/cv/cv-upload-async-wizard.tsx` | ~10 | `cv.wizard` |
| 3 | `components/jobs/search-form-inline.tsx` | ~8 | `jobs.search` |
| 4 | `components/jobs/job-details-modal.tsx` | ~12 | `jobs.details` |
| 5 | `components/jobs/jobs-placeholder.tsx` | ~5 | `jobs.placeholder` |
| 6 | `components/jobs/blurred-job-card.tsx` | ~5 | `jobs.blurred` |
| 7 | `components/jobs/results-accordion.tsx` | ~8 | `jobs.results` |
| 8 | `components/freemium/conversion-popups.tsx` | ~20 | `freemium.popups` |
| 9 | `components/auth/unlock-overlay.tsx` | ~8 | `auth.unlock` |
| 10 | `components/notifications/notification-bell.tsx` + `notification-center.tsx` | ~10 | `notifications` |
| 11 | `components/career-score/career-score-card.tsx` | ~10 | `careerScore` |
| 12 | `components/coach/quick-questions-drawer.tsx` | ~8 | `coach.questions` |
| 13 | `components/coach/export-dialog.tsx` | ~5 | `coach.export` |
| 14 | `components/assistant/bot-selector.tsx` | ~5 | `assistant.bots` |
| 15 | `components/layout/theme-toggle.tsx` | ~3 | `layout.theme` |
| 16 | `app/(dashboard)/profile/page.tsx` (profile-form, settings-section) | ~15 | `profile` |
| 17 | `components/cv/cv-comparison.tsx` | ~8 | `cv.comparison` |
| 18 | `components/cv/actionable-suggestions.tsx` | ~8 | `cv.suggestions` |
| 19 | `components/support/support-widget.tsx` | ~5 | `support` |
| 20 | `components/auth/auth-layout.tsx` | ~3 | `auth.layout` |
| 21 | `app/contact/page.tsx` (hero + labels + options) | ~10 | `contact` |

#### Fichiers priorite BASSE (admin, peu visible) :

| # | Fichier | Action |
|---|---------|--------|
| 1 | `app/admin/**/*.tsx` (~300 strings) | Reporter a Sprint 8 (admin interne) |

#### Pour chaque fichier ci-dessus, le process est :

1. Identifier tous les strings visibles (texte, placeholder, aria-label, title, alt)
2. Creer les cles dans `messages/fr.json` sous le namespace indique
3. Creer les cles equivalentes dans `messages/en.json`
4. Ajouter `import { useTranslations } from "next-intl"` en haut du fichier
5. Remplacer chaque string par `t("cle")`
6. Verifier que le composant a bien `"use client"` si `useTranslations` est utilise

- **Risque** : FAIBLE par fichier, mais volume important. Tester chaque composant apres modification.
- **Estimation** : 4-5h (c'est le sprint le plus long)

### FIX 4.2 -- Faute "verrouillee" dans blurred-job-card.tsx

- **Fichier** : `frontend-next/src/components/jobs/blurred-job-card.tsx`
- **Changement** : Lors de l'externalisation i18n (FIX 4.1), ecrire "verrouill**e**e" correctement dans la cle FR
- **Risque** : AUCUN

### FIX 4.3 -- SEO structured-data.tsx descriptions FR hardcodees

- **Fichier** : `frontend-next/src/components/seo/structured-data.tsx`
- **Probleme** : Descriptions JSON-LD en francais hardcode
- **Changement** : Les structured data doivent rester en francais (langue principale du site) pour le SEO FR. MAIS ajouter un commentaire expliquant pourquoi c'est hardcode.
- **Alternative** : Si multi-langue SEO est souhaite, passer les descriptions via props depuis la page parente qui a acces a `getTranslations`.
- **Decision** : Garder hardcode FR pour v1, ajouter TODO pour v2 multi-langue SEO.
- **Risque** : AUCUN

### FIX 4.4 -- internal-links.tsx tout en FR hardcode

- **Fichier** : `frontend-next/src/components/seo/internal-links.tsx`
- **Probleme** : Liens internes avec labels FR hardcodes
- **Changement** : Externaliser dans `messages/fr.json` et `messages/en.json` sous namespace `seo.links`
- **Risque** : FAIBLE

### FIX 4.5 -- aria-label hardcodes FR

- **Fichiers** : Multiples composants avec `aria-label="Fermer"`, `aria-label="Effacer"`, `aria-label="Recalculer"`, `aria-label="Notifications"`
- **Changement** : Lors de l'externalisation i18n de chaque composant (FIX 4.1), inclure les aria-labels dans les cles i18n :
  ```json
  "a11y": {
    "close": "Fermer",
    "clear": "Effacer",
    "recalculate": "Recalculer",
    "notifications": "Notifications"
  }
  ```
- **Risque** : AUCUN

### FIX 4.6 -- 5 cles orphelines "essential" dans EN absentes de FR

- **Fichiers** : `messages/en.json` et `messages/fr.json`
- **Changement** : Identifier les 5 cles presentes en EN mais absentes de FR, les ajouter dans FR
- **Methode** : Script de comparaison de cles JSON ou `npm run sync-translations`
- **Risque** : AUCUN

---

## SPRINT 5 -- Interface UI, accessibilite et error handling (Jour 5)

**Impact scores : Dim2 +20, Dim8 +15**
**Risque global : FAIBLE a MOYEN**
**Necessite redeploy Railway : NON**

---

### FIX 5.1 -- 3 suppressions sans confirmation

- **Fichier 1** : `frontend-next/src/app/(dashboard)/candidatures/page.tsx` ligne 346
  - **Changement** : Wrapper `deleteApplication(app.id)` dans un dialog de confirmation :
    ```typescript
    const handleDelete = (id: string) => {
      if (window.confirm(t("confirmDelete"))) {
        deleteApplication(id)
      }
    }
    ```
    Ou mieux : utiliser un composant AlertDialog de shadcn/ui
- **Fichier 2** : `frontend-next/src/app/(dashboard)/documents/page.tsx` -- deleteDocument
  - **Changement** : Meme pattern, ajouter AlertDialog avant suppression
- **Fichier 3** : `frontend-next/src/app/(dashboard)/documents/page.tsx` -- handleDeleteProfile
  - **Changement** : Meme pattern
- **Risque** : FAIBLE
- **Cles i18n** : `"confirmDelete": "Etes-vous sur de vouloir supprimer cet element ?"`, `"confirmDeleteProfile": "Etes-vous sur de vouloir supprimer ce profil ?"`

### FIX 5.2 -- Creer not-found.tsx (page 404 custom)

- **Fichier a creer** : `frontend-next/src/app/not-found.tsx`
- **Changement** :
  ```typescript
  import Link from "next/link"
  import { useTranslations } from "next-intl"

  export default function NotFound() {
    // Server Component -- utiliser getTranslations
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-6xl font-black text-ocean mb-4">404</h1>
          <p className="text-xl text-gray-600 mb-8">{/* i18n */}</p>
          <Link href="/" className="...">Retour a l'accueil</Link>
        </div>
      </div>
    )
  }
  ```
  Cles i18n :
  ```json
  "notFound": {
    "title": "Page introuvable",
    "description": "La page que vous cherchez n'existe pas ou a ete deplacee.",
    "backHome": "Retour a l'accueil"
  }
  ```
- **Risque** : AUCUN (nouveau fichier)

### FIX 5.3 -- console.log inconditionnels

- **Fichiers et lignes** :
  - `frontend-next/src/lib/feature-flags.ts` lignes 308-317 (4 console.log)
  - `frontend-next/src/app/api/cron/reset-quotas/route.ts` (console.log/error)
  - `frontend-next/src/app/api/cron/retention-notifications/route.ts` (console.log/error)
  - `frontend-next/sentry.client.config.ts` lignes 71, 123, 125
  - `frontend-next/src/app/api/security-alerts/route.ts` (1 console.log)
- **Changement** :
  - `feature-flags.ts` : Supprimer les 4 console.log (lignes 308-317) ou les wrapper dans `if (process.env.NODE_ENV === "development")`
  - Cron routes : Garder les logs (utiles pour debug Vercel crons) mais prefixer avec `[Cron]` et garder coherent
  - `sentry.client.config.ts` ligne 71 : Supprimer le `console.log('[Sentry] Event would be sent:', event)` dans le `beforeSend` en prod
  - `sentry.client.config.ts` lignes 123, 125 : Wrapper dans `if (process.env.NODE_ENV === "development")`
- **Risque** : FAIBLE

### FIX 5.4 -- alert() natif dans admin/stress/page.tsx

- **Fichier** : `frontend-next/src/app/admin/stress/page.tsx` ligne 192
- **Changement** : Remplacer `alert()` par `toast()` (sonner est deja installe)
  ```typescript
  import { toast } from "sonner"
  // Remplacer alert("message") par toast.error("message") ou toast.success("message")
  ```
- **Risque** : AUCUN (page admin)

### FIX 5.5 -- window.location.href vers /signup et /pricing

- **Fichier** : `frontend-next/src/components/cv/cv-upload-async.tsx` lignes 518, 524
- **Changement** :
  ```typescript
  // AVANT
  onClick={() => (window.location.href = "/signup")}
  onClick={() => (window.location.href = "/pricing")}

  // APRES
  import { useRouter } from "next/navigation"
  const router = useRouter()
  onClick={() => router.push("/signup")}
  onClick={() => router.push("/pricing")}
  ```
- **Fichier** : `frontend-next/src/components/cv/cv-upload-async-wizard.tsx` ligne 212
  - Meme changement pour `/login?reason=session_expired`
- **Risque** : FAIBLE

### FIX 5.6 -- `<a href="/jobs">` brut dans candidatures

- **Fichier** : `frontend-next/src/app/(dashboard)/candidatures/page.tsx` ligne 259
- **Changement** : Remplacer par `<Link href="/jobs">` de `next/link`
- **Risque** : AUCUN

### FIX 5.7 -- Heading hierarchy cassee sur 8+ pages

- **Fichiers et changements** :
  - `/login/page.tsx` : Ajouter un `<h1>` sr-only ou visible
  - `/signup/page.tsx` : Ajouter un `<h1>` sr-only ou visible
  - `/pricing/page.tsx` : Verifier qu'il y a un `<h1>` (possiblement dans un composant enfant)
  - `/contact/page.tsx` : Corriger h1 > h3 en h1 > h2
  - `/temoignages/page.tsx` : Corriger h1 > h3 en h1 > h2
  - `(dashboard)/assistant/page.tsx` : Corriger h1 > h3 en h1 > h2
  - `(dashboard)/salons/page.tsx` : Corriger h1 > h3 en h1 > h2
  - `(dashboard)/documents/page.tsx` : Ajouter un `<h1>`
  - `(dashboard)/recruiter-contact/page.tsx` : Ajouter un `<h1>`
- **Risque** : FAIBLE -- changements de structure HTML seulement

### FIX 5.8 -- Skip link non fonctionnel sur pages publiques

- **Fichier** : `frontend-next/src/app/layout.tsx`
- **Probleme** : Le SkipLink pointe vers `#main-content` mais seul le dashboard layout a `id="main-content"`. Les pages publiques n'ont pas cet id.
- **Changement** : Ajouter `id="main-content"` sur le `<main>` ou conteneur principal dans :
  - Le root layout (`layout.tsx`) ou
  - Chaque page publique individuellement
  Recommandation : ajouter dans le root layout un wrapper :
  ```tsx
  <main id="main-content">
    {children}
  </main>
  ```
  Attention : le dashboard layout a deja `id="main-content"` sur son `<main>` -- eviter la duplication. Solution : mettre l'id dans le root layout et retirer du dashboard layout, OU verifier que le SkipLink cible le bon id selon le contexte.
- **Risque** : FAIBLE

### FIX 5.9 -- 4 inputs sans label

- **Fichiers** :
  - `frontend-next/src/app/temoignages/testimonials-client.tsx` (3 inputs)
  - `frontend-next/src/components/support/support-chatbot.tsx` (1 input)
- **Changement** : Ajouter `aria-label` ou `<label>` associe a chaque input
- **Risque** : AUCUN

### FIX 5.10 -- Pas d'aria-live sur resultats dynamiques

- **Fichiers** :
  - `frontend-next/src/app/(dashboard)/jobs/page.tsx` : Ajouter `aria-live="polite"` sur le conteneur de resultats de recherche
  - Chat assistant : Ajouter `aria-live="polite"` sur le conteneur de messages
  - Notifications : Ajouter `aria-live="assertive"` sur le centre de notifications
- **Risque** : AUCUN

### FIX 5.11 -- Sidebar sans aria-current="page"

- **Fichier** : `frontend-next/src/components/layout/sidebar.tsx`
- **Changement** : Ajouter `aria-current="page"` sur le lien actif (celui qui correspond au pathname courant)
  ```typescript
  // Dans le rendu des liens de navigation
  aria-current={isActive ? "page" : undefined}
  ```
- **Risque** : AUCUN

### FIX 5.12 -- Contraste insuffisant

- **Fichiers concernes** :
  - Classes `text-white/50` (~3:1 contraste) : remplacer par `text-white/70` minimum
  - Classes `text-gray-300` sur fond clair : remplacer par `text-gray-500` minimum
  - Pages concernees : `legal/page.tsx`, `privacy/page.tsx`, `bot-selector.tsx`, `onboarding/`
- **Changement** : Pour chaque occurrence, augmenter l'opacite ou assombrir le texte pour atteindre WCAG AA (4.5:1)
- **Risque** : FAIBLE -- changements visuels mineurs

### FIX 5.13 -- 2 overlays div onClick sans gestion clavier

- **Probleme** : Des `<div onClick>` utilisees comme overlays de fermeture de modaux sans `onKeyDown` ni `role="button"` ni `tabIndex`
- **Changement** : Ajouter `role="presentation"` sur les overlays (car ils ne sont pas des boutons interactifs, juste des zones de fermeture). Ou ajouter `onKeyDown` pour la touche Escape.
- **Risque** : AUCUN

### FIX 5.14 -- 0 aria-label dans composants landing

- **Fichiers** : Composants de la landing page (`page.tsx` racine et ses sous-composants)
- **Changement** : Ajouter `aria-label` sur les sections, les CTA principaux, les images decoratives (`alt=""`)
- **Risque** : AUCUN

---

## SPRINT 6 -- API, integrations et performance (Jour 6)

**Impact scores : Dim1 +4, Dim6 +18, Dim7 +12**
**Risque global : MOYEN**
**Necessite redeploy Railway : OUI**

---

### FIX 6.1 -- Cache Redis sur recherche d'emploi

- **Fichier** : `backend/src/api/routes/jobs.py`
- **Probleme** : Temps de reponse 20.9s, pas de cache Redis
- **Changement** : Ajouter un cache Redis avec TTL de 2h sur les resultats de recherche :
  ```python
  from src.utils.cache import get_redis
  import json
  import hashlib

  async def search_jobs(...):
      # Generer cle de cache
      cache_key = f"jobs:{hashlib.md5(f'{job_title}:{location}:{country}'.encode()).hexdigest()}"
      redis = await get_redis()

      # Verifier cache
      cached = await redis.get(cache_key)
      if cached:
          return json.loads(cached)

      # ... logique existante ...

      # Stocker en cache (TTL 2h)
      await redis.setex(cache_key, 7200, json.dumps(result))
      return result
  ```
- **Risque** : MOYEN -- tester que la serialisation JSON fonctionne avec tous les types de resultats
- **Test** : Lancer 2 recherches identiques, la 2e doit etre < 1s

### FIX 6.2 -- Email confirmation paiement Stripe

- **Fichier** : `backend/src/services/stripe.py` (dans le handler `checkout.session.completed`)
- **Changement** : Apres la mise a jour de `user_subscriptions`, ajouter un appel a :
  ```python
  from src.services.email import send_payment_confirmation_email
  await send_payment_confirmation_email(user_email, plan_name, amount)
  ```
  Creer la fonction dans `backend/src/services/email.py` avec template HTML Resend.
- **Risque** : FAIBLE -- additif
- **Cles i18n email** : Pas necessaire cote frontend, c'est un email backend

### FIX 6.3 -- Email paiement echoue

- **Fichier** : `backend/src/services/stripe.py` (ajouter handler `invoice.payment_failed`)
- **Changement** : Gerer l'event `invoice.payment_failed` et envoyer un email :
  ```python
  elif event_type == "invoice.payment_failed":
      invoice = event.data.object
      customer_email = invoice.get("customer_email")
      if customer_email:
          await send_payment_failed_email(customer_email)
  ```
- **Risque** : FAIBLE

### FIX 6.4 -- Email annulation abonnement

- **Fichier** : `backend/src/services/stripe.py` (dans le handler `customer.subscription.deleted` ou le endpoint cancel)
- **Changement** : Apres l'annulation, envoyer un email de confirmation d'annulation
- **Risque** : FAIBLE

### FIX 6.5 -- invoice.paid non gere

- **Fichier** : `backend/src/services/stripe.py`
- **Changement** : Ajouter handler pour `invoice.paid` :
  ```python
  elif event_type == "invoice.paid":
      # Notification de renouvellement
      invoice = event.data.object
      customer_email = invoice.get("customer_email")
      if customer_email and invoice.get("billing_reason") == "subscription_cycle":
          await send_renewal_notification_email(customer_email)
  ```
- **Risque** : FAIBLE

### FIX 6.6 -- Sentry code test en prod

- **Fichier** : `frontend-next/sentry.client.config.ts` lignes 70-73
- **Changement** :
  ```typescript
  // AVANT (ligne 70-73)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Sentry] Event would be sent:', event)
    // return null // TEMPORARILY COMMENTED for testing - UNCOMMENT after tests
  }

  // APRES
  if (process.env.NODE_ENV === 'development') {
    return null  // Ne pas envoyer d'events en dev
  }
  ```
- **Risque** : FAIBLE

### FIX 6.7 -- has_interview_sim: false sur plan Pro

- **Probleme** : La migration `20260320000001_fix_plan_features_wording.sql` mentionne que Pro a `has_interview_sim` mais la migration `20260317000001_plan_feature_flags.sql` ligne 28 met `false` pour Starter
- **Verification** : Verifier l'etat actuel en DB prod. Si `has_interview_sim` est `false` pour Pro :
  ```sql
  UPDATE subscription_plans
  SET features = jsonb_set(features, '{has_interview_sim}', 'true')
  WHERE slug = 'accelerateur';
  ```
  MAIS : le simulateur d'entretien n'est pas encore active (`ENABLE_INTERVIEW_SIMULATOR=false`). Donc mettre `false` pour tous les plans est coherent tant que la feature n'est pas live.
- **Decision** : Retirer "Simulation d'entretien IA" de la description du plan Pro dans la DB et le frontend jusqu'a ce que la feature soit activee.
- **Migration Supabase** : OUI
- **Risque** : FAIBLE

### FIX 6.8 -- Token France Travail non cache

- **Fichier** : `backend/src/services/job_providers/france_travail.py` (ou equivalent)
- **Changement** : Cacher le token d'acces France Travail en Redis avec TTL = `expires_in - 60` secondes
- **Risque** : FAIBLE

### FIX 6.9 -- JSearch retourne [] sur 429 sans retry

- **Fichier** : Provider JSearch dans `backend/src/services/job_providers/`
- **Changement** : Ajouter retry exponentiel avec backoff :
  ```python
  import asyncio

  async def fetch_with_retry(url, headers, max_retries=3):
      for attempt in range(max_retries):
          response = await httpx.get(url, headers=headers)
          if response.status_code == 429:
              wait_time = 2 ** attempt  # 1s, 2s, 4s
              await asyncio.sleep(wait_time)
              continue
          return response
      return response  # Retourner la derniere reponse meme si 429
  ```
- **Risque** : FAIBLE
- **Appliquer aussi a** : Tous les autres providers (Adzuna, SerpAPI, RemoteOK)

### FIX 6.10 -- anonymous_id residuel dans get_cv_analysis_status()

- **Fichier** : `backend/src/api/routes/cv_analysis.py` lignes 196, 207, 230
- **Changement** : Si `anonymous_id` n'est plus utilise, le retirer de l'endpoint. Si encore utilise pour les users non connectes, documenter le pourquoi.
- **Risque** : MOYEN -- verifier que le frontend ne passe plus ce parametre

### FIX 6.11 -- events.py response_model=dict inutile

- **Fichier** : `backend/src/api/routes/events.py` lignes 14, 47, 80, 103, 124
- **Changement** : Retirer `response_model=dict` (inutile, dict est le defaut FastAPI)
  ```python
  # AVANT
  @router.get("/search", response_model=dict)
  # APRES
  @router.get("/search")
  ```
- **Risque** : AUCUN

### FIX 6.12 -- Email contact hardcode FR (send_contact_confirmation)

- **Fichier** : `backend/src/services/email.py` (fonction send_contact_confirmation)
- **Changement** : Accepter un parametre `language` et adapter le template email selon la langue du user
- **Risque** : FAIBLE

### FIX 6.13 -- Crons job-alerts et weekly-summary sans auth backend

- **Fichiers** :
  - `frontend-next/src/app/api/cron/job-alerts/route.ts`
  - `frontend-next/src/app/api/cron/weekly-summary/route.ts`
- **Probleme** : Ces crons appellent le backend (ou Supabase directement) sans passer de Bearer token au backend
- **Changement** : Si ces crons appellent le backend, ajouter le header `authorization: Bearer ${CRON_SECRET}` dans les fetch vers le backend. Si ils font tout en Supabase direct (service_role_key), c'est ok.
- **Risque** : FAIBLE

### FIX 6.14 -- catch {} vides dans crons

- **Fichiers** :
  - `frontend-next/src/app/api/cron/job-alerts/route.ts` ligne 41
  - `frontend-next/src/app/api/cron/weekly-summary/route.ts` ligne 40
- **Changement** :
  ```typescript
  // AVANT
  } catch {}

  // APRES
  } catch (error) {
    console.error("[Cron] Error processing user:", error)
  }
  ```
- **Risque** : AUCUN

---

## SPRINT 7 -- SEO, performance et base de donnees (Jour 7)

**Impact scores : Dim5 +15, Dim7 +10**
**Risque global : MOYEN**
**Necessite migration Supabase : OUI**

---

### FIX 7.1 -- 0 hreflang dans le HTML

- **Fichier** : `frontend-next/src/app/layout.tsx` (dans le `<head>`)
- **Changement** : Ajouter les balises hreflang :
  ```tsx
  <head>
    <link rel="alternate" hrefLang="fr" href="https://huntzenjobs.com" />
    <link rel="alternate" hrefLang="en" href="https://huntzenjobs.com" />
    <link rel="alternate" hrefLang="es" href="https://huntzenjobs.com" />
    <link rel="alternate" hrefLang="pt" href="https://huntzenjobs.com" />
    <link rel="alternate" hrefLang="x-default" href="https://huntzenjobs.com" />
  </head>
  ```
  Note : Comme HuntZen n'utilise pas de prefixe de langue dans l'URL (`/fr/`, `/en/`), tous les hreflang pointent vers la meme URL. C'est semantiquement correct : ca indique que le site gere plusieurs langues sur la meme URL.
- **Risque** : AUCUN

### FIX 7.2 -- OG image fallback 404

- **Fichier** : `frontend-next/public/og-image.svg` existe mais pas `og-image.png`
- **Probleme** : Si des services (WhatsApp, Twitter) cherchent `og-image.png`, ils obtiennent 404
- **Changement** : Le fichier `opengraph-image.tsx` dans `src/app/` genere dynamiquement l'OG image. Verifier qu'il fonctionne. Si des references a `og-image.png` existent dans les metadata, les remplacer par le chemin dynamique ou creer un `og-image.png` statique depuis le SVG.
- **Action** : Convertir `public/og-image.svg` en `public/og-image.png` (1200x630px) comme fallback statique
- **Risque** : AUCUN

### FIX 7.3 -- Pages /contact et /legal absentes du sitemap

- **Fichier** : `frontend-next/src/app/sitemap.ts`
- **Changement** : Ajouter dans `staticPages` :
  ```typescript
  {
    url: `${SITE_URL}/contact`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    url: `${SITE_URL}/legal`,
    lastModified: new Date(),
    changeFrequency: "yearly",
    priority: 0.3,
  },
  ```
- **Risque** : AUCUN

### FIX 7.4 -- Sitemap sans variantes linguistiques

- **Fichier** : `frontend-next/src/app/sitemap.ts`
- **Changement** : Comme le site n'utilise pas de prefixes de langue dans les URLs, les variantes linguistiques ne sont pas necessaires dans le sitemap. Cependant, ajouter un commentaire expliquant cette decision.
- **Risque** : AUCUN

### FIX 7.5 -- 4 fonctions cleanup jamais appelees

- **Fichiers** :
  - Fonctions SQL : `cleanup_old_security_events()`, `cleanup_old_records_rpc()`, `cleanup_expired_cache()`, `cleanup_old_user_sessions()`
  - Ces fonctions existent dans les migrations mais ne sont appelees par aucun cron
- **Changement** :
  1. Creer un nouveau cron Vercel dans `vercel.json` :
     ```json
     { "path": "/api/cron/cleanup", "schedule": "0 3 * * *" }
     ```
  2. Creer le handler `frontend-next/src/app/api/cron/cleanup/route.ts` :
     ```typescript
     export async function GET(request: Request) {
       // Verifier CRON_SECRET
       // Appeler les 4 fonctions RPC Supabase
       await supabase.rpc("cleanup_old_security_events")
       await supabase.rpc("cleanup_expired_cache")
       await supabase.rpc("cleanup_old_user_sessions")
       await supabase.rpc("cleanup_old_records_rpc")
       return NextResponse.json({ success: true })
     }
     ```
- **Risque** : FAIBLE -- les fonctions existent deja, on les appelle juste

### FIX 7.6 -- Index manquant sur user_notifications

- **Migration a creer** : `supabase/migrations/20260321000001_notifications_index.sql`
  ```sql
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_notifications_user_read_created
  ON user_notifications(user_id, is_read, created_at DESC);
  ```
- **Risque** : FAIBLE -- `CONCURRENTLY` ne bloque pas les lectures
- **Migration Supabase** : OUI

### FIX 7.7 -- 6 tables referencent profiles(id) au lieu de auth.users(id)

- **Tables concernees** : `user_feature_overrides`, `user_notifications`, `user_career_score`, `user_xp_events`, `ai_prompts`
- **Probleme** : FK vers `profiles(id)` au lieu de `auth.users(id)`. `profiles` a un trigger ON INSERT depuis `auth.users`, donc ca fonctionne, mais c'est une dependance inutile.
- **Decision** : NE PAS migrer maintenant. La FK vers profiles fonctionne grace au trigger. La migration serait risquee (supprimer FK + en ajouter une nouvelle) pour un gain minimal.
- **Action** : Documenter dans un commentaire SQL et reporter a une migration majeure future.
- **Risque** : AUCUN (on ne change rien)

### FIX 7.8 -- subscription_history.subscription_id sans FK

- **Probleme** : Pas de contrainte FK, risque de donnees orphelines
- **Migration** :
  ```sql
  -- Verifier d'abord qu'il n'y a pas de donnees orphelines
  -- DELETE FROM subscription_history WHERE subscription_id NOT IN (SELECT id FROM user_subscriptions);
  -- ALTER TABLE subscription_history ADD CONSTRAINT fk_subscription_history_subscription
  --   FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id) ON DELETE CASCADE;
  ```
- **Decision** : Reporter -- risque de casser si des donnees orphelines existent. Faire un audit des donnees prod d'abord.
- **Risque** : ELEVE si execute sans verification -- REPORTER

### FIX 7.9 -- Migration cv_profiles dupliquee

- **Fichiers** : `20260227000005` et `20260228000001`
- **Changement** : Verifier que les 2 migrations sont idempotentes (IF NOT EXISTS). Si oui, pas de changement. Si non, ajouter les gardes.
- **Risque** : AUCUN si deja appliquees en prod (ce qui est le cas)

### FIX 7.10 -- Colonne profiles.subscription_tier toujours presente

- **Probleme** : Colonne deprecated mais toujours en DB
- **Decision** : NE PAS supprimer maintenant. Pourrait casser du vieux code. Ajouter un commentaire SQL DEPRECATED et reporter la suppression a une migration majeure.
- **Risque** : AUCUN (on ne change rien)

---

## SPRINT 8 -- Qualite du code et refactoring (Jour 8)

**Impact scores : Dim9 +20, Dim2 +5**
**Risque global : MOYEN a ELEVE**
**Necessite redeploy Railway : OUI (pour ruff fixes)**

---

### FIX 8.1 -- 1501 erreurs Ruff backend (1205 auto-fixables)

- **Commande** :
  ```bash
  cd /Users/wissem/HuntzenIA/huntzen_jobsearch
  ruff check backend/ --ignore E501 --fix
  ```
- **Changement** : Appliquer les 1205 fixes automatiques, puis traiter manuellement les ~296 restantes par lot
- **Risque** : MOYEN -- les auto-fixes sont generalement surs (imports, whitespace, parentheses), mais verifier le diff avant commit
- **Process** :
  1. `ruff check backend/ --ignore E501 --fix` (auto-fix)
  2. `git diff` pour verifier les changements
  3. Lancer les tests `npm run test:backend`
  4. Si tests verts, commit
  5. Traiter les erreurs restantes manuellement (par fichier)

### FIX 8.2 -- God files (ne pas split dans ce sprint)

- **Fichiers** :
  - `frontend-next/src/app/(dashboard)/jobs/page.tsx` (2466 lignes)
  - `backend/src/api/routes/admin.py` (3048 lignes)
- **Decision** : NE PAS split maintenant. Le risque de regression est trop eleve pour un sprint de fixes. Documenter dans un ticket futur "REFACTOR-001 : Split jobs/page.tsx" et "REFACTOR-002 : Split admin.py".
- **Action minimale** : Ajouter un commentaire en tete de fichier documentant les sections :
  ```python
  # admin.py -- God file a refactorer
  # Sections :
  # L1-200   : User management
  # L200-500 : Plan management
  # L500-800 : Analytics
  # ...
  ```
- **Risque** : AUCUN (documentation uniquement)

### FIX 8.3 -- Quasi 0 test frontend

- **Action** : Creer des tests minimaux pour les composants critiques. Au moins 5 fichiers de test :
  1. `__tests__/unit/components/cv/cv-upload-async.test.tsx` -- test render + upload
  2. `__tests__/unit/components/jobs/search-form-inline.test.tsx` -- test render + submit
  3. `__tests__/unit/components/freemium/pricing-modal.test.tsx` -- test render plans
  4. `__tests__/unit/components/layout/sidebar.test.tsx` -- test navigation links
  5. `__tests__/unit/components/layout/cookie-banner.test.tsx` -- test accept/decline
- **Risque** : AUCUN (ajout de fichiers)
- **Estimation** : 2-3h

### FIX 8.4 -- error-boundary.tsx textes hardcodes FR

- **Fichier** : `frontend-next/src/app/error.tsx`
- **Etat actuel** : DEJA i18n ! Le fichier utilise `useTranslations("error")` (verifie dans la lecture). Pas de changement necessaire.
- **Action** : Verifier que les cles `error.title`, `error.description`, `error.retry`, `error.home` existent dans les 4 fichiers de messages. Si manquantes, les ajouter.
- **Risque** : AUCUN

### FIX 8.5 -- conversation-list-item.tsx textes hardcodes FR

- **Fichier** : `frontend-next/src/components/coach/history-sidebar.tsx` (contient le composant conversation-list-item)
- **Changement** : Externaliser les strings lignes 72, 113, 124-131 via `useTranslations("coach.history")`
- **Risque** : FAIBLE

### FIX 8.6 -- Landing page contenu invisible sans JS

- **Probleme** : Tous les composants landing sont en "use client" avec framer-motion, donc invisible sans JS
- **Decision** : C'est un compromis acceptable pour une SPA moderne. Les moteurs de recherche executent le JS. Cependant, pour le SEO :
  - Verifier que `opengraph-image.tsx` genere bien l'image OG (c'est un Server Component)
  - Les metadata sont dans le `layout.tsx` (Server Component) donc visibles sans JS
  - Ajouter `<noscript>` avec un message minimal dans le root layout :
    ```tsx
    <noscript>
      <div style={{padding: '20px', textAlign: 'center'}}>
        HuntZen Jobs necessite JavaScript pour fonctionner.
        Veuillez activer JavaScript dans votre navigateur.
      </div>
    </noscript>
    ```
- **Risque** : AUCUN

### FIX 8.7 -- Pages publiques SEO en "use client"

- **Fichiers** : `/pricing`, `/about`, `/faq`, `/jobs`, `/salons`
- **Probleme** : Ces pages sont en "use client" ce qui empeche le SSR
- **Decision** : Le refactoring vers Server Components serait massif et risque. Reporter.
- **Action minimale** :
  - S'assurer que les `metadata` sont exportees dans chaque `page.tsx` (ou via `generateMetadata`)
  - Si les metadata sont dans le composant client, les deplacer dans un `layout.tsx` ou un wrapper Server Component
- **Risque de refactoring complet** : ELEVE -- reporter a un sprint dedie

### FIX 8.8 -- Cache bloque par auth dans root layout

- **Fichier** : `frontend-next/src/app/layout.tsx` lignes 32-36
- **Probleme** : `supabase.auth.getUser()` force `no-cache` sur toutes les pages, y compris publiques
- **Changement** : Deplacer le `getUser()` dans le dashboard layout uniquement (ou les routes protegees) :
  - Le root layout ne devrait PAS appeler `getUser()`
  - Le dashboard layout peut le faire (il le fait deja via `SubscriptionProvider`)
  - Le root layout passe `user={null}` au `Providers` pour les pages publiques
- **Risque** : MOYEN -- tester que l'auth fonctionne toujours correctement sur les pages protegees
- **Reporter si** : Le risque semble trop eleve. Marquer comme optimisation P2.

### FIX 8.9 -- admin_notes et email_blacklist RLS sans policies

- **Decision** : C'est intentionnel (tables admin-only). Documenter dans un commentaire SQL.
- **Risque** : AUCUN

---

## RECAPITULATIF DES MIGRATIONS SUPABASE

| Sprint | Migration | Description |
|--------|-----------|-------------|
| 1 | `20260321000001_atomic_referral_increment.sql` | Fonction RPC `increment_referral_conversions` |
| 6 | `20260321000002_fix_interview_sim_description.sql` | Retirer "Simulation d'entretien" des descriptions plans |
| 7 | `20260321000003_notifications_index.sql` | Index sur `user_notifications(user_id, is_read, created_at)` |

---

## RECAPITULATIF DES FICHIERS A CREER

| Sprint | Fichier | Description |
|--------|---------|-------------|
| 5 | `frontend-next/src/app/not-found.tsx` | Page 404 custom |
| 7 | `frontend-next/src/app/api/cron/cleanup/route.ts` | Cron cleanup DB |
| 8 | `__tests__/unit/components/cv/cv-upload-async.test.tsx` | Test upload CV |
| 8 | `__tests__/unit/components/jobs/search-form-inline.test.tsx` | Test recherche |
| 8 | `__tests__/unit/components/freemium/pricing-modal.test.tsx` | Test pricing |
| 8 | `__tests__/unit/components/layout/sidebar.test.tsx` | Test sidebar |
| 8 | `__tests__/unit/components/layout/cookie-banner.test.tsx` | Test cookies |

---

## RECAPITULATIF DES REDEPLOYS RAILWAY

| Sprint | Raison |
|--------|--------|
| 1 | Fixes auth, rate limiting, validation upload, race condition |
| 2 | Fix email huntzenjobs.co -> .com |
| 6 | Cache Redis jobs, emails Stripe, retry providers |
| 8 | Ruff auto-fixes |

Recommandation : Grouper Sprint 1 + 2 dans un seul deploy. Grouper Sprint 6 + 8.

---

## ESTIMATION DES SCORES APRES CHAQUE SPRINT

| Sprint | Dim1 | Dim2 | Dim3 | Dim4 | Dim5 | Dim6 | Dim7 | Dim8 | Dim9 | Dim10 |
|--------|------|------|------|------|------|------|------|------|------|-------|
| Actuel | 89 | 68 | 38 | 82 | 72 | 68 | 73 | 68 | 58 | 48 |
| S1 | 93 | 68 | 38 | 93 | 72 | 70 | 73 | 68 | 58 | 48 |
| S2 | 93 | 68 | 43 | 93 | 72 | 72 | 73 | 68 | 58 | 80 |
| S3 | 93 | 72 | 58 | 93 | 72 | 72 | 73 | 68 | 58 | 82 |
| S4 | 93 | 72 | 85 | 93 | 72 | 72 | 73 | 72 | 58 | 82 |
| S5 | 93 | 90 | 85 | 93 | 72 | 72 | 73 | 88 | 58 | 82 |
| S6 | 97 | 90 | 85 | 93 | 72 | 88 | 78 | 88 | 58 | 82 |
| S7 | 97 | 90 | 85 | 93 | 88 | 88 | 88 | 88 | 58 | 82 |
| S8 | 97 | 92 | 88 | 93 | 88 | 88 | 88 | 88 | 78 | 85 |

**Score moyen final estime : ~88/100** (vs ~63/100 actuel)

Note : Atteindre 95+ sur chaque dimension necesiterait des refactorings structurels majeurs (SSR pages publiques, split god files, suite de tests complete) qui sont hors-scope pour ce plan de correction de bugs.

---

## FIXES EXPLICITEMENT REPORTES (BACKLOG)

| # | Description | Raison du report | Risque si execute |
|---|-------------|-----------------|-------------------|
| R1 | Split jobs/page.tsx (2466 lignes) | Refactoring massif, risque regression | ELEVE |
| R2 | Split admin.py (3048 lignes) | Refactoring massif, risque regression | ELEVE |
| R3 | Pages publiques en Server Components (SSR) | Refactoring massif | ELEVE |
| R4 | Cache auth root layout | Risque sur le flow auth | MOYEN |
| R5 | FK subscription_history.subscription_id | Donnees potentiellement orphelines | ELEVE |
| R6 | Migration FK profiles -> auth.users | Fonctionne deja, gain minimal | MOYEN |
| R7 | Drop profiles.subscription_tier | Code legacy pourrait en dependre | MOYEN |
| R8 | ~300 strings admin hardcodes | Basse priorite (admin interne) | FAIBLE |
| R9 | 130 catch blocks sans typage :unknown | Volume important, risque faible | FAIBLE |
| R10 | 115 console.warn/error prod (certains legitimes) | Tri fin a faire | FAIBLE |
| R11 | TODO security anomaly-detection.ts:310 | Feature a implanter from scratch | MOYEN |
| R12 | TODO logger.ts:254 Upstash REST API | Feature a implanter | FAIBLE |
| R13 | 182/199 endpoints sans response_model Pydantic | Volume enorme, gain minimal | FAIBLE |
| R14 | Pages dynamiques villes/secteurs SEO | Feature nouvelle, pas un fix | FAIBLE |
| R15 | og:locale:alternate | Depend de la strategie multi-langue URL | FAIBLE |
| R16 | Font Plus Jakarta Sans chargee mais non utilisee | A verifier si c'est utilise dans les CSS | AUCUN |
| R17 | Code splitting frontend (2 imports dynamiques) | Optimisation P2 | FAIBLE |
| R18 | Insights IA geographiquement incoherents | Modification prompt LLM, a tester | MOYEN |

---

## ORDRE D'EXECUTION RECOMMANDE

```
Jour 1 : Sprint 1 (Securite) + Sprint 2 (Legal/wording)
         -> Deploy Railway
         -> Verifier en prod

Jour 2 : Sprint 3 (I18N pages legales)
         -> Build frontend
         -> Deploy Vercel

Jour 3 : Sprint 4 (I18N composants)
         -> Build frontend
         -> Deploy Vercel

Jour 4 : Sprint 5 (UI + Accessibilite)
         -> Build frontend
         -> Deploy Vercel

Jour 5 : Sprint 6 (API + integrations)
         -> Deploy Railway
         -> Tester emails Stripe en staging

Jour 6 : Sprint 7 (SEO + DB)
         -> Appliquer migrations
         -> Deploy Vercel (cron cleanup)

Jour 7 : Sprint 8 (Qualite code)
         -> ruff fix
         -> Tests frontend
         -> Deploy Railway
```

7 jours de travail effectif. Buffer 1 jour pour les imprevus = 8 jours total.

---

## CHECKLIST PRE-EXECUTION

- [ ] Verifier `CORS_ORIGINS` sur Railway Dashboard avant FIX 1.6
- [ ] Verifier has_interview_sim en DB prod avant FIX 6.7
- [ ] Verifier si anonymous_id est encore utilise cote frontend avant FIX 6.10
- [ ] Verifier les donnees orphelines subscription_history avant FIX 7.8
- [ ] Backup DB avant les migrations Sprint 7
- [ ] Creer branche `fix/audit-commercial-complete` depuis `Production`
