# ATS Analysis — Real LLM Reflection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the generic ATS analysis prompt with a rich, structured prompt that forces the LLM to justify every score with specific references to the CV content, and propagate those explanations to the frontend tooltips.

**Architecture:** The Modal app (`scripts/deployment/modal_app.py`) is the source of truth for analysis. We upgrade the `analyze_cv_with_groq` prompt to produce per-score explanations and specific strengths/weaknesses. New fields are optional, so old analyses in DB still display correctly. The frontend reads new `_explanation` fields and passes them to the existing `ScoreBreakdownV2` tooltip system.

**Tech Stack:** Python (Modal/Groq), TypeScript/React (Next.js), Pydantic schemas already in place.

---

## Pre-flight checks

Before starting:
1. Confirm `scripts/deployment/modal_app.py` is the deployed Modal app (it is — line 42: `app = modal.App("huntzen-cv-processor")`)
2. Note `ScoreBreakdownV2` already supports `explanation?: string` on `BreakdownItem` (score-breakdown-v2.tsx:26)
3. Note `DEFAULT_EXPLANATIONS` in `score-breakdown-v2.tsx:49` act as fallback — no change needed there

---

## Task 1: Upgrade the Groq analysis prompt in the Modal app

**Files:**
- Modify: `scripts/deployment/modal_app.py` — `analyze_cv_with_groq()` function (lines ~430-454)

**Context:**
The current prompt asks vaguely for "liste de 3-5 points forts" without forcing the LLM to cite actual CV content. The new prompt must:
- Force each score to include a `_explanation` string with specific references to the CV (company names, years, technologies, numbers)
- Force `strengths` to cite verifiable facts ("5 ans chez Airbus, certifications AWS 2023") not generic praise
- Force `improvements` to be actionable and name specific sections/dates/technologies missing
- Add `job_match_explanation` when job_description is provided

**Step 1: Replace the `prompt` variable in `analyze_cv_with_groq`**

Find the existing `prompt = f"""Tu es un expert...` block (around line 430) and replace the entire prompt with:

```python
    # Build job match instruction
    job_match_instruction = ""
    if job_description:
        job_match_instruction = f"""
L'offre d'emploi à matcher :
---
{job_description}
---

Pour le matching, analyse précisément quels mots-clés et compétences de l'offre sont présents ou absents du CV."""

    prompt = f"""Tu es un expert ATS et recruteur senior. Analyse ce CV avec rigueur et précision.

RÈGLE ABSOLUE : Chaque explication doit citer le contenu RÉEL du CV (noms d'entreprises, technologies, dates, chiffres). Interdit d'écrire des phrases génériques comme "votre CV est bien structuré".

CV à analyser :
---
{cv_text}
---
{job_match_instruction}

Réponds UNIQUEMENT avec ce JSON (sans markdown, sans texte avant ou après) :
{{
    "ats_score": {{
        "overall_score": <entier 0-100 : moyenne pondérée des 4 scores>,
        "formatting_score": <entier 0-100>,
        "formatting_explanation": "<1-2 phrases citant des éléments CONCRETS du CV : uniformité des dates, présence/absence de sections standard, longueur, polices>",
        "keywords_score": <entier 0-100>,
        "keywords_explanation": "<1-2 phrases listant les mots-clés techniques TROUVÉS et les ABSENTS importants pour ce profil>",
        "structure_score": <entier 0-100>,
        "structure_explanation": "<1-2 phrases sur la logique de la chronologie, les sections présentes/manquantes, l'ordre>",
        "readability_score": <entier 0-100>,
        "readability_explanation": "<1-2 phrases sur les bullets points : sont-ils des verbes d'action + résultat chiffré, ou des descriptions vagues ?>"
    }},
    "strengths": [
        "<point fort 1 : cite un FAIT précis du CV — ex: 'Certification AWS Solutions Architect obtenue en 2023, très valorisée'>",
        "<point fort 2 : cite un FAIT précis — ex: 'Réduction de 40% du temps de traitement batch chez Airbus (2024), résultat quantifié fort'>",
        "<point fort 3 optionnel : autre fait concret>"
    ],
    "improvements": [
        "<amélioration 1 : actionnable et spécifique — ex: 'Ajouter un résumé professionnel de 3-4 lignes : l'ATS lit ce bloc en priorité'>",
        "<amélioration 2 : cite la section problématique — ex: 'Postes 2019-2021 chez Orange : remplacer les descriptions de tâches par verbe d'action + résultat chiffré'>",
        "<amélioration 3 : mots-clés manquants — ex: 'Kubernetes, Terraform et dbt sont absents alors qu'ils apparaissent dans 80% des offres Senior Data Engineer'>"
    ],
    "missing_sections": [<liste des sections standard ATS manquantes, ex: "Résumé professionnel", "Liens GitHub">],
    "keywords_found": [<liste des mots-clés techniques pertinents TROUVÉS dans le CV>],
    "keywords_missing": [<liste des mots-clés importants pour ce profil qui sont ABSENTS>],
    "job_match_score": {job_match_placeholder},
    "job_match_explanation": {job_match_explanation_placeholder}
}}"""
```

