# 🔍 AUDIT COMPLET - Système i18n HuntZen
**Date:** 2026-02-13
**Objectif:** Implémenter détection IP automatique + internationalisation complète (FR, EN, ES, PT)
**Criticité:** Haute - Ne rien casser ⚠️

---

## 📊 État Actuel du Système

### 1. Frontend (Next.js)

#### 1.1 Middleware Actuel (`frontend-next/src/middleware.ts`)
**Responsabilités actuelles:**
- ✅ Authentification Supabase (createServerClient)
- ✅ Génération client_id (freemium tracking)
- ✅ Protection routes premium (/dashboard, /profile, /saved-jobs)
- ✅ Redirection login/signup pour utilisateurs authentifiés

**⚠️ RISQUE:** Middleware critique pour l'auth - toute modification peut casser l'authentification

**✅ COMPATIBLE:** Peut coexister avec détection langue (ajouter logique AVANT/APRÈS Supabase)

#### 1.2 Structure Routing Actuelle
```
frontend-next/src/app/
├── (dashboard)/          # Routes protégées
│   ├── assistant/
│   ├── jobs/
│   ├── cv-analysis/
│   └── profile/
├── (marketing)/          # Routes publiques
│   ├── about/
│   ├── faq/
│   └── temoignages/
├── login/
├── signup/
└── layout.tsx            # Root layout
```

**⚠️ RISQUE:** Routing statique actuel - migration vers `/[locale]/` nécessite:
- Déplacement de TOUS les dossiers sous `[locale]/`
- Mise à jour de TOUS les liens internes
- Migration du Root Layout

**Estimation:** 4-6 heures de travail minutieux

#### 1.3 Usage de `language` dans Frontend
**Fichiers identifiés:**
1. `huntzen-client.ts` - Line 288, 295, 304, 324
   - `analyzeCV(cvText, jobDesc, language = 'fr')`
   - `analyzeCVFile(file, jobDesc, language = 'fr')`
   - Paramètre passé au backend

2. `use-cv-analysis.ts` - Line 47, 73, 74, 295, 324, 394, 421
   - Type: `'fr' | 'en'`
   - Hardcodé default `'fr'`

3. `profile/page.tsx` - Line 1
   - `preferred_language: 'fr'` (settings)

**⚠️ RISQUE:** Hardcoded `'fr'` partout - nécessite refactoring pour utiliser contexte i18n

---

### 2. Backend (FastAPI)

#### 2.1 Schéma API Actuel (`backend/src/models/schemas.py`)

```python
class CoachRequest(BaseModel):
    message: str
    session_id: str
    language: Literal["fr", "en", "es", "de"] = Field(default="en")  # ⚠️ Default EN!
```

**✅ BON:** Déjà 4 langues supportées (fr, en, es, de)
**❌ MANQUE:** Portugais (pt) absent
**⚠️ INCOHÉRENCE:** Default "en" mais frontend hardcode "fr"

**ACTION REQUISE:** Ajouter "pt" et aligner default avec frontend

#### 2.2 Agent Coach (`backend/src/agents/coach/main_agent.py`)

**Line 268-274 - Logique actuelle:**
```python
async def run(self, message: str, history, language: str = "fr", ...):
    # Line 273: BUG IDENTIFIÉ DANS PR #12
    lang_instruction = "" if language == "fr" else f"[Respond in {language.upper()}] "
    full_message = f"{lang_instruction}{message}"
```

**✅ CORRIGÉ DANS PR #12:** Language enforcement pour toutes les langues (y compris FR)

**⚠️ RISQUE:** Prompts actuellement en français uniquement

#### 2.3 Structure Prompts Actuelle
```
backend/prompts/
├── coach_main.txt               # ⚠️ Français seulement
├── coach_career_planner.txt     # ⚠️ Français seulement
├── coach_skill_analyzer.txt     # ⚠️ Français seulement
├── coach_salary_advisor.txt     # ⚠️ Français seulement
├── cv_analyzer_context.txt      # ⚠️ Français seulement
├── cv_adapter_main.txt          # ⚠️ Français seulement
└── ...
```

**❌ PROBLÈME:** Aucune structure multilingue
**REQUIS:** Migration vers structure par langue:
```
backend/prompts/
├── coach/
│   ├── fr/
│   │   ├── main.txt
│   │   ├── career_planner.txt
│   │   └── ...
│   ├── en/
│   ├── es/
│   └── pt/
└── cv_analyzer/
    ├── fr/
    ├── en/
    └── ...
```

**Estimation:** 8-12 heures de traduction + validation

