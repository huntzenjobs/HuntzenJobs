# HuntZen — Master Plan Design Spec
**Date :** 2026-03-17
**Statut :** Approuvé pour implémentation (v2 — post spec-review)
**Auteur :** Brainstorming session avec Wissem

---

## Vue d'ensemble

Ce document couvre 13 tickets regroupés en 5 phases séquentielles. Chaque phase est indépendante, testable et commiteable. Le backend précède toujours le frontend qui en dépend.

---

## FEUILLE DE ROUTE — MASTER CHECKLIST

### PHASE 1 — Bugs critiques (impact utilisateur immédiat)
- [ ] **1.1** Debug parrainage rendu silencieux + génération lien parrainage
- [ ] **1.2** Fix ATS watermark non détecté (score pas 95+ sur CV HuntZen)
- [ ] **1.3** Fix offres recommandées absentes dans résultats analyse CV
- [ ] **1.4** Fix points négatifs persistants après amélioration CV

### PHASE 2 — Backend logique
- [ ] **2.1** Intégration mail recruteur (Hunter.io) — badge BETA V1
- [ ] **2.2** Page contact publique + emails confirmation + notification admin
- [ ] **2.3** Footer — extraction composant + refonte complète

### PHASE 3 — Nouvelles pages
- [ ] **3.1** Page `/expat` — niveau de vie, salaires, docs administratifs

### PHASE 4 — Design & UX
- [ ] **4.1** Transition identitaire assistant (changement de persona ressenti)
- [ ] **4.2** Wording accueil (landing page — hero, pain points, features)
- [ ] **4.3** Astérisque ATS + Modal confirmation génération CV

### PHASE 5 — Admin
- [ ] **5.1** Diagnostic complet admin + corrections

---

## PHASE 1 — Bugs critiques

### 1.1 — Parrainage : rendu silencieux + génération lien

**Symptôme réel :** La page `/referral` existe bien dans le code. Elle ne rend rien (`return null`) si `status` est null après le fetch. Ce n'est pas une 404 de route — c'est soit :
- La RPC Supabase `get_or_create_referral_code` qui n'existe pas → endpoint retourne 500 → `setStatus` jamais appelé
- La variable `NEXT_PUBLIC_BACKEND_URL` vide ou incorrecte → fetch échoue silencieusement

**Diagnostic à effectuer (dans l'ordre) :**
1. Vérifier que la RPC `get_or_create_referral_code` existe dans Supabase :
   ```sql
   SELECT routine_name FROM information_schema.routines WHERE routine_name = 'get_or_create_referral_code';
   ```
   Si absente → créer dans `supabase/migrations/YYYYMMDD_referral_rpc.sql`
2. Appeler directement `GET /api/referrals/boost-status` avec un token valide et vérifier la réponse
3. Vérifier que `NEXT_PUBLIC_BACKEND_URL` est définie dans `.env.local` et dans Vercel

**Fix attendus :**

**Backend — `backend/src/api/routes/referrals.py` :**
- Format du lien parrainage : utiliser **query param** `?ref=CODE` (pas segment de route)
  ```python
  referral_link = f"{APP_URL}/?ref={referral_code}"
  ```
- Variable à lire : `NEXT_PUBLIC_APP_URL` (nom exact dans le fichier `.env` backend actuel)
- S'assurer que `boost-status` retourne `referral_link` dans sa réponse

**Backend — `backend/src/api/routes/__init__.py` :**
- Confirmer que `referral_router` est bien enregistré avec prefix `/api/referrals`

**Frontend — `frontend-next/src/app/(dashboard)/referral/page.tsx` :**
- Remplacer `if (!status) return null` par un état d'erreur visible :
  ```tsx
  if (!status && !isLoading) return <div className="text-center py-12 text-muted-foreground">Impossible de charger vos données de parrainage. Réessayez.</div>
  ```
- Ajouter un bouton "Réessayer" qui rappelle `fetchStatus()`

**Frontend — `frontend-next/src/contexts/auth-context.tsx` :**
- La logique de tracking des clicks lit le cookie `huntzen_referral_code=` → OK
- Sur la landing page `app/page.tsx`, ajouter la lecture du query param `?ref=` au chargement pour setter ce cookie :
  ```tsx
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800`
  }, [])
  ```

**Partage du lien :**
- Bouton Copier ✓ (déjà présent)
- Bouton WhatsApp ✓ (déjà présent)
- Ajouter bouton LinkedIn : `https://www.linkedin.com/sharing/share-offsite/?url={encodedLink}`

**Vérification :**
- [ ] La RPC `get_or_create_referral_code` existe dans Supabase
- [ ] `GET /api/referrals/boost-status` retourne 200 avec `referral_link` non vide
- [ ] La page `/referral` affiche le lien et les stats
- [ ] Le lien copié est au format `https://huntzenjobs.com/?ref=XXXXX`
- [ ] Visiter `https://huntzenjobs.com/?ref=XXXXX` → le cookie est setté → l'inscription link le filleul

---

### 1.2 — Fix ATS watermark (score 95+ sur CV HuntZen)

**Symptôme :** Un CV généré/amélioré par HuntZen et re-analysé n'obtient pas 95+ en score ATS.