Note: the `job_match_placeholder` and `job_match_explanation_placeholder` need to be set based on whether `job_description` is provided. Use this pattern for the full replacement:

```python
def analyze_cv_with_groq(cv_text: str, job_description: Optional[str] = None) -> Dict[str, Any]:
    """
    Analyze CV using Groq LLM with detailed per-score explanations.
    Forces LLM to justify each score with specific CV content references.
    """
    from groq import Groq

    print(f"🤖 Analyzing CV with Groq (length: {len(cv_text)} chars)")
    start_time = time.time()

    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise ValueError("GROQ_API_KEY not found in Modal secrets")

    client = Groq(api_key=groq_api_key)

    job_match_section = ""
    if job_description:
        job_match_section = f"""
Offre d'emploi à matcher :
---
{job_description}
---
"""

    job_match_json = '"job_match_score": <entier 0-100 basé sur la correspondance avec l\'offre>,'
    job_match_explanation_json = '"job_match_explanation": "<2-3 phrases : score global, compétences CV qui matchent l\'offre, compétences requises par l\'offre mais absentes du CV>"'
    if not job_description:
        job_match_json = '"job_match_score": null,'
        job_match_explanation_json = '"job_match_explanation": null'

    prompt = f"""Tu es un expert ATS et recruteur senior. Analyse ce CV avec rigueur et précision.

RÈGLE ABSOLUE : Chaque explication DOIT citer le contenu réel du CV (noms d'entreprises, technologies, dates, chiffres trouvés dans le texte). Interdit d'écrire des phrases génériques.

CV à analyser :
---
{cv_text}
---
{job_match_section}
Réponds UNIQUEMENT avec le JSON suivant (sans markdown, sans texte additionnel) :
{{
    "ats_score": {{
        "overall_score": <entier 0-100 : moyenne pondérée des 4 scores ci-dessous>,
        "formatting_score": <entier 0-100>,
        "formatting_explanation": "<1-2 phrases citant des éléments concrets : uniformité des dates, sections présentes, longueur du CV>",
        "keywords_score": <entier 0-100>,
        "keywords_explanation": "<1-2 phrases listant les mots-clés techniques trouvés ET les importants qui manquent>",
        "structure_score": <entier 0-100>,
        "structure_explanation": "<1-2 phrases sur la chronologie, l'ordre des sections, les sections présentes ou absentes>",
        "readability_score": <entier 0-100>,
        "readability_explanation": "<1-2 phrases sur la qualité des bullet points : verbes d'action, résultats chiffrés ou descriptions vagues>"
    }},
    "strengths": [
        "<point fort concret qui cite un fait du CV>",
        "<point fort concret qui cite un fait du CV>",
        "<point fort concret qui cite un fait du CV>"
    ],
    "improvements": [
        "<amélioration actionnable et spécifique, citant la section ou l'élément concerné>",
        "<amélioration actionnable et spécifique>",
        "<amélioration actionnable et spécifique>"
    ],
    "missing_sections": ["<section ATS standard absente>"],
    "keywords_found": ["<mot-clé technique trouvé>"],
    "keywords_missing": ["<mot-clé important absent>"],
    {job_match_json}
    {job_match_explanation_json}
}}"""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {
                    "role": "system",
                    "content": "Tu es un expert ATS et recruteur. Tu analyses des CV avec précision et tu réponds toujours en JSON valide, sans markdown."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=2500
        )

        result_text = response.choices[0].message.content.strip()

        # Strip markdown code blocks if present
        if result_text.startswith("```json"):
            result_text = result_text[7:]
        if result_text.startswith("```"):
            result_text = result_text[3:]
        if result_text.endswith("```"):
            result_text = result_text[:-3]

        result = json.loads(result_text.strip())

        elapsed = time.time() - start_time
        print(f"✅ Analysis completed in {elapsed:.2f}s (score: {result['ats_score']['overall_score']}/100)")

        return result

    except Exception as e:
        print(f"❌ Groq analysis failed: {e}")
        raise