#### 2.4 APIs Concernées
**Fichiers utilisant `language`:**
- `routes/coach.py` - Line 57 (CoachRequest.language)
- `routes/cv.py`
- `routes/cv_adapter.py`
- `routes/cv_analysis.py`
- `routes/assistant.py`

**✅ BON:** Toutes les routes passent déjà `language` aux agents

---

## 🚨 Points de Risque Critiques

### RISQUE 1: Middleware Auth + Routing [CRITICITÉ: HAUTE]
**Problème:** Middleware gère auth Supabase - modification peut casser auth
**Impact:** Utilisateurs ne peuvent plus se connecter
**Mitigation:**
- Tester auth APRÈS chaque modification middleware
- Garder logique Supabase INCHANGÉE
- Ajouter langue APRÈS récupération session Supabase

### RISQUE 2: Migration Routing vers /[locale]/ [CRITICITÉ: HAUTE]
**Problème:** Tous les liens internes cassés
**Impact:** 404 errors partout
**Mitigation:**
- Créer script de migration automatique
- Tester TOUTES les pages une par une
- Mettre en place redirects 301 temporaires

### RISQUE 3: Hardcoded Language 'fr' [CRITICITÉ: MOYENNE]
**Problème:** `language = 'fr'` hardcodé dans 10+ endroits
**Impact:** Langue ignorée même avec détection IP
**Mitigation:**
- Créer contexte i18n global
- Remplacer tous les hardcoded par `useLocale()`

### RISQUE 4: Prompts Français Uniquement [CRITICITÉ: MOYENNE]
**Problème:** Prompts non traduits
**Impact:** Réponses incohérentes (prompt FR + instruction EN)
**Mitigation:**
- Traduire progressivement (coach first, puis CV)
- Fallback vers FR si traduction manquante

### RISQUE 5: Default Language Mismatch [CRITICITÉ: FAIBLE]
**Problème:** Backend default "en", Frontend hardcode "fr"
**Impact:** Confusion si param non passé
**Mitigation:**
- Aligner default à "fr" partout
- Forcer passage explicite du paramètre

---

## ✅ Plan d'Implémentation Sans Régression

### PHASE 1: Backend Multilingue (SAFEST - 0 risque frontend)
**Durée:** 2-3 jours
**Risque:** ⚠️ FAIBLE

**Étapes:**
1. ✅ Ajouter "pt" à `CoachRequest.language` (Literal)
2. ✅ Créer structure `prompts/{agent}/{lang}/`
3. ✅ Traduire prompts coach (FR → EN, ES, PT)
4. ✅ Modifier `load_prompt()` pour charger par langue
5. ✅ Fallback vers FR si traduction manquante
6. ✅ Tests unitaires multilingues

**Validation:**
- [ ] Test API `/api/coach/chat` avec `language=en`
- [ ] Test API `/api/coach/chat` avec `language=es`
- [ ] Test API `/api/coach/chat` avec `language=pt`
- [ ] Réponses cohérentes avec prompts traduits
- [ ] Pas de régression sur `language=fr`

**COMMIT SAFETY:** ✅ Rétrocompatible à 100% (default 'fr' inchangé)

---

### PHASE 2: Détection IP Middleware (RISQUE MODÉRÉ)
**Durée:** 1-2 jours
**Risque:** ⚠️ MOYEN (touche middleware auth)

**Étapes:**
1. ✅ Installer `@vercel/edge` ou `@vercel/functions`
2. ✅ Ajouter détection IP APRÈS `supabase.auth.getUser()`
3. ✅ Mapping pays → langue (COUNTRY_TO_LANG)
4. ✅ Cookie `NEXT_LOCALE` avec priorité:
   - 1. Cookie existant (préférence user)
   - 2. IP geolocation
   - 3. Accept-Language header
   - 4. Fallback 'fr'