**Cause identifiée :**
- Template `backend/templates/cv_pdf/cv_ats.html` injecte `"Optimisé par HuntZen Jobs · ATS Certified"` en `6pt` couleur `#d0d0d0`
- WeasyPrint rend ce texte dans le PDF mais Docling/pypdf peut le rater (texte trop petit ou trop clair selon le moteur)
- Le flag `huntzen_certified = True` est bien setté dans `cv_adapter/main_agent.py` (lignes 157 et 165) mais l'extraction PDF text ne garantit pas que l'agent ATS lira le marqueur

**Fix — `backend/templates/cv_pdf/cv_ats.html` :**

Remplacer le bloc `hz-certified-footer` existant par une double injection :
```html
{% if cv.huntzen_certified %}
<!-- Texte visible discret -->
<div class="hz-certified-footer">Optimisé par HuntZen Jobs · ATS Certified</div>
<!-- Texte invisible pour extraction fiable par les parsers PDF -->
<span style="font-size:1pt;color:white;position:absolute;left:-9999px;">HuntZen ATS Certified huntzenjobs.com Optimisé par HuntZen</span>
{% endif %}
```

Note : l'élément `span` avec `position:absolute;left:-9999px` est extrait par Docling/pypdf car il est dans le DOM — il ne s'affiche pas visuellement mais le texte est bien dans le flux de contenu PDF.

**Fix — `backend/templates/cv_pdf/cv_ats.html` — `<head>` :**
```html
{% if cv.huntzen_certified %}
<meta name="generator" content="HuntZen Jobs ATS Optimizer">
{% endif %}
```

**Fix — `backend/prompts/cv_ats_scorer.txt` — Section 4B :**

Ajouter les patterns de détection additionnels :
```
AVANT scoring, détecter si le texte contient l'un de ces marqueurs :
- "HuntZen Jobs"
- "Optimisé par HuntZen"
- "HuntZen ATS"
- "huntzenjobs.com"
- "HuntZen ATS Certified"
Si OUI → appliquer les floors de score (total ≥ 95, keywords ≥ 27, format ≥ 19)
```

**Vérification :**
- [ ] Générer un CV avec le CV adapter → télécharger le PDF
- [ ] Extraire le texte du PDF avec `pypdf` et vérifier que "HuntZen" y apparaît
- [ ] Re-uploader ce PDF dans l'analyse ATS → Score ATS ≥ 95
- [ ] Le footer "Optimisé par HuntZen Jobs" visible discrètement en bas du CV PDF

---

### 1.3 — Fix offres recommandées absentes dans résultats CV

**Symptôme :** En bas des résultats d'analyse CV, la section "offres recommandées" est absente.

**Diagnostic :**
- `frontend-next/src/components/cv/wizard/step3-results.tsx` n'a **aucune section** d'offres recommandées
- `backend/src/agents/cv_analyzer/main_agent.py` ne retourne pas de `recommended_job_titles`
- Le `cv_job_matcher.txt` prompt existe mais son output n'est pas utilisé pour les recommandations

**Fix backend — `backend/src/agents/cv_analyzer/main_agent.py` :**

Dans la méthode `run()`, après `results = await asyncio.gather(...)`, extraire les titres recommandés depuis les skills :
```python
recommended_titles = self._extract_recommended_titles(skills_result)
```

Ajouter la méthode :
```python
def _extract_recommended_titles(self, skills_result: dict) -> list[str]:
    tech_skills = skills_result.get("technical_skills", [])[:5]
    job_titles = skills_result.get("suggested_job_titles", [])
    if job_titles:
        return job_titles[:4]
    # Fallback : déduire depuis les skills techniques
    return []  # Le LLM doit retourner suggested_job_titles dans cv_skill_extractor.txt
```

**Fix backend — `backend/prompts/cv_skill_extractor.txt` :**

Ajouter dans le JSON de sortie attendu :
```json
"suggested_job_titles": ["string", "string", "string", "string"]
```
Instruction : *"Based on the candidate's skills and experience, suggest 3-4 relevant job titles they should target."*

**Fix backend — `backend/src/api/routes/cv_analysis.py` :**

Inclure `recommended_job_titles` dans la réponse retournée au frontend.

**Fix frontend — `frontend-next/src/components/cv/wizard/step3-results.tsx` :**

Ajouter après le `ResultsAccordion` et avant les "Bottom Actions" :

```tsx
{/* Offres recommandées */}
{result.recommended_job_titles?.length > 0 && (
  <div className="space-y-3">
    <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
      Offres recommandées pour votre profil
    </h3>
    <div className="flex flex-wrap gap-2">
      {result.recommended_job_titles.map((title: string) => (
        <button
          key={title}
          onClick={() => router.push(`/jobs?q=${encodeURIComponent(title)}`)}
          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
        >
          {title} →
        </button>
      ))}
    </div>
  </div>
)}
```

**Fix frontend — type `CVAnalysisResult` dans `frontend-next/src/hooks/use-cv-history.ts` :**

Ajouter `recommended_job_titles?: string[]` au type.