```

**Step 2: Test locally by dry-running the prompt**

No automated test here — manually verify the JSON structure is valid by running:
```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
python3 -c "
import json
# Simulate what the LLM should return
sample = {
    'ats_score': {
        'overall_score': 74,
        'formatting_score': 82,
        'formatting_explanation': 'Test explanation',
        'keywords_score': 65,
        'keywords_explanation': 'Test explanation',
        'structure_score': 78,
        'structure_explanation': 'Test explanation',
        'readability_score': 71,
        'readability_explanation': 'Test explanation'
    },
    'strengths': ['Fact 1', 'Fact 2'],
    'improvements': ['Action 1', 'Action 2'],
    'missing_sections': ['Résumé professionnel'],
    'keywords_found': ['Python', 'SQL'],
    'keywords_missing': ['Kubernetes'],
    'job_match_score': None,
    'job_match_explanation': None
}
print(json.dumps(sample, indent=2))
print('JSON structure valid')
"
```

Expected: prints valid JSON with all expected fields.

**Step 3: Commit the Modal app change**

```bash
git add scripts/deployment/modal_app.py
git commit -m "feat(modal): upgrade analyze_cv_with_groq prompt for real LLM reflection with per-score explanations"
```

---

## Task 2: Extend TypeScript types with optional explanation fields

**Files:**
- Modify: `frontend-next/src/hooks/use-cv-analysis.ts` — `CVAnalysisResult` interface (lines 34-51)

**Context:**
The `CVAnalysisResult` interface in `use-cv-analysis.ts` defines the shape of the API response. We add optional `_explanation` fields. Optional = no breaking change for existing analyses stored in DB without these fields.

**Step 1: Update the `CVAnalysisResult` interface**

Find the `interface CVAnalysisResult` block (lines 34-51) and replace with:

```typescript
interface CVAnalysisResult {
  ats_score: {
    overall_score: number;
    formatting_score: number;
    formatting_explanation?: string;
    keywords_score: number;
    keywords_explanation?: string;
    structure_score: number;
    structure_explanation?: string;
    readability_score: number;
    readability_explanation?: string;
  };
  strengths: string[];
  improvements: string[];
  missing_sections: string[];
  keywords_found: string[];
  keywords_missing: string[];
  job_match_score?: number;
  job_match_explanation?: string;
  analysis_language: "fr" | "en";
  processed_at: string;
  processing_time_seconds?: number;
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch/frontend-next
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this change).

**Step 3: Commit**

```bash
git add frontend-next/src/hooks/use-cv-analysis.ts
git commit -m "feat(types): add optional _explanation fields to CVAnalysisResult for per-score tooltips"
```

---

## Task 3: Propagate explanations to the breakdown display

**Files:**
- Modify: `frontend-next/src/components/cv/cv-upload-async-wizard.tsx` — `renderStep3()` function, breakdown array (lines ~1282-1303)

**Context:**
`ScoreBreakdownV2` accepts `explanation?: string` on each `BreakdownItem`. When set, it shows as a tooltip on the info icon next to the score label. Currently the breakdown is hardcoded with no explanations. We pass the `_explanation` fields from the API result.

**Step 1: Find the breakdown array in `renderStep3()`**

Locate this block (around line 1282):
```tsx
<ResultsAccordion
  breakdown={[
    {
      label: "Format",
      value: displayResult.ats_score.formatting_score,
      max: 100,
    },
    {
      label: "Mots-clés",
      value: displayResult.ats_score.keywords_score,
      max: 100,
    },
    {
      label: "Structure",
      value: displayResult.ats_score.structure_score,
      max: 100,
    },
    {
      label: "Lisibilité",
      value: displayResult.ats_score.readability_score,
      max: 100,
    },
  ]}
```

**Step 2: Replace with explanation-aware breakdown**