5. ✅ **NE PAS toucher routing** (juste cookie pour l'instant)

**Validation:**
- [ ] Auth Supabase fonctionne (login/logout)
- [ ] Cookie `NEXT_LOCALE` créé
- [ ] Détection IP correcte (tester avec VPN)
- [ ] Fallback vers FR si IP inconnue
- [ ] Pas de régression routes protégées

**COMMIT SAFETY:** ⚠️ TESTER AUTH AVANT MERGE

---

### PHASE 3: Contexte i18n Frontend (RISQUE FAIBLE)
**Durée:** 1 jour
**Risque:** ✅ FAIBLE (ajout feature, pas modification)

**Étapes:**
1. ✅ Créer `contexts/i18n-context.tsx`
2. ✅ Hook `useLocale()` → lit cookie `NEXT_LOCALE`
3. ✅ Provider global dans Root Layout
4. ✅ Remplacer hardcoded `'fr'` par `useLocale()`
5. ✅ Composant `<LanguageSwitcher />` (flags)

**Validation:**
- [ ] `useLocale()` retourne langue du cookie
- [ ] Changement langue met à jour cookie
- [ ] API calls passent bonne langue
- [ ] Pas de régression fonctionnelle

**COMMIT SAFETY:** ✅ Backward-compatible (default 'fr')

---

### PHASE 4: Routing i18n /[locale]/ (RISQUE ÉLEVÉ)
**Durée:** 3-4 jours
**Risque:** 🔴 ÉLEVÉ (migration complète)

**⚠️ RECOMMANDATION:** Faire en DERNIER, après validation Phase 1-3

**Étapes:**
1. ⚠️ Créer `app/[locale]/` structure
2. ⚠️ Déplacer TOUS les dossiers sous `[locale]/`
3. ⚠️ Mise à jour Root Layout
4. ⚠️ Middleware redirect vers `/fr/`, `/en/`, etc.
5. ⚠️ Mise à jour TOUS les `<Link href>` (next-intl)
6. ⚠️ Redirects 301 pour anciens liens

**Validation:**
- [ ] TOUTES les pages accessibles
- [ ] Aucun 404 error
- [ ] Auth fonctionne sur `/[locale]/login`
- [ ] Redirects automatiques OK
- [ ] SEO préservé (canonical URLs)

**COMMIT SAFETY:** 🔴 BREAKING CHANGE - Nécessite deploy coordonné

---

### PHASE 5: Traductions UI (RISQUE FAIBLE)
**Durée:** 2-3 jours
**Risque:** ✅ FAIBLE (textes seulement)

**Étapes:**
1. ✅ Créer `i18n/locales/{fr,en,es,pt}.json`
2. ✅ Traduire composants UI
3. ✅ Hook `useTranslations()` (next-intl)
4. ✅ Validation native speakers

**Validation:**
- [ ] Tous les textes traduits
- [ ] Pas de clés manquantes
- [ ] Pluralization correcte
- [ ] Dates/nombres formatés

---

## 📋 Checklist Pré-Implémentation

### Backend
- [ ] Vérifier que PR #12 est mergé (language enforcement)
- [ ] Backup base de données (si migrations nécessaires)
- [ ] Tests existants passent à 100%
- [ ] Documentation API à jour

### Frontend
- [ ] Backup fichiers critiques (middleware.ts, layout.tsx)
- [ ] Tests E2E passent
- [ ] Aucun error dans console dev
- [ ] Build production réussit

### Infrastructure
- [ ] Variables d'environnement prêtes (VERCEL_URL, etc.)
- [ ] Vercel Edge Config configuré (si utilisé)
- [ ] Monitoring erreurs activé (Sentry, etc.)
- [ ] Plan de rollback documenté

---

## 🎯 Recommandation Finale

### Option A: Implémentation Incrémentale (RECOMMANDÉ ✅)
**Ordre:** Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 4 (routing en dernier)
**Avantages:**
- Chaque phase testable indépendamment
- 0 régression si on s'arrête entre phases
- Rollback facile si problème

**Durée totale:** 9-13 jours

### Option B: Big Bang (⚠️ RISQUÉ)
**Ordre:** Tout en même temps
**Avantages:** Plus rapide (7-8 jours)
**Inconvénients:** Impossible de rollback partiellement, risque de tout casser

---

## 📝 Conclusion de l'Audit

### ✅ Points Positifs
1. Backend déjà préparé pour multilangue (Literal["fr", "en", "es", "de"])
2. PR #12 corrige bug language enforcement
3. API routes passent déjà `language` aux agents
4. Structure modulaire (facile d'ajouter traductions)

### ⚠️ Points d'Attention
1. Middleware critique (auth Supabase) - tester minutieusement
2. Routing migration = breaking change - faire en dernier
3. Prompts non traduits - gros travail de traduction
4. Hardcoded `'fr'` partout - refactoring requis

### 🚫 Blockers Identifiés
1. ❌ PR #12 doit être mergé AVANT Phase 1 (language enforcement)
2. ❌ Traductions prompts requises AVANT production multilingue
3. ❌ Tests E2E multilingues absents - à créer

---

**Prêt pour implémentation:** ⚠️ OUI, avec précautions
**Risque global:** MOYEN (élevé si routing migré trop tôt)
**Recommandation:** Commencer Phase 1 (backend) immédiatement, tester intensivement avant Phase 4

**Auteur:** Claude Code
**Validation requise:** @wissem
