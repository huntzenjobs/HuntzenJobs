# HuntZen Master Plan — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corriger 4 bugs critiques, ajouter 5 nouvelles fonctionnalités et améliorer l'UX sur l'ensemble de la plateforme HuntZen.

**Architecture:** Next.js 14 (App Router) frontend + FastAPI backend + Supabase DB/Auth. Chaque phase est indépendante et commiteable. Le backend est toujours modifié avant le frontend qui en dépend.

**Tech Stack:** Next.js 14, TypeScript, FastAPI (Python), Supabase, Resend (email), Hunter.io, Radix UI / shadcn, Tailwind CSS

**Spec complète :** `docs/superpowers/specs/2026-03-17-huntzen-master-plan-design.md`

---

## Chunk 1 — Phase 1 : Bugs critiques

### Task 1.1 — Parrainage : diagnostic + fix rendu silencieux + lien

**Files :**
- Modify: `backend/src/api/routes/referrals.py`
- Modify: `frontend-next/src/app/(dashboard)/referral/page.tsx`
- Modify: `frontend-next/src/app/page.tsx`

- [ ] **Step 1 : Vérifier la RPC Supabase**

Dans Supabase Dashboard → SQL Editor, exécuter :
```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'get_or_create_referral_code';
```
Si 0 résultat → créer la migration (voir Step 2). Si 1 résultat → passer à Step 3.

- [ ] **Step 2 : (Si RPC manquante) Créer la migration**

Créer `supabase/migrations/20260317000001_referral_rpc.sql` :
```sql
CREATE OR REPLACE FUNCTION get_or_create_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
BEGIN
  SELECT referral_code INTO v_code
  FROM referrals
  WHERE referrer_id = p_user_id AND is_active = TRUE
  LIMIT 1;

  IF v_code IS NULL THEN
    v_code := upper(substring(encode(gen_random_bytes(4), 'hex') FROM 1 FOR 8));
    INSERT INTO referrals (referrer_id, referral_code, is_active)
    VALUES (p_user_id, v_code, TRUE)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_code;
END;
$$;
```
Appliquer : `npx supabase db push` depuis la racine du projet.

- [ ] **Step 3 : Tester l'endpoint boost-status**

```bash
# Récupérer un token valide depuis le navigateur (DevTools → Network → Authorization header)
curl -H "Authorization: Bearer <token>" \
  https://huntzenjobs-production.up.railway.app/api/referrals/boost-status
```
Expected : JSON avec `referral_code`, `referral_link`, `tiers`. Si 500 → voir logs Railway.

- [ ] **Step 4 : Corriger le format du lien parrainage dans le backend**

Lire `backend/src/api/routes/referrals.py`. Chercher la construction du `referral_link` dans `boost-status`. S'assurer que le format est :
```python
APP_URL = os.getenv("NEXT_PUBLIC_APP_URL", "https://huntzenjobs.com")
referral_link = f"{APP_URL}/?ref={referral_code}"
```
Modifier si différent (ex: format `/ref/CODE` → remplacer par `/?ref=CODE`).

- [ ] **Step 5 : Améliorer la gestion d'erreur dans la page referral**

Modifier `frontend-next/src/app/(dashboard)/referral/page.tsx` :

Remplacer :
```tsx
if (!status) return null;
```
Par :
```tsx
if (!status && !isLoading) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <p className="text-muted-foreground mb-4">
        Impossible de charger vos données de parrainage.
      </p>
      <button
        onClick={fetchStatus}
        className="text-sm text-blue-600 hover:underline"
      >
        Réessayer
      </button>
    </div>
  );
}
```

- [ ] **Step 6 : Ajouter la lecture du ?ref= sur la landing page**