**Vérification :**
- [ ] Après analyse CV, 3-4 tags de postes recommandés s'affichent en bas des résultats
- [ ] Cliquer sur un tag redirige vers `/jobs?q=Titre+du+Poste`
- [ ] Si aucun titre recommandé → section masquée (pas de rendu vide)

---

### 1.4 — Fix points négatifs persistants après amélioration CV

**Symptôme :** Après avoir amélioré son CV avec HuntZen et re-analysé, les mêmes suggestions ATS s'affichent encore.

**Cause :**
- `ImprovementAdvisor` sub-agent analyse le CV réécrit et génère des suggestions génériques même si le CV est déjà optimisé
- Le sub-agent ne sait pas que le CV vient du pipeline HuntZen

**Fix — `backend/src/agents/cv_analyzer/main_agent.py` :**

Dans `run()`, détecter le marqueur avant de lancer les sous-agents :
```python
is_huntzen_optimized = any(
    marker in cv_text
    for marker in ["HuntZen Jobs", "Optimisé par HuntZen", "HuntZen ATS", "huntzenjobs.com"]
)
```

Passer ce flag à `_get_improvements()` :
```python
improvements_result = results[2] if isinstance(results[2], dict) else {}
if is_huntzen_optimized:
    improvements_result = self._filter_improvements_for_certified_cv(improvements_result)
```

Ajouter la méthode de filtrage :
```python
def _filter_improvements_for_certified_cv(self, improvements: dict) -> dict:
    """Supprimer les suggestions de format ATS déjà résolues pour les CV HuntZen."""
    filtered = improvements.copy()
    # Supprimer les suggestions liées au format/structure (déjà gérées par HuntZen)
    ats_format_keywords = ["section", "en-tête", "header", "format", "police", "font", "structure", "template"]
    content = filtered.get("content_improvements", [])
    filtered["content_improvements"] = [
        s for s in content
        if not any(kw in s.lower() for kw in ats_format_keywords)
    ]
    return filtered
```

**Fix — `backend/prompts/cv_improvement_advisor.txt` :**

Ajouter en début de prompt :
```
Si le CV contient "HuntZen Jobs" ou "Optimisé par HuntZen" :
- Le FORMAT ATS est déjà certifié optimisé. NE PAS suggérer d'améliorations de format/structure.
- Concentrer UNIQUEMENT sur le contenu métier : expériences, compétences manquantes, quantification des résultats.
```

**Vérification :**
- [ ] CV amélioré par HuntZen → re-analyser → 0 suggestion de type "ajouter des sections standard"
- [ ] Les suggestions restantes portent uniquement sur le contenu métier
- [ ] Le score ATS ≥ 95 (combiné avec le fix 1.2)

---

## PHASE 2 — Backend logique

### 2.1 — Intégration mail recruteur (Hunter.io) — BETA V1

**Contexte :** Service `backend/src/services/recruiter_finder/hunter.py` existe. Endpoint `backend/src/api/routes/recruiter_finder.py` existe mais **sans authentification et sans quota**. À exposer en V1 avec restrictions.

**Fix backend — `backend/src/api/routes/recruiter_finder.py` :**

Ajouter `current_user: CurrentUserDep` au handler `find_recruiters` :
```python
@router.post("/find")
async def find_recruiters(body: RecruiterFinderRequest, current_user: CurrentUserDep):
    # 1. Vérifier quota (même pattern que cv_analysis.py)
    supabase = get_supabase_client()
    quota_res = supabase.rpc("get_quota_status", {
        "p_user_id": current_user["id"],
        "p_feature": "recruiter_search"
    }).execute()
    if quota_res.data and quota_res.data.get("is_exceeded"):
        raise HTTPException(status_code=429, detail="Quota recruiter_search dépassé")
    # 2. Appel Hunter.io existant
    ...
    # 3. Logger l'utilisation
    supabase.rpc("increment_quota_usage", {
        "p_user_id": current_user["id"],
        "p_feature": "recruiter_search"
    }).execute()
```

**Quota à configurer dans `subscription_plans` :** `recruiter_search_daily: 3` (free), `null` (Pro/Premium)

**Fix frontend — nouveau composant `frontend-next/src/components/recruiter/recruiter-email-finder.tsx` :**
- Props : `companyName: string`, `companyDomain?: string`
- Affiche badge **BÊTA** orange + disclaimer : *"Cette fonctionnalité est en cours d'amélioration. Les résultats peuvent être incomplets."*
- Input pré-rempli avec `companyName`
- Bouton "Rechercher" → `POST /api/recruiter-finder/find`
- Output : liste de contacts (nom, email, poste, score confiance Hunter.io)
- Disclaimer RGPD en bas : *"Ces emails proviennent de sources publiques. Respectez le RGPD dans vos communications."*

**Fix frontend — `frontend-next/src/app/(dashboard)/jobs/page.tsx` :**
- Sur chaque job card, ajouter bouton "Trouver les recruteurs" (icône `UserSearch`)
- Le bouton ouvre un `Sheet` (drawer) contenant `<RecruiterEmailFinder companyName={job.company} />`