```tsx
<ResultsAccordion
  breakdown={[
    {
      label: "Format",
      value: displayResult.ats_score.formatting_score,
      max: 100,
      explanation: displayResult.ats_score.formatting_explanation,
    },
    {
      label: "Mots-clés",
      value: displayResult.ats_score.keywords_score,
      max: 100,
      explanation: displayResult.ats_score.keywords_explanation,
    },
    {
      label: "Structure",
      value: displayResult.ats_score.structure_score,
      max: 100,
      explanation: displayResult.ats_score.structure_explanation,
    },
    {
      label: "Lisibilité",
      value: displayResult.ats_score.readability_score,
      max: 100,
      explanation: displayResult.ats_score.readability_explanation,
    },
  ]}
```

Note: `ScoreBreakdownV2` already handles `explanation={undefined}` gracefully — it falls back to `DEFAULT_EXPLANATIONS[label]` if explanation is falsy. No additional guard needed.

**Step 3: Add job_match_explanation display (when present)**

Locate the Score Ring section (around line 1273-1278):
```tsx
<div className="flex justify-center mb-8">
  <ScoreRing
    score={displayResult.ats_score.overall_score}
    size={200}
  />
</div>
```

Add a job match card AFTER the ScoreRing div, only when `job_match_score` is present:

```tsx
{displayResult.job_match_score != null && (
  <div className="mx-auto max-w-lg mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
        <span className="text-sm font-black text-blue-700">{displayResult.job_match_score}%</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-blue-900">Matching avec l'offre</p>
        {displayResult.job_match_explanation && (
          <p className="text-xs text-blue-700 mt-1 leading-relaxed">
            {displayResult.job_match_explanation}
          </p>
        )}
      </div>
    </div>
  </div>
)}
```

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch/frontend-next
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

**Step 5: Commit**

```bash
git add frontend-next/src/components/cv/cv-upload-async-wizard.tsx
git commit -m "feat(cv-analysis): display per-score LLM explanations in breakdown tooltips and job match card"
```

---

## Task 4: Deploy Modal app

**Context:**
The Modal app is deployed separately from the Railway backend. Any change to `scripts/deployment/modal_app.py` requires a `modal deploy` to take effect.

**Step 1: Deploy**

```bash
cd /Users/wissem/HuntzenIA/huntzen_jobsearch
modal deploy scripts/deployment/modal_app.py
```

Expected output:
```
✓ Created objects.
├── 🔨 Created function process_cv_webhook.
└── 🔨 Created function process_cv_analysis.
✓ App deployed! 🎉
View at https://modal.com/apps/huntzenproject/huntzen-cv-processor
```

**Step 2: Verify deployment**

```bash
modal run scripts/deployment/modal_app.py
```

Expected: health check passes.

---

## Task 5: End-to-end smoke test

**Step 1: Test with a real CV text (no job description)**

In the app at `/cv-analysis`:
1. Choose "Texte collé"
2. Paste a CV text (minimum 100 chars)
3. Choose "Analyse globale"
4. Click "Analyser"
5. Wait for results

Expected results:
- Score ring shows `overall_score` (a real number, not 0)
- Breakdown shows 4 bars with `X/100`
- Hovering the info icon (ⓘ) next to each label shows the `_explanation` text from the LLM (specific to the CV, not generic)
- "Points forts" section contains facts citing real CV content
- "Points à améliorer" section contains actionable items naming specific sections

**Step 2: Test with job description (matching mode)**

1. Choose "Fichier PDF" or "Texte collé"
2. Choose "Matching avec une offre"
3. Paste a job description
4. Analyze

Expected:
- Job match card appears below score ring with percentage and explanation
- `job_match_score` is a non-null integer

**Step 3: Verify old analyses still display (regression check)**

1. Click "Historique" (if available)
2. Load an older analysis
3. Verify it displays without crashing

Expected: displays normally, explanations are missing (undefined → falls back to `DEFAULT_EXPLANATIONS`), no JS errors.

---

## Summary of changes

| File | Change | Risk |
|------|--------|------|
| `scripts/deployment/modal_app.py` | Upgrade prompt → richer JSON output | Low — additive fields only |
| `frontend-next/src/hooks/use-cv-analysis.ts` | Add optional fields to interface | Zero — optional fields |
| `frontend-next/src/components/cv/cv-upload-async-wizard.tsx` | Pass explanations + job match card | Low — conditional rendering |

**No DB schema changes. No API route changes. No existing field renames.**