Dans `frontend-next/src/app/page.tsx`, ajouter en haut du composant `HomePage` :
```tsx
useEffect(() => {
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')
  if (ref) {
    document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800; SameSite=Lax`
  }
}, [])
```

- [ ] **Step 7 : Ajouter le bouton LinkedIn dans la page referral**

Dans `frontend-next/src/app/(dashboard)/referral/page.tsx`, après le bouton WhatsApp existant :
```tsx
<button
  onClick={() => {
    if (!status?.referral_link) return;
    window.open(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(status.referral_link)}`,
      "_blank"
    );
  }}
  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0A66C2] text-white text-sm font-medium hover:bg-[#004182] transition-colors"
>
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
  LinkedIn
</button>
```

- [ ] **Step 8 : Commit**

```bash
git add supabase/migrations/ backend/src/api/routes/referrals.py \
  frontend-next/src/app/(dashboard)/referral/page.tsx \
  frontend-next/src/app/page.tsx
git commit -m "fix(referral): fix silent render, correct link format ?ref=, add LinkedIn share"
```

---

### Task 1.2 — Fix ATS watermark (score 95+ sur CV HuntZen)

**Files :**
- Modify: `backend/templates/cv_pdf/cv_ats.html`
- Modify: `backend/prompts/cv_ats_scorer.txt`

- [ ] **Step 1 : Lire le template cv_ats.html**

```bash
# Trouver le bloc hz-certified-footer
grep -n "hz-certified-footer\|huntzen_certified\|Optimisé" backend/templates/cv_pdf/cv_ats.html
```

- [ ] **Step 2 : Modifier le footer dans cv_ats.html**

Lire le fichier. Trouver le bloc :
```html
{% if cv.huntzen_certified %}
<div class="hz-certified-footer">Optimisé par HuntZen Jobs · ATS Certified</div>
{% endif %}
```

Le remplacer par :
```html
{% if cv.huntzen_certified %}
<!-- Texte visible discret -->
<div class="hz-certified-footer">Optimisé par HuntZen Jobs · ATS Certified</div>
<!-- Texte invisible pour extraction fiable par les parsers PDF (hors écran, dans le flux DOM) -->
<span style="font-size:1pt;color:white;position:absolute;left:-9999px;">HuntZen ATS Certified huntzenjobs.com Optimisé par HuntZen</span>
{% endif %}
```

- [ ] **Step 3 : Ajouter la meta generator dans le <head>**

Trouver le `<head>` du template. Juste avant `</head>`, ajouter :
```html
{% if cv.huntzen_certified %}
<meta name="generator" content="HuntZen Jobs ATS Optimizer">
{% endif %}
```

- [ ] **Step 4 : Mettre à jour le prompt cv_ats_scorer.txt**

Lire `backend/prompts/cv_ats_scorer.txt`. Trouver la Section 4B (HUNTZEN CERTIFIED PROTOCOL).

Modifier le début de la section pour ajouter les patterns additionnels :
```
AVANT scoring, détecter si le texte contient l'UN des marqueurs suivants :
- "HuntZen Jobs"
- "Optimisé par HuntZen"
- "HuntZen ATS"
- "huntzenjobs.com"
- "HuntZen ATS Certified"

Si OUI → Ce CV a été pré-validé par HuntZen. Appliquer les floors :
  · total: max(your_score, 95)
  · keywords_score: max(your_score, 27)
  · format_score: max(your_score, 19)
Si NON → Score objectif, aucun floor.
```

- [ ] **Step 5 : Test manuel**

Générer un CV via l'interface → télécharger le PDF → le re-uploader dans l'analyse ATS.
Vérifier que le score est ≥ 95.

Aussi vérifier en CLI que le texte est bien dans le PDF généré :
```bash
python3 -c "
import pypdf, sys
reader = pypdf.PdfReader('/path/to/generated.pdf')
text = ' '.join(p.extract_text() or '' for p in reader.pages)
print('HuntZen' in text, text[:200])
"
```

- [ ] **Step 6 : Commit**

```bash
git add backend/templates/cv_pdf/cv_ats.html backend/prompts/cv_ats_scorer.txt
git commit -m "fix(ats): double watermark injection + additional detection patterns for HuntZen certified CVs"
```

---

### Task 1.3 — Fix offres recommandées dans résultats CV

**Files :**
- Modify: `backend/prompts/cv_skill_extractor.txt`
- Modify: `backend/src/agents/cv_analyzer/main_agent.py`
- Modify: `backend/src/api/routes/cv_analysis.py`
- Modify: `frontend-next/src/hooks/use-cv-history.ts`
- Modify: `frontend-next/src/components/cv/wizard/step3-results.tsx`

- [ ] **Step 1 : Lire le prompt cv_skill_extractor.txt**

```bash
cat backend/prompts/cv_skill_extractor.txt
```
Identifier le JSON de sortie attendu.

- [ ] **Step 2 : Ajouter suggested_job_titles dans le prompt**

Dans `cv_skill_extractor.txt`, trouver le bloc JSON de sortie et ajouter le champ :
```json
"suggested_job_titles": ["string", "string", "string"]
```
Et l'instruction correspondante dans la section des règles :
```
- suggested_job_titles: Based on all skills and experience level, suggest 3-4 job titles the candidate should target. Use standard job title formats (ex: "Développeur Full-Stack React/Node.js", "Data Scientist Python").
```

- [ ] **Step 3 : Ajouter _extract_recommended_titles dans main_agent.py**

Lire `backend/src/agents/cv_analyzer/main_agent.py`. Dans la méthode `run()`, après la ligne qui récupère `skills_result`, ajouter l'extraction des titres recommandés :

```python
# Extraire les titres recommandés depuis les skills
recommended_titles = self._extract_recommended_titles(skills_result)
```

Ajouter la méthode avant `_extract_strengths` :
```python
def _extract_recommended_titles(self, skills_result: dict) -> list[str]:
    """Extraire les titres de poste recommandés depuis l'analyse des skills."""
    titles = skills_result.get("suggested_job_titles", [])
    if isinstance(titles, list):
        return [str(t) for t in titles[:4] if t]
    return []
```

Dans le `return` de `run()`, ajouter le champ :
```python
"recommended_job_titles": recommended_titles,
```

- [ ] **Step 4 : Inclure recommended_job_titles dans la réponse API**

Lire `backend/src/api/routes/cv_analysis.py`. Trouver où la réponse du `CVAnalyzerAgent` est retournée au frontend. S'assurer que `recommended_job_titles` est inclus dans la réponse JSON (ou passthrough si déjà dynamique).

- [ ] **Step 5 : Mettre à jour le type CVAnalysisResult**

Lire `frontend-next/src/hooks/use-cv-history.ts`. Trouver le type `CVAnalysisResult`. Ajouter :
```ts
recommended_job_titles?: string[]
```

- [ ] **Step 6 : Ajouter la section dans step3-results.tsx**

Lire `frontend-next/src/components/cv/wizard/step3-results.tsx`. Trouver le commentaire `{/* Bottom Actions */}`. Juste AVANT ce bloc, ajouter :

```tsx
{/* Offres recommandées */}
{result.recommended_job_titles && result.recommended_job_titles.length > 0 && (
  <div className="space-y-3 pt-2">
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      Postes recommandés pour votre profil
    </h3>
    <div className="flex flex-wrap gap-2">
      {result.recommended_job_titles.map((title) => (
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

- [ ] **Step 7 : Vérifier que `router` est importé dans step3-results.tsx**

Déjà importé : `const router = useRouter()` — vérifier ligne ~123.

- [ ] **Step 8 : Test manuel**

Analyser un CV → vérifier que les tags de postes apparaissent en bas.
Cliquer sur un tag → vérifier la redirection vers `/jobs?q=...`.

- [ ] **Step 9 : Commit**

```bash
git add backend/prompts/cv_skill_extractor.txt \
  backend/src/agents/cv_analyzer/main_agent.py \
  backend/src/api/routes/cv_analysis.py \
  frontend-next/src/hooks/use-cv-history.ts \
  frontend-next/src/components/cv/wizard/step3-results.tsx
git commit -m "feat(cv): add recommended job titles section in ATS results"
```

---

### Task 1.4 — Fix points négatifs persistants après amélioration CV

**Files :**
- Modify: `backend/src/agents/cv_analyzer/main_agent.py`
- Modify: `backend/prompts/cv_improvement_advisor.txt`

- [ ] **Step 1 : Lire le prompt cv_improvement_advisor.txt**

```bash
cat backend/prompts/cv_improvement_advisor.txt
```

- [ ] **Step 2 : Ajouter l'instruction HuntZen au début du prompt**

En haut du prompt (après les headers éventuels), ajouter :
```
RÈGLE HUNTZEN CERTIFIED :
Si le CV analysé contient l'un de ces marqueurs : "HuntZen Jobs", "Optimisé par HuntZen", "HuntZen ATS", "huntzenjobs.com" :
- Le FORMAT ATS est déjà certifié optimisé par HuntZen. NE PAS suggérer d'améliorations de type format/structure/template.
- Se concentrer UNIQUEMENT sur le contenu métier : quantification des résultats, compétences manquantes, précision des responsabilités.
```

- [ ] **Step 3 : Ajouter la détection + filtrage dans main_agent.py**

Lire `backend/src/agents/cv_analyzer/main_agent.py`. Dans la méthode `run()`, avant le `asyncio.gather`, ajouter :

```python
# Détecter si le CV vient du pipeline HuntZen
HUNTZEN_MARKERS = ["HuntZen Jobs", "Optimisé par HuntZen", "HuntZen ATS", "huntzenjobs.com", "HuntZen ATS Certified"]
is_huntzen_optimized = any(marker in cv_text for marker in HUNTZEN_MARKERS)
```

Après le `gather`, modifier la ligne qui récupère `improvements_result` :
```python
improvements_result = results[2] if isinstance(results[2], dict) else {}
if is_huntzen_optimized:
    improvements_result = self._filter_improvements_for_certified_cv(improvements_result)
```

Ajouter la méthode `_filter_improvements_for_certified_cv` :
```python
def _filter_improvements_for_certified_cv(self, improvements: dict) -> dict:
    """Supprimer les suggestions de format ATS pour les CV déjà certifiés HuntZen."""
    filtered = dict(improvements)
    ats_format_keywords = [
        "section", "en-tête", "header", "format", "police", "font",
        "structure", "template", "mise en page", "layout"
    ]
    content = filtered.get("content_improvements", [])
    if isinstance(content, list):
        filtered["content_improvements"] = [
            s for s in content
            if not any(kw in str(s).lower() for kw in ats_format_keywords)
        ]
    missing = filtered.get("missing_sections", [])
    if isinstance(missing, list):
        # Les sections manquantes liées au format sont déjà gérées par HuntZen
        ats_sections = ["résumé professionnel", "compétences", "expérience", "formation"]
        filtered["missing_sections"] = [
            s for s in missing
            if not any(kw in str(s).lower() for kw in ats_sections)
        ]
    return filtered
```

- [ ] **Step 4 : Test manuel**

1. Améliorer un CV via le CV Adapter → télécharger le PDF
2. Uploader ce PDF dans l'analyse ATS
3. Vérifier : score ≥ 95 + 0 suggestion de type "ajoutez des sections standard"

- [ ] **Step 5 : Commit**

```bash
git add backend/src/agents/cv_analyzer/main_agent.py \
  backend/prompts/cv_improvement_advisor.txt
git commit -m "fix(cv): filter ATS format suggestions for HuntZen-certified CVs"
```

---

## Chunk 2 — Phase 2 : Backend logique

### Task 2.1 — Mail recruteur (Hunter.io) BETA V1

**Files :**
- Modify: `backend/src/api/routes/recruiter_finder.py`
- Create: `frontend-next/src/components/recruiter/recruiter-email-finder.tsx`
- Modify: `frontend-next/src/app/(dashboard)/jobs/page.tsx`

- [ ] **Step 1 : Lire l'endpoint recruiter_finder.py**

```bash
cat backend/src/api/routes/recruiter_finder.py
```
Identifier le handler `find_recruiters`. Vérifier qu'il a un `CurrentUserDep` ou non.

- [ ] **Step 2 : Ajouter auth + quota au handler recruiter_finder**

Dans `backend/src/api/routes/recruiter_finder.py`, modifier le handler principal :

```python
from src.api.deps import get_supabase_client, CurrentUserDep

@router.post("/find")
async def find_recruiters(body: RecruiterFinderRequest, current_user: CurrentUserDep):
    supabase = get_supabase_client()

    # Vérifier le quota (3/jour free, illimité Pro/Premium)
    quota_res = supabase.rpc("get_quota_status", {
        "p_user_id": current_user["id"],
        "p_feature": "recruiter_search"
    }).execute()

    if quota_res.data and quota_res.data.get("is_exceeded"):
        from fastapi import HTTPException
        raise HTTPException(
            status_code=429,
            detail="Quota de recherche recruteur atteint (3/jour en version gratuite). Passez à Pro pour un accès illimité."
        )

    # ... reste du code Hunter.io existant ...

    # Logger l'utilisation après succès
    supabase.rpc("increment_quota_usage", {
        "p_user_id": current_user["id"],
        "p_feature": "recruiter_search"
    }).execute()

    return result
```

Note : si `get_quota_status` ou `increment_quota_usage` n'existent pas en tant que RPC, utiliser le même pattern que dans `cv_analysis.py` — lire ce fichier pour copier le pattern exact.

- [ ] **Step 3 : Créer le composant RecruiterEmailFinder**

Créer `frontend-next/src/components/recruiter/recruiter-email-finder.tsx` :

```tsx
"use client";

import { useState } from "react";
import { AlertTriangle, Search, Mail, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";

interface Contact {
  first_name?: string;
  last_name?: string;
  email?: string;
  position?: string;
  confidence?: number;
}

interface RecruiterEmailFinderProps {
  companyName: string;
  companyDomain?: string;
}

export function RecruiterEmailFinder({ companyName, companyDomain }: RecruiterEmailFinderProps) {
  const { session } = useAuth();
  const [company, setCompany] = useState(companyName);
  const [results, setResults] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!session?.access_token || !company.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/recruiter-finder/find`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ company_name: company, company_domain: companyDomain }),
        }
      );
      if (res.status === 429) {
        setError("Quota atteint (3 recherches/jour en version gratuite). Passez à Pro pour un accès illimité.");
        return;
      }
      if (!res.ok) throw new Error("Erreur de recherche");
      const data = await res.json();
      setResults(data.recruiters || data.all_contacts || []);
      setSearched(true);
    } catch (e) {
      setError("Impossible de contacter le service. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Badge BÊTA + disclaimer */}
      <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
        <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
        <div className="text-xs text-orange-700">
          <span className="font-semibold">BÊTA</span> — Cette fonctionnalité est en cours d'amélioration.
          Les résultats peuvent être incomplets.
        </div>
      </div>

      {/* Input + bouton */}
      <div className="flex gap-2">
        <Input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Nom de l'entreprise"
          className="flex-1"
        />
        <Button onClick={handleSearch} disabled={loading || !company.trim()}>
          <Search className="w-4 h-4 mr-2" />
          {loading ? "Recherche..." : "Rechercher"}
        </Button>
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Résultats */}
      {searched && results.length === 0 && !error && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Aucun contact trouvé pour cette entreprise.
        </p>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((contact, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-white border rounded-lg">
              <div>
                <p className="text-sm font-medium">
                  {contact.first_name} {contact.last_name}
                </p>
                {contact.position && (
                  <p className="text-xs text-muted-foreground">{contact.position}</p>
                )}
                {contact.email && (
                  <p className="text-xs font-mono text-blue-600">{contact.email}</p>
                )}
              </div>
              {contact.confidence && (
                <Badge variant="outline" className="text-xs">
                  {contact.confidence}% confiance
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer RGPD */}
      {searched && (
        <p className="text-xs text-muted-foreground border-t pt-3">
          Ces emails proviennent de sources publiques. Respectez le RGPD dans vos communications.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4 : Intégrer dans la page Jobs**

Lire `frontend-next/src/app/(dashboard)/jobs/page.tsx`. Identifier la structure d'une job card. Ajouter :

En haut du fichier, importer :
```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { RecruiterEmailFinder } from "@/components/recruiter/recruiter-email-finder"
import { UserSearch } from "lucide-react"
```

Sur chaque card d'offre (dans le JSX), après les boutons existants, ajouter :
```tsx
<Sheet>
  <SheetTrigger asChild>
    <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
      <UserSearch className="w-3.5 h-3.5" />
      Trouver les recruteurs
      <span className="px-1 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded">BÊTA</span>
    </button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Trouver les recruteurs</SheetTitle>
    </SheetHeader>
    <div className="mt-4">
      <RecruiterEmailFinder companyName={job.company || ""} />
    </div>
  </SheetContent>
</Sheet>
```

Adapter `job.company` au nom exact du champ dans l'objet job.

- [ ] **Step 5 : Test manuel**

1. Ouvrir `/jobs` → vérifier que le bouton "Trouver les recruteurs" apparaît sur les cards
2. Cliquer → le Sheet s'ouvre avec le badge BÊTA et le formulaire
3. Entrer un nom d'entreprise → vérifier les résultats Hunter.io
4. Tester la 4ème requête → vérifier le message de quota atteint

- [ ] **Step 6 : Commit**

```bash
git add backend/src/api/routes/recruiter_finder.py \
  frontend-next/src/components/recruiter/recruiter-email-finder.tsx \
  frontend-next/src/app/(dashboard)/jobs/page.tsx
git commit -m "feat(recruiter): expose Hunter.io email finder with BETA badge + auth + quota"
```

---

### Task 2.2 — Page contact publique + emails

**Files :**
- Create: `backend/src/api/routes/contact.py`
- Modify: `backend/src/api/routes/__init__.py`
- Modify: `backend/src/services/email.py`
- Create: `supabase/migrations/20260317000002_support_tickets_nullable_user.sql`
- Create: `frontend-next/src/app/contact/page.tsx`

- [ ] **Step 1 : Vérifier user_id nullable dans support_tickets**

Dans Supabase Dashboard → SQL Editor :
```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'support_tickets' AND column_name = 'user_id';
```
Si `is_nullable = NO` → Step 2. Sinon → Step 3.

- [ ] **Step 2 : (Si nécessaire) Migration user_id nullable**

Créer `supabase/migrations/20260317000002_support_tickets_nullable_user.sql` :
```sql
-- Rendre user_id nullable pour les contacts via le formulaire public
ALTER TABLE support_tickets ALTER COLUMN user_id DROP NOT NULL;
```
Appliquer : `npx supabase db push`

- [ ] **Step 3 : Créer la route contact.py**

Créer `backend/src/api/routes/contact.py` :
```python
"""Endpoint public de contact (sans authentification requise)."""

import logging
from fastapi import APIRouter
from pydantic import BaseModel, EmailStr

from src.api.deps import get_supabase_client
from src.services.email import send_support_ticket_notification, send_contact_confirmation

logger = logging.getLogger(__name__)
router = APIRouter()


class ContactRequest(BaseModel):
    name: str
    email: str
    subject: str  # "support" | "partnership" | "press" | "other"
    message: str


@router.post("/")
async def submit_contact(body: ContactRequest):
    """Formulaire de contact public — crée un ticket et envoie deux emails."""
    supabase = get_supabase_client()

    # 1. Insérer dans support_tickets (user_id = null → nullable requis)
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

    # 2. Email confirmation → user (synchrone)
    send_contact_confirmation(to_email=body.email, name=body.name)

    # 3. Email notification → admin (synchrone)
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

    return {"ok": True, "ticket_id": ticket_id}
```

- [ ] **Step 4 : Enregistrer la route dans __init__.py**

Lire `backend/src/api/routes/__init__.py`. Ajouter en suivant le même pattern que les autres routes :
```python
from src.api.routes.contact import router as contact_router
# ...
app.include_router(contact_router, prefix="/api/contact", tags=["contact"])
```

- [ ] **Step 5 : Ajouter send_contact_confirmation dans email.py**

Lire `backend/src/services/email.py`. À la fin du fichier (avant la dernière ligne vide), ajouter :

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
                        <p style="color:#00D9FF;margin:10px 0 0;font-size:14px;">HuntZen</p>
                    </div>
                    <div style="background:#f8fafc;padding:28px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
                        <p>Bonjour {name},</p>
                        <p>Nous avons bien reçu votre message et nous vous répondrons dans les <strong>48h ouvrées</strong>.</p>
                        <p style="color:#6b7280;font-size:13px;">Si vous avez une urgence, vous pouvez aussi nous écrire directement à <a href="mailto:contact@huntzenjobs.com">contact@huntzenjobs.com</a>.</p>
                        <p>À bientôt,<br><strong>L'équipe HuntZen</strong></p>
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

- [ ] **Step 6 : Créer la page contact frontend**

Créer `frontend-next/src/app/contact/page.tsx` :

```tsx
"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { LandingHeader } from "@/components/landing-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SUBJECTS = [
  { value: "support", label: "Support technique" },
  { value: "partnership", label: "Partenariat" },
  { value: "press", label: "Presse & Médias" },
  { value: "other", label: "Autre" },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.subject || !form.message) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/contact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      if (!res.ok) throw new Error("Erreur d'envoi");
      setSuccess(true);
    } catch {
      setError("Une erreur s'est produite. Réessayez ou écrivez-nous directement à contact@huntzenjobs.com");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <LandingHeader />
      <main className="max-w-xl mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-3">Contactez-nous</h1>
          <p className="text-muted-foreground">
            Une question, une suggestion ou un partenariat ? On vous répond sous 48h ouvrées.
          </p>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold">Message envoyé !</h2>
            <p className="text-muted-foreground">
              Nous vous avons envoyé une confirmation par email. Nous vous répondrons dans les 48h ouvrées.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Votre nom</label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Prénom Nom"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Email</label>
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="vous@exemple.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Sujet</label>
              <Select
                required
                onValueChange={(v) => setForm({ ...form, subject: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un sujet" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Message</label>
              <Textarea
                required
                rows={5}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Décrivez votre demande..."
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Envoi en cours..." : "Envoyer le message"}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 7 : Test E2E**

1. Ouvrir `/contact` sans être connecté → vérifier que la page charge
2. Remplir et soumettre → vérifier le message de succès
3. Vérifier dans Supabase `support_tickets` qu'un ticket a été créé avec `source = "contact_form"`
4. Vérifier dans les logs Resend que les 2 emails ont été envoyés

- [ ] **Step 8 : Commit**

```bash
git add supabase/migrations/ \
  backend/src/api/routes/contact.py \
  backend/src/api/routes/__init__.py \
  backend/src/services/email.py \
  frontend-next/src/app/contact/page.tsx
git commit -m "feat(contact): public contact page + confirmation email + admin notification"
```

---

### Task 2.3 — Footer refonte

**Files :**
- Create: `frontend-next/src/components/layout/footer.tsx`
- Modify: `frontend-next/src/app/page.tsx`
- Modify: `frontend-next/src/app/(dashboard)/layout.tsx`
- Modify: `frontend-next/messages/fr.json`

- [ ] **Step 1 : Ajouter les clés i18n**

Lire `frontend-next/messages/fr.json`. Trouver la section `"footer"`. La remplacer par :
```json
"footer": {
  "tagline": "Votre allié carrière pour transformer votre recherche d'emploi en succès.",
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

- [ ] **Step 2 : Créer le composant Footer**

Créer `frontend-next/src/components/layout/footer.tsx` :

```tsx
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Linkedin, Twitter, Instagram } from "lucide-react";

const PRODUCT_LINKS = [
  { href: "/cv-analysis", key: "cvAnalysis" },
  { href: "/jobs", key: "jobSearch" },
  { href: "/assistant", key: "coach" },
  { href: "/pricing", key: "pricing" },
] as const;

const RESOURCE_LINKS = [
  { href: "/faq", key: "faq" },
  { href: "/blog", key: "blog" },
  { href: "/temoignages", key: "testimonials" },
  { href: "/about", key: "about" },
] as const;

const LEGAL_LINKS = [
  { href: "/privacy", key: "privacy" },
  { href: "/terms", key: "terms" },
  { href: "/contact", key: "contact" },
  { href: "/legal", key: "legalNotice" },
] as const;

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="bg-black text-white pt-12 pb-6">
      <div className="container mx-auto px-4 sm:px-6">
        {/* 4 colonnes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl">HuntZen</span>
              <span className="w-2 h-2 rounded-full bg-[#00D9FF] animate-pulse" />
            </div>
            <p className="text-white/60 text-sm">{t("tagline")}</p>
            {/* Réseaux sociaux */}
            <div className="flex items-center gap-3">
              <a
                href="https://linkedin.com/company/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4 h-4" />
              </a>
              <a
                href="https://twitter.com/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
                aria-label="Twitter / X"
              >
                <Twitter className="w-4 h-4" />
              </a>
              <a
                href="https://instagram.com/huntzenjobs"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/50 hover:text-white transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Produit */}
          <div>
            <h3 className="font-semibold text-sm mb-4">{t("sections.product")}</h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map(({ href, key }) => (
                <li key={href}>
                  <Link href={href} className="text-white/60 text-sm hover:text-white transition-colors">
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h3 className="font-semibold text-sm mb-4">{t("sections.resources")}</h3>
            <ul className="space-y-2">
              {RESOURCE_LINKS.map(({ href, key }) => (
                <li key={href}>
                  <Link href={href} className="text-white/60 text-sm hover:text-white transition-colors">
                    {t(`links.${key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h3 className="font-semibold text-sm mb-4">{t("sections.legal")}</h3>
            <ul className="space-y-2">
              {LEGAL_LINKS.map(({ href, key }) => (
                <li key={href}>
                  <Link href={href} className="text-white/60 text-sm hover:text-white transition-colors">
                    {t(`links.${key}` as any)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bas de footer */}
        <hr className="border-white/10 mb-6" />
        <p className="text-white/40 text-xs text-center">
          &copy; {new Date().getFullYear()} HuntZen. {t("copyright")}
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3 : Remplacer le footer inline dans page.tsx**

Lire `frontend-next/src/app/page.tsx`. Ajouter l'import en haut :
```tsx
import { Footer } from "@/components/layout/footer";
```

Trouver le bloc `<footer className="bg-black text-white ...">...</footer>` (lignes ~787-826). Le remplacer par :
```tsx
<Footer />
```

- [ ] **Step 4 : Ajouter un footer sobre dans le layout dashboard**

Lire `frontend-next/src/app/(dashboard)/layout.tsx`. Trouver la fin du layout. Ajouter un footer minimaliste :
```tsx
<footer className="border-t py-3 px-4 text-center">
  <p className="text-xs text-muted-foreground">
    &copy; {new Date().getFullYear()} HuntZen &middot;{" "}
    <a href="/privacy" className="hover:underline">Confidentialité</a>
    {" · "}
    <a href="/terms" className="hover:underline">CGU</a>
    {" · "}
    <a href="/contact" className="hover:underline">Contact</a>
  </p>
</footer>
```

- [ ] **Step 5 : Test visuel**

1. Landing page : vérifier le footer 4 colonnes, les liens, les icônes réseaux sociaux
2. Dashboard : vérifier le footer minimaliste d'une ligne
3. Mobile : vérifier que les colonnes s'empilent correctement

- [ ] **Step 6 : Commit**

```bash
git add frontend-next/src/components/layout/footer.tsx \
  frontend-next/src/app/page.tsx \
  frontend-next/src/app/(dashboard)/layout.tsx \
  frontend-next/messages/fr.json
git commit -m "feat(footer): extract Footer component with 4 columns, social links, dashboard footer"
```

---

## Chunk 3 — Phase 3 : Page Expat

### Task 3.1 — Page /expat

**Files :**
- Create: `frontend-next/src/data/expat-data.json`
- Create: `frontend-next/src/app/(dashboard)/expat/page.tsx`
- Modify: `frontend-next/src/components/layout/sidebar.tsx`
- Modify: `frontend-next/messages/fr.json`

- [ ] **Step 1 : Ajouter la clé i18n sidebar**

Dans `frontend-next/messages/fr.json`, trouver la section `"sidebar"` (ou `"nav"`). Ajouter :
```json
"expat": "Guide Expat"
```

- [ ] **Step 2 : Créer expat-data.json**

Créer `frontend-next/src/data/expat-data.json` avec les données pour 15 pays. Structure complète :

```json
{
  "countries": [
    {
      "code": "CA", "name": "Canada", "flag": "🇨🇦", "currency": "CAD", "eurRate": 0.68,
      "costOfLiving": { "rent1br": 1200, "transport": 95, "food": 380, "globalIndex": 82 },
      "salaries": {
        "tech": 75000, "marketing": 55000, "finance": 68000, "health": 72000, "sales": 58000
      },
      "adminDocs": [
        { "id": "visa", "label": "Visa de travail (PVT ou permis)", "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/travailler-canada.html" },
        { "id": "residence", "label": "Permis de résidence permanente", "url": "https://www.canada.ca/fr/immigration-refugies-citoyennete/services/immigrer-canada.html" },
        { "id": "diploma", "label": "Équivalence de diplômes (WES)", "url": "https://www.wes.org/ca/" },
        { "id": "healthcare", "label": "Carte santé provinciale", "url": "https://www.canada.ca/fr/sante-canada.html" },
        { "id": "bank", "label": "Ouverture compte bancaire", "url": "https://www.canada.ca/fr/agence-consommation-matiere-financiere/services/planification-financiere/comptes-bancaires.html" },
        { "id": "consulate", "label": "Inscription au registre consulaire", "url": "https://www.service-public.fr/particuliers/vosdroits/N105" }
      ]
    },
    {
      "code": "DE", "name": "Allemagne", "flag": "🇩🇪", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 950, "transport": 85, "food": 320, "globalIndex": 75 },
      "salaries": { "tech": 65000, "marketing": 48000, "finance": 62000, "health": 58000, "sales": 52000 },
      "adminDocs": [
        { "id": "visa", "label": "Visa travail / Niederlassungserlaubnis", "url": "https://www.make-it-in-germany.com/fr/visa" },
        { "id": "residence", "label": "Titre de séjour (Aufenthaltstitel)", "url": "https://www.bamf.de" },
        { "id": "diploma", "label": "Reconnaissance de diplôme (anabin)", "url": "https://anabin.kmk.org" },
        { "id": "healthcare", "label": "Assurance maladie (Krankenversicherung)", "url": "https://www.krankenkassen.de" },
        { "id": "bank", "label": "Compte bancaire (N26, Deutsche Bank)", "url": "https://n26.com/fr-eu" },
        { "id": "consulate", "label": "Inscription au consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "CH", "name": "Suisse", "flag": "🇨🇭", "currency": "CHF", "eurRate": 1.04,
      "costOfLiving": { "rent1br": 1800, "transport": 80, "food": 600, "globalIndex": 130 },
      "salaries": { "tech": 110000, "marketing": 85000, "finance": 120000, "health": 100000, "sales": 90000 },
      "adminDocs": [
        { "id": "visa", "label": "Permis de travail B/L", "url": "https://www.sem.admin.ch/sem/fr/home/themen/arbeit.html" },
        { "id": "residence", "label": "Permis de séjour", "url": "https://www.ch.ch/fr/sejour-en-suisse" },
        { "id": "diploma", "label": "Reconnaissance de diplôme (SEFRI)", "url": "https://www.sbfi.admin.ch" },
        { "id": "healthcare", "label": "Assurance maladie obligatoire (LAMal)", "url": "https://www.bag.admin.ch" },
        { "id": "bank", "label": "Compte bancaire (PostFinance, UBS)", "url": "https://www.postfinance.ch" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "GB", "name": "Royaume-Uni", "flag": "🇬🇧", "currency": "GBP", "eurRate": 1.17,
      "costOfLiving": { "rent1br": 1400, "transport": 160, "food": 380, "globalIndex": 95 },
      "salaries": { "tech": 65000, "marketing": 48000, "finance": 72000, "health": 40000, "sales": 50000 },
      "adminDocs": [
        { "id": "visa", "label": "Skilled Worker Visa", "url": "https://www.gov.uk/skilled-worker-visa" },
        { "id": "residence", "label": "Settlement (ILR)", "url": "https://www.gov.uk/indefinite-leave-to-remain" },
        { "id": "diploma", "label": "Équivalence diplôme (UK ENIC)", "url": "https://www.enic.org.uk" },
        { "id": "healthcare", "label": "NHS Number + Surcharge Santé", "url": "https://www.nhs.uk" },
        { "id": "bank", "label": "Compte bancaire (Monzo, HSBC)", "url": "https://monzo.com" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "US", "name": "États-Unis", "flag": "🇺🇸", "currency": "USD", "eurRate": 0.92,
      "costOfLiving": { "rent1br": 1600, "transport": 120, "food": 450, "globalIndex": 100 },
      "salaries": { "tech": 120000, "marketing": 70000, "finance": 95000, "health": 85000, "sales": 75000 },
      "adminDocs": [
        { "id": "visa", "label": "Visa H-1B ou O-1", "url": "https://www.uscis.gov/working-in-the-united-states" },
        { "id": "residence", "label": "Green Card", "url": "https://www.uscis.gov/green-card" },
        { "id": "diploma", "label": "Équivalence diplôme (WES)", "url": "https://www.wes.org" },
        { "id": "healthcare", "label": "Assurance santé privée", "url": "https://www.healthcare.gov" },
        { "id": "bank", "label": "Compte bancaire (Chase, Bank of America)", "url": "https://www.chase.com" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "AE", "name": "Dubai (EAU)", "flag": "🇦🇪", "currency": "AED", "eurRate": 0.25,
      "costOfLiving": { "rent1br": 1500, "transport": 80, "food": 300, "globalIndex": 90 },
      "salaries": { "tech": 300000, "marketing": 200000, "finance": 280000, "health": 250000, "sales": 220000 },
      "adminDocs": [
        { "id": "visa", "label": "Visa travail / Freelance Visa", "url": "https://u.ae/en/information-and-services/visa-and-emirates-id/work-visa" },
        { "id": "residence", "label": "Emirates ID", "url": "https://icp.gov.ae" },
        { "id": "diploma", "label": "Attestation de diplôme (MOFA)", "url": "https://mofa.gov.ae" },
        { "id": "healthcare", "label": "Assurance santé (DHA)", "url": "https://www.dha.gov.ae" },
        { "id": "bank", "label": "Compte bancaire (Emirates NBD, Mashreq)", "url": "https://www.emiratesnbd.com" },
        { "id": "consulate", "label": "Inscription au consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "NL", "name": "Pays-Bas", "flag": "🇳🇱", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 1300, "transport": 90, "food": 350, "globalIndex": 88 },
      "salaries": { "tech": 70000, "marketing": 52000, "finance": 68000, "health": 55000, "sales": 56000 },
      "adminDocs": [
        { "id": "visa", "label": "Highly Skilled Migrant Visa", "url": "https://ind.nl/en/work/working_in_the_Netherlands/Pages/Highly-skilled-migrant.aspx" },
        { "id": "residence", "label": "Permis de séjour (MVV)", "url": "https://ind.nl" },
        { "id": "diploma", "label": "Équivalence diplôme (IDW)", "url": "https://www.idw.nl" },
        { "id": "healthcare", "label": "Assurance santé (Zorgverzekering)", "url": "https://www.government.nl/topics/health-insurance" },
        { "id": "bank", "label": "Compte bancaire (ING, ABN AMRO)", "url": "https://www.ing.nl" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "BE", "name": "Belgique", "flag": "🇧🇪", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 900, "transport": 50, "food": 300, "globalIndex": 78 },
      "salaries": { "tech": 58000, "marketing": 45000, "finance": 62000, "health": 50000, "sales": 48000 },
      "adminDocs": [
        { "id": "visa", "label": "Carte de séjour UE (libre circulation)", "url": "https://dofi.ibz.be" },
        { "id": "residence", "label": "Carte E/E+", "url": "https://www.belgium.be/fr/famille/residence" },
        { "id": "diploma", "label": "Équivalence diplôme (NARIC)", "url": "https://www.naricvlaanderen.be" },
        { "id": "healthcare", "label": "Mutuelle (Mutualité socialiste...)", "url": "https://www.riziv.fgov.be" },
        { "id": "bank", "label": "Compte bancaire (BNP Paribas Fortis, ING)", "url": "https://www.bnpparibasfortis.be" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "ES", "name": "Espagne", "flag": "🇪🇸", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 750, "transport": 55, "food": 280, "globalIndex": 65 },
      "salaries": { "tech": 38000, "marketing": 28000, "finance": 42000, "health": 32000, "sales": 30000 },
      "adminDocs": [
        { "id": "visa", "label": "NIE + carte de séjour UE", "url": "https://www.interior.gob.es" },
        { "id": "residence", "label": "Certificat de résidence", "url": "https://www.exteriores.gob.es" },
        { "id": "diploma", "label": "Homologation diplôme (MECD)", "url": "https://www.educacion.gob.es" },
        { "id": "healthcare", "label": "Carte santé européenne + mutuelle", "url": "https://www.seg-social.es" },
        { "id": "bank", "label": "Compte bancaire (Santander, BBVA)", "url": "https://www.santander.es" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "PT", "name": "Portugal", "flag": "🇵🇹", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 900, "transport": 45, "food": 260, "globalIndex": 62 },
      "salaries": { "tech": 32000, "marketing": 24000, "finance": 35000, "health": 28000, "sales": 26000 },
      "adminDocs": [
        { "id": "visa", "label": "NIF + carte de séjour UE", "url": "https://www.sef.pt" },
        { "id": "residence", "label": "Autorisation de résidence", "url": "https://www.sef.pt" },
        { "id": "diploma", "label": "Équivalence diplôme (DGES)", "url": "https://www.dges.gov.pt" },
        { "id": "healthcare", "label": "SNS (Serviço Nacional de Saúde)", "url": "https://www.sns.gov.pt" },
        { "id": "bank", "label": "Compte bancaire (Millenium BCP, Revolut)", "url": "https://www.millenniumbcp.pt" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "LU", "name": "Luxembourg", "flag": "🇱🇺", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 1400, "transport": 0, "food": 360, "globalIndex": 100 },
      "salaries": { "tech": 85000, "marketing": 65000, "finance": 95000, "health": 70000, "sales": 72000 },
      "adminDocs": [
        { "id": "visa", "label": "Carte de séjour UE", "url": "https://guichet.public.lu/fr/citoyens/immigration.html" },
        { "id": "residence", "label": "Déclaration d'arrivée en mairie", "url": "https://guichet.public.lu" },
        { "id": "diploma", "label": "Reconnaissance diplôme (MENJE)", "url": "https://men.public.lu" },
        { "id": "healthcare", "label": "CNS (Caisse Nationale Santé)", "url": "https://www.cns.lu" },
        { "id": "bank", "label": "Compte bancaire (BGL BNP, Banque de Luxembourg)", "url": "https://www.bgl.lu" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "AU", "name": "Australie", "flag": "🇦🇺", "currency": "AUD", "eurRate": 0.59,
      "costOfLiving": { "rent1br": 1300, "transport": 110, "food": 400, "globalIndex": 85 },
      "salaries": { "tech": 100000, "marketing": 75000, "finance": 90000, "health": 80000, "sales": 70000 },
      "adminDocs": [
        { "id": "visa", "label": "Visa compétences (482/186)", "url": "https://immi.homeaffairs.gov.au" },
        { "id": "residence", "label": "Résidence permanente", "url": "https://immi.homeaffairs.gov.au" },
        { "id": "diploma", "label": "Évaluation compétences (Skills Assessment)", "url": "https://www.aitsl.edu.au" },
        { "id": "healthcare", "label": "Medicare + complémentaire", "url": "https://www.servicesaustralia.gov.au/medicare" },
        { "id": "bank", "label": "Compte bancaire (ANZ, CommBank)", "url": "https://www.anz.com.au" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "SG", "name": "Singapour", "flag": "🇸🇬", "currency": "SGD", "eurRate": 0.68,
      "costOfLiving": { "rent1br": 2000, "transport": 90, "food": 350, "globalIndex": 115 },
      "salaries": { "tech": 85000, "marketing": 60000, "finance": 90000, "health": 65000, "sales": 65000 },
      "adminDocs": [
        { "id": "visa", "label": "Employment Pass (EP)", "url": "https://www.mom.gov.sg/passes-and-permits/employment-pass" },
        { "id": "residence", "label": "Permanent Resident (PR)", "url": "https://www.ica.gov.sg" },
        { "id": "diploma", "label": "Vérification diplôme (MOE)", "url": "https://www.moe.gov.sg" },
        { "id": "healthcare", "label": "MediShield Life + Medisave", "url": "https://www.cpf.gov.sg" },
        { "id": "bank", "label": "Compte bancaire (DBS, OCBC)", "url": "https://www.dbs.com.sg" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "MA", "name": "Maroc", "flag": "🇲🇦", "currency": "MAD", "eurRate": 0.093,
      "costOfLiving": { "rent1br": 400, "transport": 25, "food": 180, "globalIndex": 35 },
      "salaries": { "tech": 180000, "marketing": 120000, "finance": 200000, "health": 150000, "sales": 130000 },
      "adminDocs": [
        { "id": "visa", "label": "Visa long séjour / Carte de résidence", "url": "https://www.service-public.ma" },
        { "id": "residence", "label": "Carte d'immatriculation", "url": "https://www.interieur.gov.ma" },
        { "id": "diploma", "label": "Légalisation diplôme (MENFPESRS)", "url": "https://www.men.gov.ma" },
        { "id": "healthcare", "label": "AMO ou assurance privée", "url": "https://www.cnops.org.ma" },
        { "id": "bank", "label": "Compte bancaire (Attijariwafa, CIH)", "url": "https://www.attijariwafabank.com" },
        { "id": "consulate", "label": "Inscription consulat français", "url": "https://www.diplomatie.gouv.fr" }
      ]
    },
    {
      "code": "FR", "name": "France (référence)", "flag": "🇫🇷", "currency": "EUR", "eurRate": 1,
      "costOfLiving": { "rent1br": 800, "transport": 75, "food": 300, "globalIndex": 100 },
      "salaries": { "tech": 45000, "marketing": 35000, "finance": 48000, "health": 38000, "sales": 38000 },
      "adminDocs": []
    }
  ]
}
```

- [ ] **Step 3 : Créer la page expat**

Créer `frontend-next/src/app/(dashboard)/expat/page.tsx` :

```tsx
"use client";

import { useState, useEffect } from "react";
import { Globe, MapPin, Briefcase, FileText, MessageSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import expatData from "@/data/expat-data.json";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Country = typeof expatData.countries[0];

const DOMAIN_LABELS: Record<string, string> = {
  tech: "Tech & IT",
  marketing: "Marketing",
  finance: "Finance",
  health: "Santé",
  sales: "Commerce",
};

function formatSalary(amount: number, currency: string, eurRate: number) {
  const eur = Math.round(amount * eurRate);
  if (currency === "EUR") return `${amount.toLocaleString("fr-FR")} €/an`;
  return `${amount.toLocaleString("fr-FR")} ${currency}/an ≈ ${eur.toLocaleString("fr-FR")} €`;
}

export default function ExpatPage() {
  const router = useRouter();
  const [selectedCode, setSelectedCode] = useState("CA");
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});

  const country = expatData.countries.find((c) => c.code === selectedCode)!;

  // Charger la checklist depuis localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`expat_checklist_${selectedCode}`);
    if (saved) {
      try { setCheckedDocs(JSON.parse(saved)); } catch {}
    } else {
      setCheckedDocs({});
    }
  }, [selectedCode]);

  const toggleDoc = (id: string) => {
    const updated = { ...checkedDocs, [id]: !checkedDocs[id] };
    setCheckedDocs(updated);
    localStorage.setItem(`expat_checklist_${selectedCode}`, JSON.stringify(updated));
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-100">
          <Globe className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Guide Expatriation</h1>
          <p className="text-sm text-muted-foreground">Salaires, coût de la vie et démarches administratives par pays</p>
        </div>
      </div>

      {/* Sélecteur de pays */}
      <div>
        <label className="text-sm font-medium mb-2 block">Destination</label>
        <Select value={selectedCode} onValueChange={setSelectedCode}>
          <SelectTrigger className="w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {expatData.countries.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.flag} {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Section Niveau de vie */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Niveau de vie — {country.flag} {country.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Loyer 1ch (centre-ville)</p>
              <p className="text-lg font-bold">{country.costOfLiving.rent1br.toLocaleString("fr-FR")} {country.currency}</p>
              <p className="text-xs text-muted-foreground">/ mois</p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Transports</p>
              <p className="text-lg font-bold">{country.costOfLiving.transport} {country.currency}</p>
              <p className="text-xs text-muted-foreground">/ mois</p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Alimentation</p>
              <p className="text-lg font-bold">{country.costOfLiving.food} {country.currency}</p>
              <p className="text-xs text-muted-foreground">/ mois</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Indice coût de vie</p>
              <p className="text-lg font-bold text-blue-700">{country.costOfLiving.globalIndex}</p>
              <p className="text-xs text-muted-foreground">France = 100</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section Salaires */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Briefcase className="w-4 h-4" /> Salaires médians bruts annuels
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">Domaine</th>
                  <th className="text-right py-2 font-medium">Salaire</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(country.salaries).map(([domain, amount]) => (
                  <tr key={domain} className="border-b last:border-0">
                    <td className="py-2.5 pr-4 text-muted-foreground">{DOMAIN_LABELS[domain] || domain}</td>
                    <td className="py-2.5 text-right font-mono text-xs">
                      {formatSalary(amount as number, country.currency, country.eurRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            * Données indicatives. Les salaires varient selon l'expérience, le secteur et la ville.
          </p>
        </CardContent>
      </Card>

      {/* Section Documents administratifs */}
      {country.adminDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Démarches administratives
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {country.adminDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={!!checkedDocs[doc.id]}
                      onChange={() => toggleDoc(doc.id)}
                      className="w-4 h-4 rounded"
                    />
                    <span className={`text-sm ${checkedDocs[doc.id] ? "line-through text-muted-foreground" : ""}`}>
                      {doc.label}
                    </span>
                  </label>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    Site officiel →
                  </a>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Votre progression est sauvegardée automatiquement dans votre navigateur.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Section Coach Expat */}
      <Card className="bg-gradient-to-br from-blue-50 to-teal-50 border-blue-100">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Des questions sur votre expatriation ?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Notre coach IA peut vous aider à préparer votre projet d'expatriation en {country.name}.
              </p>
            </div>
            <Button
              onClick={() =>
                router.push(
                  `/assistant?prefill=${encodeURIComponent(
                    `Je souhaite m'expatrier en ${country.name}. Peux-tu m'aider à préparer mon projet ?`
                  )}`
                )
              }
              className="shrink-0 gap-2"
            >
              <MessageSquare className="w-4 h-4" />
              Demander au Coach
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4 : Ajouter l'entrée dans la sidebar**

Lire `frontend-next/src/components/layout/sidebar.tsx`. Ajouter l'import :
```tsx
import { Globe } from "lucide-react"; // (si pas déjà importé depuis lucide-react)
```
Vérifier que `Globe` n'est pas déjà dans les imports — si oui, ne rien ajouter.

Trouver le tableau de navigation. Après l'item `Candidatures`, ajouter :
```tsx
{
  name: t("nav.expat"),
  href: "/expat",
  icon: Globe,
},
```

Ajouter aussi dans `messages/fr.json` sous `"nav"` :
```json
"expat": "Guide Expat"
```

- [ ] **Step 5 : Test**

1. Ouvrir la sidebar → vérifier l'item "Guide Expat" avec l'icône Globe
2. Naviguer vers `/expat` → vérifier que la page charge
3. Changer de pays → vérifier que les 4 sections se mettent à jour
4. Cocher des docs → recharger la page → vérifier que les coches persistent
5. Cliquer "Demander au Coach" → vérifier la redirection avec le prefill

- [ ] **Step 6 : Commit**

```bash
git add frontend-next/src/data/expat-data.json \
  frontend-next/src/app/(dashboard)/expat/page.tsx \
  frontend-next/src/components/layout/sidebar.tsx \
  frontend-next/messages/fr.json
git commit -m "feat(expat): add expatriation guide page with 15 countries, salary data, and admin checklist"
```

---

## Chunk 4 — Phase 4 : Design & UX

### Task 4.1 — Transition identitaire assistant

**Files :**
- Modify: `frontend-next/src/config/assistants.ts`
- Modify: `frontend-next/src/app/(dashboard)/assistant/page.tsx`
- Modify: `frontend-next/src/components/assistant/bot-selector.tsx`

- [ ] **Step 1 : Lire assistants.ts**

```bash
cat frontend-next/src/config/assistants.ts
```
Identifier la structure de chaque assistant (type, interface, propriétés).

- [ ] **Step 2 : Ajouter accentColor au type + config**

Dans `assistants.ts` (ou le fichier de types lié), ajouter `accentColor: string` à l'interface `AssistantConfig`.

Pour chaque assistant dans le tableau, ajouter `accentColor` :
```ts
{ id: "career-coach",  personaName: "Nova",  accentColor: "#7C3AED", ... }
{ id: "job-scout",     personaName: "Maria", accentColor: "#0D9488", ... }
{ id: "cv-analyzer",   personaName: "Sofia", accentColor: "#EC4899", ... }
{ id: "branding",      personaName: "Lucas", accentColor: "#EA580C", ... }
{ id: "interview-sim", personaName: "Jeff",  accentColor: "#DC2626", ... }
```

- [ ] **Step 3 : Lire assistant/page.tsx**

```bash
cat "frontend-next/src/app/(dashboard)/assistant/page.tsx"
```
Identifier où le persona est affiché et où les messages du chat sont rendus.

- [ ] **Step 4 : Appliquer la couleur d'accent dynamique**

Dans `assistant/page.tsx`, lire la config du persona actif et appliquer la couleur :

```tsx
const activeConfig = ASSISTANTS.find(a => a.id === selectedAssistant)
const accentColor = activeConfig?.accentColor ?? "#2563EB"
```

Sur le container principal du chat, ajouter :
```tsx
style={{ borderColor: accentColor, borderLeftWidth: 3 }}
```

Sur l'avatar/indicateur du persona dans le header, ajouter :
```tsx
style={{ backgroundColor: `${accentColor}20`, color: accentColor }}
```

- [ ] **Step 5 : Injecter un message système au changement de persona**

Dans la fonction qui gère le changement d'assistant (chercher `onAssistantChange` ou l'équivalent), ajouter après le changement :

```tsx
const systemMessage = {
  id: `system-change-${Date.now()}`,
  role: "assistant" as const,
  content: `*Vous parlez maintenant avec **${activeConfig?.personaName}** — ${activeConfig?.description}*`,
  isSystem: true,
  timestamp: new Date(),
}
setMessages(prev => [...prev, systemMessage])
```

Dans le rendu des messages, ajouter un style distinct pour `isSystem === true` :
```tsx
{message.isSystem && (
  <div
    className="text-xs text-center py-1.5 px-3 rounded-full mx-auto max-w-sm italic"
    style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
  >
    {message.content}
  </div>
)}
```

- [ ] **Step 6 : Animation fade-in au changement**

Ajouter un state `transitioning` qui se toggle brièvement lors du changement :
```tsx
const [transitioning, setTransitioning] = useState(false)

const handleAssistantChange = (type: AssistantType) => {
  setTransitioning(true)
  setTimeout(() => setTransitioning(false), 300)
  // ... reste du changement
}
```

Sur le header du chat, ajouter la classe conditionnelle :
```tsx
className={cn("transition-opacity duration-300", transitioning ? "opacity-0" : "opacity-100")}
```

- [ ] **Step 7 : Test visuel**

1. Ouvrir `/assistant`
2. Sélectionner Nova → la bordure gauche du chat doit être violette `#7C3AED`
3. Changer pour Maria → animation fade 0.3s + bordure teal `#0D9488` + message système
4. Vérifier sur mobile que la bordure ne casse pas le layout

- [ ] **Step 8 : Commit**

```bash
git add frontend-next/src/config/assistants.ts \
  "frontend-next/src/app/(dashboard)/assistant/page.tsx" \
  frontend-next/src/components/assistant/bot-selector.tsx
git commit -m "feat(assistant): persona identity transition with accent color, fade animation, system message"
```

---

### Task 4.2 — Wording accueil (landing page)

**Files :**
- Modify: `frontend-next/messages/fr.json`
- Modify: `frontend-next/src/app/page.tsx`

- [ ] **Step 1 : Mettre à jour les clés hero dans fr.json**

Lire `frontend-next/messages/fr.json`. Trouver la section `"hero"`. Mettre à jour :
```json
"hero": {
  "title": "Trouvez votre prochain emploi avec un CV qui passe les filtres ATS",
  "subtitle": "CV certifié ATS · Coach IA personnalisé · Offres ciblées pour votre profil",
  "ctaSearch": "Commencer gratuitement",
  "ctaDiscover": "Voir comment ça marche",
  "socialProof": "Déjà +2 000 candidats accompagnés"
}
```

- [ ] **Step 2 : Mettre à jour les pain points**

Dans `"painPoints"`, réécrire chaque point pour être plus personnel et direct. Exemple de structure :
```json
"painPoints": {
  "title": "Votre recherche d'emploi vous épuise ?",
  "ghosting": {
    "title": "Vos CV restent sans réponse ?",
    "description": "80% des CVs sont filtrés par des logiciels avant même d'atteindre un recruteur. HuntZen génère un CV certifié ATS dès le départ."
  },
  "exhausting": {
    "title": "La recherche manuelle est chronophage ?",
    "description": "Agrégez des milliers d'offres de France Travail, Indeed, LinkedIn et plus encore en un seul endroit."
  },
  "negotiation": {
    "title": "Vous ne savez pas quoi demander en salaire ?",
    "description": "Notre coach IA vous prépare à chaque entretien et vous aide à négocier votre juste valeur."
  },
  "feedback": {
    "title": "Vous candidatez dans le vide ?",
    "description": "Recevez un feedback immédiat sur votre CV et adaptez-le à chaque offre en moins de 2 minutes."
  }
}
```

Adapter selon les clés réelles présentes dans le fichier.

- [ ] **Step 3 : Ajouter la social proof dans page.tsx**

Lire `frontend-next/src/app/page.tsx`. Trouver le CTA principal (bouton "Commencer gratuitement"). Juste en dessous, ajouter :
```tsx
<p className="text-white/60 text-sm mt-3">{tHero("socialProof")}</p>
```

- [ ] **Step 4 : Ajouter le disclaimer stats**

Trouver la section stats. Après les stats, ajouter :
```tsx
<p className="text-xs text-white/40 text-center mt-2">{tStats("disclaimer")}</p>
```

Ajouter dans `fr.json` sous `"stats"` :
```json
"disclaimer": "* Données indicatives basées sur nos utilisateurs actifs"
```

- [ ] **Step 5 : Validation (requiert intervention humaine)**

Soumettre la PR avec uniquement les changements `fr.json` + `page.tsx`.
**ATTENDRE la validation de Wissem avant de merger.**

- [ ] **Step 6 : Commit**

```bash
git add frontend-next/messages/fr.json frontend-next/src/app/page.tsx
git commit -m "feat(landing): update hero copy, pain points wording, add social proof + stats disclaimer"
```

---

### Task 4.3 — Astérisque ATS + Modal confirmation CV

**Files :**
- Modify: `frontend-next/src/components/cv/wizard/step3-results.tsx`
- Modify: `frontend-next/src/components/cv/wizard-container.tsx`

- [ ] **Step 1 : Lire step3-results.tsx et wizard-container.tsx**

```bash
wc -l frontend-next/src/components/cv/wizard/step3-results.tsx
wc -l frontend-next/src/components/cv/wizard-container.tsx
```
Identifier les imports existants et la structure des deux fichiers.

- [ ] **Step 2 : Ajouter l'astérisque dans step3-results.tsx**

S'assurer que `Popover`, `PopoverContent`, `PopoverTrigger` sont importés depuis `@/components/ui/popover`.

Trouver le bloc du `ScoreRing` dans le JSX. Juste après le ScoreRing et avant les boutons d'action, ajouter :

```tsx
{/* Astérisque ATS — explique pourquoi le CV paraît simple */}
<div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2">
  <span>* Votre CV paraît volontairement simple — c'est intentionnel pour maximiser la compatibilité ATS.</span>
  <Popover>
    <PopoverTrigger asChild>
      <button className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] font-bold hover:bg-muted/70 transition-colors">
        ?
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-72 text-sm" side="top">
      Les ATS (logiciels de tri de CV) préfèrent les CV structurés et épurés.
      Notre format maximise vos chances de passer le filtre automatique avant d'atteindre un recruteur humain.
    </PopoverContent>
  </Popover>
</div>
```

- [ ] **Step 3 : Lire wizard-container.tsx pour identifier le point de génération**

```bash
grep -n "generate\|pdf\|download\|Generate" frontend-next/src/components/cv/wizard-container.tsx | head -20
```

Identifier la fonction qui déclenche la génération du PDF.

- [ ] **Step 4 : Ajouter le modal de confirmation dans wizard-container.tsx**

Importer les composants Dialog s'ils ne sont pas déjà importés :
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
```

Ajouter les states en haut du composant :
```tsx
const [showAtsModal, setShowAtsModal] = useState(false)
const [atsDismissed, setAtsDismissed] = useState(
  () => typeof window !== "undefined"
    ? localStorage.getItem("huntzen_ats_modal_dismissed") === "1"
    : false
)
```

Envelopper l'appel à la fonction de génération :
```tsx
const handleGenerateCV = () => {
  if (!atsDismissed) {
    setShowAtsModal(true)
    return
  }
  triggerGeneration() // remplacer par le nom réel de la fonction existante
}
```

Ajouter le modal dans le JSX (avant la fermeture du composant) :
```tsx
<Dialog open={showAtsModal} onOpenChange={setShowAtsModal}>
  <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Votre CV sera volontairement épuré</DialogTitle>
    </DialogHeader>
    <div className="space-y-3 text-sm text-muted-foreground">
      <p>
        Nous générons votre CV dans un format minimaliste et structuré, optimisé pour passer
        les filtres ATS automatiques.
      </p>
      <p className="font-medium text-foreground">
        Il peut paraître "simple" — c'est exactement ce qui le rend efficace.
      </p>
      <ul className="space-y-1.5 mt-2">
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Police standard (Arial/Calibri)
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Structure claire et hiérarchisée
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Pas de tableaux ni d'images
        </li>
        <li className="flex items-center gap-2">
          <span className="text-green-500">✓</span> Certifié par HuntZen ATS Optimizer
        </li>
      </ul>
      <label className="flex items-center gap-2 cursor-pointer mt-3 pt-3 border-t">
        <input
          type="checkbox"
          className="w-4 h-4 rounded"
          onChange={(e) => {
            if (e.target.checked) {
              localStorage.setItem("huntzen_ats_modal_dismissed", "1")
              setAtsDismissed(true)
            }
          }}
        />
        <span>Ne plus afficher ce message</span>
      </label>
    </div>
    <DialogFooter>
      <Button
        onClick={() => {
          setShowAtsModal(false)
          triggerGeneration() // remplacer par le nom réel
        }}
        className="w-full sm:w-auto"
      >
        J'ai compris, générer mon CV
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5 : Connecter handleGenerateCV au bouton de génération existant**

Trouver le bouton/action qui déclenche la génération. Remplacer l'appel existant par `handleGenerateCV()`.

- [ ] **Step 6 : Test**

1. Aller dans le CV adapter / wizard
2. Cliquer "Générer mon CV" → le modal doit apparaître
3. Cliquer "J'ai compris" → la génération démarre
4. Tester "Ne plus afficher" → cliquer Générer à nouveau → modal ne réapparaît pas
5. Vider localStorage → le modal réapparaît

Tester l'astérisque :
1. Analyser un CV → vérifier l'astérisque sous le score ring
2. Cliquer `(?)` → popover explicatif s'ouvre

- [ ] **Step 7 : Commit**

```bash
git add frontend-next/src/components/cv/wizard/step3-results.tsx \
  frontend-next/src/components/cv/wizard-container.tsx
git commit -m "feat(cv-ux): add ATS asterisk explanation + generation confirmation modal with dismiss"
```

---

## Chunk 5 — Phase 5 : Admin diagnostic

### Task 5.1 — Diagnostic complet admin + corrections

**Files :**
- Potentiellement : tous les fichiers `frontend-next/src/app/admin/*` et `backend/src/api/routes/admin.py`

- [ ] **Step 1 : Lister toutes les pages admin**

```bash
find frontend-next/src/app/admin -name "page.tsx" | sort
```

- [ ] **Step 2 : Vérifier le flag admin dans Supabase**

Dans Supabase Dashboard → SQL Editor :
```sql
SELECT id, email, is_admin
FROM profiles
WHERE is_admin = TRUE
LIMIT 10;
```
Si aucun résultat → l'utilisateur admin n'a pas le flag. Exécuter :
```sql
UPDATE profiles SET is_admin = TRUE WHERE email = 'ton@email.com';
```

- [ ] **Step 3 : Tester chaque page admin avec les DevTools ouverts**

Pour chaque page, noter :
- Charge ✅ / Crash ❌ / Rendu vide ⚠️
- Erreurs console (F12 → Console)
- Requêtes réseau en erreur (F12 → Network → filter 4xx/5xx)

Pages à tester dans l'ordre :
1. `/admin/dashboard`
2. `/admin/users`
3. `/admin/users/[un-vrai-userId]` (copier un ID depuis `/admin/users`)
4. `/admin/plans`
5. `/admin/coupons`
6. `/admin/referrals`
7. `/admin/logs`
8. `/admin/support`
9. `/admin/analytics`
10. `/admin/live`
11. `/admin/prompts`
12. `/admin/segments`
13. `/admin/stress`
14. `/admin/recruiter-requests`

Créer un tableau de résultats avant de toucher au code.

- [ ] **Step 4 : Lire les hooks admin en erreur**

Pour chaque page en erreur, lire le hook correspondant :
```bash
cat frontend-next/src/hooks/admin/use-admin-[nom].ts
```
Identifier les endpoints appelés et les erreurs de parsing.

- [ ] **Step 5 : Corriger les erreurs backend**

Pour chaque endpoint 4xx/5xx identifié, lire le handler dans `backend/src/api/routes/admin.py` et corriger. Pattern commun d'erreur :
- Query Supabase qui retourne `None` au lieu d'un tableau vide → ajouter `.or_([], ...)` ou valeur par défaut
- Champ manquant dans le schéma de réponse → ajouter le champ ou le rendre optionnel

- [ ] **Step 6 : Corriger les erreurs frontend**

Pour chaque hook qui crash sur une réponse vide ou inattendue, ajouter une gestion d'erreur :
```tsx
// Avant
setData(res)

// Après
if (res && !res.error) setData(res)
else setError(res?.error || "Erreur de chargement")
```

Pour les pages avec rendu silencieux, ajouter :
```tsx
{error && (
  <div className="text-center py-8 text-sm text-muted-foreground">
    {error} — <button onClick={refetch} className="underline">Réessayer</button>
  </div>
)}
```

- [ ] **Step 7 : Tester les actions utilisateur**

Avec un user de test (pas un vrai utilisateur) :
- [ ] Force plan → plan changé en DB
- [ ] Suspendre un user → user bloqué
- [ ] Réactiver un user → user débloqué
- [ ] Grant days → jours de subscription ajoutés
- [ ] Ajouter une note admin → note apparaît dans le détail user

Si une action ne fonctionne pas → lire l'endpoint backend correspondant et corriger.

- [ ] **Step 8 : Commit global**

```bash
git add backend/src/api/routes/admin.py \
  frontend-next/src/hooks/admin/ \
  frontend-next/src/app/admin/
git commit -m "fix(admin): fix page loading errors, add error states, verify all actions"
```

---

## Prompt de Handoff Contexte

```
Je travaille sur le projet HuntZen (Next.js 14 + FastAPI + Supabase) situé dans /Users/wissem/HuntzenIA/huntzen_jobsearch.

PLAN D'IMPLÉMENTATION : docs/superpowers/plans/2026-03-17-huntzen-master-plan.md
SPEC COMPLÈTE : docs/superpowers/specs/2026-03-17-huntzen-master-plan-design.md

ÉTAT D'AVANCEMENT :
- [ ] Chunk 1 — Phase 1 : Bugs critiques
  - [ ] Task 1.1 — Parrainage
  - [ ] Task 1.2 — ATS watermark
  - [ ] Task 1.3 — Offres recommandées
  - [ ] Task 1.4 — Points négatifs CV
- [ ] Chunk 2 — Phase 2 : Backend logique
  - [ ] Task 2.1 — Mail recruteur BETA
  - [ ] Task 2.2 — Page contact
  - [ ] Task 2.3 — Footer refonte
- [ ] Chunk 3 — Phase 3 : Page Expat
  - [ ] Task 3.1 — Page /expat
- [ ] Chunk 4 — Phase 4 : Design & UX
  - [ ] Task 4.1 — Transition assistant
  - [ ] Task 4.2 — Wording accueil
  - [ ] Task 4.3 — Astérisque + Modal CV
- [ ] Chunk 5 — Phase 5 : Admin
  - [ ] Task 5.1 — Diagnostic admin

EN COURS : Task [X.Y] — [description]
DERNIÈRE ACTION : [description précise de la dernière modification effectuée]
PROCHAINE ÉTAPE : Step [N] de Task [X.Y] — [description de l'action]

RÈGLES PROJET :
- Répondre en français
- Pas de "Co-Authored-By" dans les commits
- Ne pas committer les docs/plans/specs
- Lire les fichiers avant de les modifier
- Vérifier les imports avant d'en ajouter

COMMANDE : Continuer depuis Step [N] de Task [X.Y] : [instruction précise]
```

---

*Plan rédigé le 2026-03-17. 5 chunks, 13 tasks, ~65 steps.*