**Vérification :**
- [ ] Bouton "Trouver les recruteurs" visible sur les job cards avec badge BÊTA
- [ ] Après recherche : liste de contacts Hunter.io affichée
- [ ] Quota free = 3/jour → 4ème recherche retourne message "Quota atteint"
- [ ] Disclaimer RGPD visible

---

### 2.2 — Page contact publique + emails

**Choix architectural (résolu) :** Créer `POST /api/contact` dédié, public (pas d'authentification), distinct de `POST /api/support/tickets`.

**Fix backend — `backend/src/api/routes/contact.py` (nouveau fichier) :**

> ⚠️ Note importante : toutes les fonctions dans `email.py` sont **synchrones** (`def`, pas `async def`). Ne pas utiliser `await` pour les appeler. Le pattern exact est calqué sur `send_welcome()` (ligne 329 de `email.py`).

```python
from fastapi import APIRouter
from pydantic import BaseModel
from src.api.deps import get_supabase_client
from src.services.email import send_support_ticket_notification, send_contact_confirmation

router = APIRouter()

class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str  # "support" | "partnership" | "press" | "other"
    message: str

@router.post("/")
async def submit_contact(body: ContactRequest):
    supabase = get_supabase_client()

    # 1. Insérer dans support_tickets
    # ⚠️ Vérifier que user_id est nullable dans la table AVANT ce déploiement
    # (voir migration requise ci-dessous)
    ticket_res = supabase.table("support_tickets").insert({
        "user_id": None,
        "user_email": body.email,
        "user_name": body.name,
        "category": body.subject,
        "message": body.message,
        "priority": "normal",
        "status": "open",
        "source": "contact_form",
        "page_url": "contact",
        "user_plan": "N/A",
    }).execute()

    ticket_id = str(ticket_res.data[0]["id"])[:8].upper() if ticket_res.data else "N/A"

    # 2. Email confirmation → user (synchrone, pas de await)
    send_contact_confirmation(to_email=body.email, name=body.name)

    # 3. Email notification → admin (synchrone, pas de await)
    # Signature exacte de send_support_ticket_notification (email.py ligne 611) :
    # (ticket_id, subject, category, priority, user_name, user_email, user_plan, page_url, description)
    send_support_ticket_notification(
        ticket_id=ticket_id,
        subject=f"[Contact] {body.subject} — {body.name}",
        category=body.subject,
        priority="normal",
        user_name=body.name,
        user_email=body.email,
        user_plan="N/A",
        page_url="contact",
        description=body.message,
    )

    return {"ok": True}
```

Enregistrer dans `routes/__init__.py` : `app.include_router(contact_router, prefix="/api/contact")`

**Migration SQL requise AVANT déploiement — `supabase/migrations/YYYYMMDD_contact_nullable_user.sql` :**
```sql
-- Rendre user_id nullable dans support_tickets pour les contacts publics
ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;
```
Vérifier d'abord : `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'support_tickets' AND column_name = 'user_id';`
Si déjà nullable → ne pas créer la migration.

**Fix backend — `backend/src/services/email.py` :**

Ajouter la fonction `send_contact_confirmation` en **synchrone** (même pattern que `send_welcome`) :
```python
def send_contact_confirmation(to_email: str, name: str) -> bool:
    """Email de confirmation envoyé à la personne qui contacte via le formulaire public."""
    try:
        import resend
        resend.api_key = settings.get_resend_api_key()
        params = resend.Emails.SendParams(
            from_="HuntzenJobs <no-reply@huntzenjobs.com>",
            to=[to_email],
            subject="Nous avons bien reçu votre message — HuntZen",
            html=f"""
            <!DOCTYPE html><html><head><meta charset="utf-8"></head>
            <body style="font-family:Arial,sans-serif;color:#333;margin:0;padding:0;">
                <div style="max-width:600px;margin:0 auto;padding:20px;">
                    <div style="background:linear-gradient(135deg,#0D1F3C,#1a3a6b);padding:32px;border-radius:12px 12px 0 0;text-align:center;">
                        <h1 style="color:white;margin:0;font-size:24px;">Message reçu ✓</h1>
                    </div>
                    <div style="background:#f8fafc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                        <p>Bonjour {name},</p>
                        <p>Nous avons bien reçu votre message et nous vous répondrons dans les <strong>48h ouvrées</strong>.</p>
                        <p>À bientôt,<br>L'équipe HuntZen</p>
                    </div>
                </div>
            </body></html>
            """,
        )
        resend.Emails.send(params)
        return True
    except Exception as e:
        logger.error(f"[email] send_contact_confirmation error: {e}")
        return False
```

**Fix frontend — `frontend-next/src/app/contact/page.tsx` (nouveau) :**
- Page publique (pas dans le groupe `(dashboard)`)
- Formulaire : Prénom/Nom, Email, Sujet (Select : Support, Partenariat, Presse, Autre), Message
- Bouton Envoyer → `POST /api/contact` (pas besoin de token)
- État après envoi : message de succès inline avec checkmark vert
- État d'erreur : message rouge si l'API fail

**Fix footer — lien Contact :**
- Pointer vers `/contact` au lieu de `mailto:`

**Vérification :**
- [ ] **Pré-requis** : migration SQL exécutée pour rendre `user_id` nullable (ou vérifier qu'il l'est déjà)
- [ ] `GET /contact` accessible sans être connecté
- [ ] Formulaire soumis → message de confirmation inline affiché
- [ ] Email de confirmation reçu par l'user (vérifier inbox Resend)
- [ ] Email de notification reçu à `admin@huntzenjobs.com`
- [ ] Ticket créé dans `support_tickets` avec `source = "contact_form"` et `user_id = null`

---

### 2.3 — Footer — extraction composant + refonte

**État actuel :** Footer inline dans `frontend-next/src/app/page.tsx` (lignes ~787-826), utilise `useTranslations("footer")` avec 5 clés : `tagline`, `copyright`, `privacy`, `terms`, `contact`.

**Fix — nouveau composant `frontend-next/src/components/layout/footer.tsx` :**
- Extraire le footer en composant réutilisable
- Ajouter 4 colonnes (voir contenu ci-dessous)
- Toutes les nouvelles chaînes via `useTranslations("footer")`

**Nouvelles clés i18n à ajouter dans `frontend-next/messages/fr.json` sous `"footer"` :**
```json
"footer": {
  "tagline": "Votre allié carrière...",
  "copyright": "Tous droits réservés.",
  "privacy": "Politique de confidentialité",
  "terms": "Conditions générales",
  "contact": "Contact",
  "sections": {
    "product": "Produit",
    "resources": "Ressources",
    "legal": "Légal"
  },
  "links": {
    "cvAnalysis": "Analyse CV",
    "jobSearch": "Recherche d'emploi",
    "coach": "Coach IA",
    "pricing": "Tarifs",
    "faq": "FAQ",
    "blog": "Blog",
    "testimonials": "Témoignages",
    "about": "À propos",
    "legalNotice": "Mentions légales"
  },
  "social": {
    "follow": "Suivez-nous"
  }
}
```

**Contenu 4 colonnes :**

| Colonne | Liens |
|---------|-------|
| Brand | Logo + tagline + icônes réseaux sociaux (LinkedIn, Twitter/X, Instagram) |
| Produit | `/cv-analysis`, `/jobs`, `/assistant`, `/pricing` |
| Ressources | `/faq`, `/blog`, `/temoignages`, `/about` |
| Légal | `/privacy`, `/terms`, `/contact`, `/legal` (créer si absente) |

Bas de footer : `© 2026 HuntZen. Tous droits réservés.`

**Dashboard footer :** Le layout `(dashboard)/layout.tsx` n'a pas de footer → ajouter une **version sobre** : une ligne `© 2026 HuntZen` + liens Privacy/Terms/Contact, sans les 4 colonnes.

**Fix `frontend-next/src/app/page.tsx` :** Remplacer le code inline par `<Footer />`.

**Vérification :**
- [ ] `<Footer />` affiché sur la landing page avec 4 colonnes et réseaux sociaux
- [ ] Footer sobre ajouté dans le layout dashboard
- [ ] Tous les liens navigables sans erreur 404
- [ ] Responsive : colonnes empilées sur mobile
- [ ] Liens réseaux sociaux : `target="_blank" rel="noopener noreferrer"`
- [ ] Aucun warning TypeScript lié aux nouvelles clés i18n manquantes

---

## PHASE 3 — Nouvelles pages

### 3.1 — Page Expat `/expat`

**URL :** `/expat` (dashboard — auth requise, layout `(dashboard)` automatique)

**Sidebar — `frontend-next/src/components/layout/sidebar.tsx` :**
- Ajouter `import { Globe } from "lucide-react"` en haut du fichier
- Position exacte : **après l'item `Candidatures`** (qui suit `Saved Jobs`), avant `Referral`
- Nouvelle clé i18n à ajouter dans `fr.json` : `"sidebar": { ..., "expat": "Guide Expat" }`
- Item à ajouter dans le tableau de navigation :
  ```ts
  { name: t("nav.expat"), href: "/expat", icon: Globe }
  ```

**Données statiques — `frontend-next/src/data/expat-data.json` (nouveau fichier) :**

Structure par pays :
```json
{
  "countries": [
    {
      "code": "CA",
      "name": "Canada",
      "flag": "🇨🇦",
      "currency": "CAD",
      "costOfLiving": {
        "rent1br": 1200,
        "transport": 100,
        "food": 400,
        "globalIndex": 82
      },
      "salaries": {
        "tech": { "median": 70000, "currency": "CAD" },
        "marketing": { "median": 52000, "currency": "CAD" },
        "finance": { "median": 65000, "currency": "CAD" },
        "health": { "median": 75000, "currency": "CAD" },
        "sales": { "median": 55000, "currency": "CAD" }
      },
      "adminDocs": [
        { "id": "visa", "label": "Visa de travail", "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete.html" },
        { "id": "residence", "label": "Permis de résidence", "url": "..." },
        { "id": "diploma", "label": "Équivalence diplômes", "url": "..." },
        { "id": "healthcare", "label": "Couverture santé", "url": "..." },
        { "id": "bank", "label": "Ouverture compte bancaire", "url": "..." },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.service-public.fr" }
      ]
    }
    // ... 14 autres pays
  ]
}
```

15 pays : France, Canada, Allemagne, Suisse, Royaume-Uni, USA, Dubai (EAU), Pays-Bas, Belgique, Espagne, Portugal, Luxembourg, Australie, Singapour, Maroc.

**Page `frontend-next/src/app/(dashboard)/expat/page.tsx` (nouveau fichier) :**

Sections dans l'ordre :
1. **Header** : titre "Guide Expatriation" + sous-titre
2. **Sélecteur pays** : Select avec drapeau + nom (données depuis JSON)
3. **Section Niveau de vie** : 3 cartes (loyer, transport, alimentation) + badge global index
4. **Section Salaires** : tableau 5 domaines avec devise locale + conversion EUR (taux fixe hardcodé V1)
5. **Section Documents administratifs** : checklist interactive, cases cochables, lien externe par démarche
6. **Section Coach Expat** : bouton "Demander au Coach" → `router.push('/assistant?prefill=Je veux m expatrier en {pays}')`

**Persistence checklist :** `localStorage.setItem('expat_checklist_{countryCode}', JSON.stringify(checkedIds))`

**Vérification :**
- [ ] Item "Guide Expat" visible dans la sidebar (avec icône Globe)
- [ ] Page accessible depuis `/expat`
- [ ] Changer de pays met à jour les 4 sections
- [ ] Checklist docs : cocher une case → recharger la page → case toujours cochée
- [ ] Bouton Coach redirige vers `/assistant` avec le bon prefill
- [ ] Responsive mobile (tableau salaires scrollable horizontalement)

---

## PHASE 4 — Design & UX

### 4.1 — Transition identitaire assistant

**Fichier de config — `frontend-next/src/config/assistants.ts` :**

Ajouter la propriété `accentColor` au type `AssistantConfig` (dans `frontend-next/src/types/assistant.ts` si le type y est défini, sinon dans `assistants.ts` directement) :

```ts
// Dans le type AssistantConfig :
accentColor: string

// Dans la config de chaque assistant :
{ id: "career-coach",  personaName: "Nova",  accentColor: "#7C3AED", ... }
{ id: "job-scout",     personaName: "Maria", accentColor: "#0D9488", ... }
{ id: "cv-analyzer",   personaName: "Sofia", accentColor: "#EC4899", ... }
{ id: "branding",      personaName: "Lucas", accentColor: "#EA580C", ... }
{ id: "interview-sim", personaName: "Jeff",  accentColor: "#DC2626", ... }
```

**Fix — `frontend-next/src/components/assistant/bot-selector.tsx` :**
- À la sélection d'un nouveau persona, déclencher `onAssistantChange(type)` (déjà prévu dans les props)
- Ajouter CSS transition sur le container pour le changement de couleur

**Fix — `frontend-next/src/app/(dashboard)/assistant/page.tsx` :**
- Lire `selectedAssistant` depuis le contexte
- Appliquer `style={{ borderColor: config.accentColor }}` sur le container du chat
- Animation : au changement de persona, appliquer une class `animate-fade-in` (0.3s) sur le header du chat
- Injecter automatiquement un message système dans la conversation :
  ```ts
  const systemMessage = {
    id: `system-${Date.now()}`,
    role: "system" as const,
    content: `Vous parlez maintenant avec ${config.personaName} — ${config.description}`,
    timestamp: new Date(),
  }
  ```
- Afficher ce message avec un style distinct (fond coloré `accentColor/10`, texte italique)

**Vérification :**
- [ ] Changer de persona → animation fade-in visible sur le header
- [ ] La bordure du chat change de couleur selon le persona actif
- [ ] Un message système `"Vous parlez maintenant avec Nova — ..."` apparaît dans le chat
- [ ] Les avatars des messages assistant reflètent le persona actif

---

### 4.2 — Wording accueil (landing page)

**Fichiers :** `frontend-next/messages/fr.json` + `frontend-next/src/app/page.tsx`

**Modifications dans `fr.json` :**

**Hero (clés à mettre à jour) :**
- `hero.title` → proposition de valeur directe : *"Trouvez votre prochain emploi avec un CV qui passe les filtres ATS"*
- `hero.subtitle` → 3 bénéfices : *"CV certifié ATS · Coach IA personnalisé · Offres ciblées pour votre profil"*
- Ajouter `hero.socialProof` : *"Déjà +2 000 candidats accompagnés"*

**Pain points (retravailler pour être personnel) :**
- Chaque point commence par "Vous..." ou une question directe
- Exemple : *"Vos CV restent sans réponse ?"* → expliquer que HuntZen résout ça

**Features :**
- Descriptions orientées bénéfice, pas feature
- Max 15 mots par description feature

**Stats :**
- Ajouter `stats.disclaimer` : *"* Données indicatives basées sur nos utilisateurs"*

**Page `page.tsx` :**
- Ajouter `<p>{tHero("socialProof")}</p>` sous le CTA principal
- Ajouter `<p className="text-xs text-muted-foreground">{tStats("disclaimer")}</p>` sous les stats

**Vérification (requiert validation manuelle) :**
- [ ] Soumettre la PR avec les changements `fr.json` pour revue par Wissem avant merge
- [ ] Aucune faute d'orthographe (passer un spell-checker)
- [ ] Wording validé par Wissem

---

### 4.3 — Astérisque ATS + Modal confirmation génération CV

**Astérisque — `frontend-next/src/components/cv/wizard/step3-results.tsx` :**

Ajouter juste sous le `ScoreRing`, avant les boutons d'action :
```tsx
<div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
  <span>* Votre CV paraît volontairement simple — c'est intentionnel pour maximiser la compatibilité ATS.</span>
  <Popover>
    <PopoverTrigger asChild>
      <button className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-bold hover:bg-muted/80">?</button>
    </PopoverTrigger>
    <PopoverContent className="w-72 text-sm">
      Les ATS (logiciels de tri de CV) préfèrent les CV structurés et épurés.
      Notre format maximise vos chances de passer le filtre automatique avant d'atteindre un recruteur humain.
    </PopoverContent>
  </Popover>
</div>
```

**Modal confirmation — `frontend-next/src/components/cv/wizard-container.tsx` :**

Utiliser **deux états** : `showAtsModal` (contrôle l'affichage) et `atsDismissed` (mis à jour en session lors du clic sur la checkbox, pour éviter que le modal réapparaisse dans la même session React sans rechargement).

```tsx
// Initialisation : lire le localStorage UNE FOIS au montage
const [atsDismissed, setAtsDismissed] = useState(
  () => typeof window !== 'undefined'
    ? localStorage.getItem('huntzen_ats_modal_dismissed') === '1'
    : false
)
const [showAtsModal, setShowAtsModal] = useState(false)

// Avant de déclencher la génération du PDF :
const handleGenerateCV = () => {
  if (!atsDismissed) {
    setShowAtsModal(true)
    return // bloquer la génération jusqu'à confirmation
  }
  triggerGeneration()
}
```

Contenu du modal `Dialog` :
```tsx
<Dialog open={showAtsModal} onOpenChange={setShowAtsModal}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Votre CV sera volontairement épuré</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>Nous générons votre CV dans un format minimaliste et structuré, optimisé pour passer les filtres ATS automatiques.</p>
      <p className="font-medium text-foreground">Il peut paraître "simple" — c'est exactement ce qui le rend efficace.</p>
      <ul className="space-y-1">
        <li>✓ Police standard (Arial/Calibri)</li>
        <li>✓ Structure claire et hiérarchisée</li>
        <li>✓ Pas de tableaux ni d'images</li>
        <li>✓ Certifié par HuntZen ATS Optimizer</li>
      </ul>
      <label className="flex items-center gap-2 cursor-pointer mt-2">
        <input
          type="checkbox"
          onChange={(e) => {
            if (e.target.checked) {
              localStorage.setItem('huntzen_ats_modal_dismissed', '1')
              setAtsDismissed(true) // ← met à jour le state React aussi (fix bug session)
            }
          }}
        />
        <span>Ne plus afficher ce message</span>
      </label>
    </div>
    <DialogFooter>
      <Button onClick={() => {
        setShowAtsModal(false)
        triggerGeneration()
      }}>
        J'ai compris, générer mon CV
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Vérification :**
- [ ] Astérisque visible sous le score ring dans les résultats ATS
- [ ] Clic sur `(?)` → popover explicatif s'affiche
- [ ] Avant génération CV → modal apparaît (sauf si déjà dismissed)
- [ ] Cocher "Ne plus afficher" → localStorage setté → modal ne réapparaît plus
- [ ] Modal mobile-friendly (DialogContent responsive)

---

## PHASE 5 — Admin

### 5.1 — Diagnostic complet admin + corrections

**Pages à tester (toutes) :**
`/admin/dashboard`, `/admin/users`, `/admin/users/[userId]`, `/admin/plans`, `/admin/coupons`, `/admin/referrals`, `/admin/logs`, `/admin/support`, `/admin/analytics`, `/admin/live`, `/admin/prompts`, `/admin/segments`, `/admin/stress`, `/admin/recruiter-requests`

**Protocole de diagnostic par page :**
1. Ouvrir la page → noter si elle charge ou crash
2. Ouvrir la console réseau → identifier les requêtes 4xx/5xx
3. Ouvrir la console JS → noter les erreurs TypeScript/Runtime
4. Pour chaque endpoint en erreur : lire le handler backend correspondant dans `backend/src/api/routes/admin.py`

**Points de vérification prioritaires :**
- Auth admin : `profiles.is_admin = TRUE` requis → s'assurer que l'utilisateur admin a bien ce flag
- `use-admin-live.ts` : utilise Supabase Realtime → vérifier que la table ciblée a Realtime activé
- `/admin/logs` : ajouté récemment → vérifier que les events se lisent bien
- Actions utilisateur (force-plan, suspend, grant-days) : tester chacune avec un user de test
- `/admin/stress` : tests de charge — s'assurer que le bouton ne déclenche pas accidentellement en prod

**Corrections génériques :**
- Tout hook qui fait `setData(res)` sans vérifier `res.ok` → ajouter gestion d'erreur
- Pages qui rendent vide si l'API échoue → ajouter état d'erreur visible avec message + bouton retry
- Vérifier que `AdminUserDep` fonctionne correctement (middleware auth admin)

**Vérification :**
- [ ] 14 pages admin chargent sans erreur console ni réseau
- [ ] Force plan, suspension, grant-days testés avec user sandbox
- [ ] Logs temps réel fonctionnels dans `/admin/logs`
- [ ] Dashboard admin affiche les métriques (total_users, MRR, etc.)
- [ ] `/admin/live` charge et affiche l'activité

---

## ARCHITECTURE TECHNIQUE — RÈGLES TRANSVERSALES

### Conventions de code
- TypeScript strict — pas de `any`
- Fetch API : toujours `session?.access_token` depuis `useAuth()`
- Gestion d'erreur : jamais de `return null` silencieux — toujours un état visible
- Nouvelles routes backend : enregistrer dans `routes/__init__.py`
- Nouvelles pages dashboard : dans le groupe `(dashboard)/` pour protection auth automatique
- Nouvelles pages publiques : dans `app/` à la racine (pas de protection)

### Variables d'environnement clés

| Variable | Contexte | Usage |
|----------|----------|-------|
| `NEXT_PUBLIC_BACKEND_URL` | Frontend (Next.js) | URL de l'API backend Railway |
| `NEXT_PUBLIC_APP_URL` | Frontend (Next.js) | URL publique du site (ex: `https://huntzenjobs.com`) |
| `NEXT_PUBLIC_APP_URL` | Backend (Python, dans `.env`) | Même valeur — utilisée pour construire les liens parrainage dans `referrals.py` |
| `RESEND_API_KEY` | Backend | Service d'envoi d'emails |
| `ADMIN_EMAIL` | Backend | `admin@huntzenjobs.com` — destinataire emails admin |

> Note : La variable `NEXT_PUBLIC_APP_URL` existe dans les deux environnements. Côté Python elle est lue via `os.getenv("NEXT_PUBLIC_APP_URL", "https://huntzenjobs.com")` dans `referrals.py`. Ne pas la renommer.

---

## PROTOCOLE HANDOFF CONTEXTE

### Mise à jour de progression
**À chaque fin de ticket**, cocher l'item dans la MASTER CHECKLIST en haut de ce document.

### Alerte contexte limite
Quand le contexte approche la limite, créer un résumé d'état et utiliser le prompt suivant :

```
Je travaille sur le projet HuntZen (Next.js 14 + FastAPI + Supabase) situé dans /Users/wissem/HuntzenIA/huntzen_jobsearch.

Le plan complet est dans : docs/superpowers/specs/2026-03-17-huntzen-master-plan-design.md

ÉTAT D'AVANCEMENT :
- [X] Phase 1 complète / Phase 1.1 à 1.3 complètes, 1.4 en cours
- En cours : Ticket [X.Y] — [titre exact du ticket]
- Dernière action effectuée : [description précise — ex: "modifié backend/src/agents/cv_analyzer/main_agent.py pour ajouter la détection huntzen_certified"]
- Prochaine étape : [action précise — ex: "modifier backend/prompts/cv_improvement_advisor.txt ligne X"]

RÈGLES PROJET :
- Répondre en français
- Pas de "Co-Authored-By" dans les commits
- Ne pas committer les docs/plans/
- Lire toujours les fichiers avant de les modifier
- Vérifier les dépendances avant d'installer quoi que ce soit

COMMANDE : Continuer le ticket [X.Y] : [description de ce qui reste à faire]
```

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

| # | Ticket | Raison |
|---|--------|--------|
| 1 | **1.1** Parrainage | Bug visible utilisateurs |
| 2 | **1.2** ATS watermark | Valeur produit directe |
| 3 | **1.3** Offres recommandées | UX résultats CV incomplet |
| 4 | **1.4** Points négatifs CV | Cohérent avec 1.2 et 1.3 |
| 5 | **2.2** Page contact + emails | Simple, haute valeur |
| 6 | **2.3** Footer | Rapide, crédibilité |
| 7 | **2.1** Mail recruteur | Nécessite tests Hunter.io |
| 8 | **4.3** Astérisque + Modal | Petit, impactant |
| 9 | **3.1** Expat | Plus grosse feature |
| 10 | **4.1** Transition assistant | UX polish |
| 11 | **4.2** Wording accueil | Validation Wissem requise |
| 12 | **5.1** Admin diagnostic | Moins urgent |

---

*Spec rédigée le 2026-03-17 — v3 post spec-review itération 2.*
*v2 : URL parrainage clarifiée, endpoint contact public, signature email documentée, diagnostic parrainage précisé, auth+quota recruiter_finder, i18n footer, sidebar Globe + position, accentColor assistants.ts, DOM watermark, critères wording, /admin/live.*
*v3 : Signature `send_support_ticket_notification` corrigée (paramètre `subject` ajouté, `description` au lieu de `message`, `await` supprimés), `send_contact_confirmation` réécrite en synchrone avec template Resend complet (sans `_send`), migration SQL `user_id` nullable documentée avec requête de vérification, bug `dontShowAtsModal` corrigé (double state React + localStorage), variable env `NEXT_PUBLIC_APP_URL` clarifiée (frontend + backend).*
