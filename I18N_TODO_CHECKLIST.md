# 🚀 TODO LIST i18n - Plan d'Implémentation
**Date:** 2026-02-13
**Durée estimée RÉALISTE:** 6-8 heures de travail Claude (pas jours!)

---

## 🎯 OBJECTIF GLOBAL
Implémenter détection IP automatique + traduction backend (FR, EN, ES, PT) sans casser l'existant.

---

## ✅ PHASE 1: Infrastructure Détection Langue (2-3h)

### TÂCHE 1.1: Middleware Détection IP
**Durée:** 1h
**Fichier:** `frontend-next/src/middleware.ts`

**Actions:**
- [ ] Lire middleware actuel complet (comprendre logique auth)
- [ ] Installer `@vercel/functions` ou utiliser `request.geo` (Vercel Edge)
- [ ] Créer mapping `COUNTRY_TO_LANG` (20+ pays)
- [ ] Ajouter détection IP APRÈS `supabase.auth.getUser()` (ligne 42)
- [ ] Ordre de priorité:
  1. Cookie `NEXT_LOCALE` existant (user override)
  2. IP Geolocation → Pays → Langue
  3. `Accept-Language` header
  4. Fallback `'fr'`
- [ ] Créer cookie `NEXT_LOCALE` (maxAge: 1 an)

**⚠️ CHECKPOINT VALIDATION 1.1:**
```bash
# AVANT de commit, OBLIGATOIREMENT vérifier:
✓ Login fonctionne (tester /login)
✓ Logout fonctionne
✓ Routes protégées marchent (/dashboard)
✓ Redirection login→jobs pour users auth OK
✓ Cookie NEXT_LOCALE créé (inspecter DevTools)
✓ Pas d'erreur console
✓ Build Next.js réussit (npm run build)
```

**🚫 INTERDICTIONS:**
- ❌ NE PAS modifier logique Supabase (lignes 14-41)
- ❌ NE PAS toucher aux routes protégées (lignes 54-66)
- ❌ NE PAS ajouter routing `/[locale]/` (Phase 4 seulement)

---

### TÂCHE 1.2: Contexte i18n Frontend
**Durée:** 30min
**Fichiers:** `frontend-next/src/contexts/i18n-context.tsx` (NOUVEAU)

**Actions:**
- [ ] Créer contexte `I18nContext`
- [ ] Hook `useLocale()` → lit cookie `NEXT_LOCALE`
- [ ] Hook `setLocale(lang)` → met à jour cookie + recharge page
- [ ] Provider dans Root Layout `app/layout.tsx`
- [ ] Export type `Locale = 'fr' | 'en' | 'es' | 'pt'`

**⚠️ CHECKPOINT VALIDATION 1.2:**
```bash
✓ useLocale() retourne 'fr' par défaut
✓ setLocale('en') met à jour cookie
✓ Reload page garde la langue
✓ Pas d'erreur console
✓ TypeScript compile sans erreur
```

**🚫 INTERDICTIONS:**
- ❌ NE PAS modifier Root Layout (juste wrap avec Provider)
- ❌ NE PAS toucher aux autres contexts (auth, subscription)

---

### TÂCHE 1.3: Remplacer hardcoded 'fr'
**Durée:** 1h
**Fichiers à modifier:**
1. `frontend-next/src/lib/api/huntzen-client.ts` (lignes 288, 295, 304, 324)
2. `frontend-next/src/hooks/use-cv-analysis.ts` (lignes 295, 394)

**Actions:**
- [ ] Importer `useLocale()` dans chaque fichier
- [ ] Remplacer `language = 'fr'` par `language = useLocale()`
- [ ] Vérifier que paramètre est passé aux API calls

**⚠️ CHECKPOINT VALIDATION 1.3:**
```bash
✓ API /api/coach/chat reçoit bonne langue (Network tab)
✓ API /api/cv-analysis/async reçoit bonne langue
✓ Changer langue via setLocale() update API calls
✓ Fallback 'fr' si cookie absent
✓ Pas d'erreur TypeScript
```

**🚫 INTERDICTIONS:**
- ❌ NE PAS modifier logique métier (juste remplacer hardcoded)
- ❌ NE PAS casser les appels API existants

---

### TÂCHE 1.4: Composant Sélecteur Langue
**Durée:** 30min
**Fichier:** `frontend-next/src/components/language-switcher.tsx` (NOUVEAU)

**Actions:**
- [ ] Créer composant avec flags (🇫🇷 🇬🇧 🇪🇸 🇧🇷)
- [ ] Utiliser `useLocale()` et `setLocale()`
- [ ] Ajouter dans header/navbar

**⚠️ CHECKPOINT VALIDATION 1.4:**
```bash
✓ Cliquer flag change langue instantanément
✓ UI met à jour cookie + recharge
✓ Langue active visuellement marquée
✓ Accessible (keyboard navigation)
```

---

## ✅ PHASE 2: Backend Multilingue (3-4h)

### TÂCHE 2.1: Ajouter "pt" au schéma
**Durée:** 10min
**Fichier:** `backend/src/models/schemas.py`

**Actions:**
- [ ] Ligne 32: Changer `Literal["fr", "en", "es", "de"]` → `Literal["fr", "en", "es", "pt"]`
- [ ] Changer default de `"en"` → `"fr"` (aligner avec frontend)

**⚠️ CHECKPOINT VALIDATION 2.1:**
```bash
✓ Backend démarre sans erreur
✓ API accepte language=pt (tester via curl)
✓ Tests existants passent
```

---

### TÂCHE 2.2: Restructurer dossier prompts
**Durée:** 30min
**Fichiers:** Créer nouvelle structure

**Actions:**
- [ ] Créer dossier `backend/prompts/coach/fr/`
- [ ] Déplacer `coach_main.txt` → `backend/prompts/coach/fr/main.txt`
- [ ] Déplacer autres prompts coach vers `fr/`
- [ ] Créer dossiers vides `en/`, `es/`, `pt/`

**⚠️ CHECKPOINT VALIDATION 2.2:**
```bash
✓ Backend trouve toujours les prompts FR
✓ Coach fonctionne normalement
✓ Pas d'erreur "file not found"
```

---

### TÂCHE 2.3: Modifier load_prompt() dynamique
**Durée:** 30min
**Fichier:** `backend/src/agents/coach/main_agent.py`

**Actions:**
- [ ] Créer fonction `load_prompt_by_language(prompt_name: str, language: str)`
- [ ] Logique:
  ```python
  prompt_path = f"prompts/coach/{language}/{prompt_name}.txt"
  if not exists(prompt_path):
      logger.warning(f"Prompt {language} not found, fallback to FR")
      prompt_path = f"prompts/coach/fr/{prompt_name}.txt"
  return read(prompt_path)
  ```
- [ ] Appeler dans `__init__()` pour charger system_prompt

**⚠️ CHECKPOINT VALIDATION 2.3:**
```bash
✓ language=fr charge prompts/coach/fr/main.txt
✓ language=en fallback vers FR (pas encore traduit)
✓ Pas d'exception levée
✓ Tests API passent
```

---

### TÂCHE 2.4: Traduire coach_main.txt
**Durée:** 2h (traduction manuelle + validation)
**Fichiers à créer:**
- `backend/prompts/coach/en/main.txt`
- `backend/prompts/coach/es/main.txt`
- `backend/prompts/coach/pt/main.txt`

**Actions:**
- [ ] Traduire SECTION 0 (Guardrails) - CRITIQUE
- [ ] Traduire SECTION 1 (Identity)
- [ ] Traduire SECTION 2 (Language rules) - adapter au contexte
- [ ] Traduire SECTION 7 (Scope)
- [ ] Traduire rejection message template
- [ ] Valider avec native speaker si possible

**⚠️ CHECKPOINT VALIDATION 2.4:**
```bash
# Tester CHAQUE langue via API:
curl -X POST /api/coach/chat -d '{"message":"Hello","session_id":"test","language":"en"}'
✓ Réponse en anglais cohérente
✓ Guardrails fonctionnent (tester "code me an app")
✓ Pas de mélange FR/EN dans réponse

curl ... -d '{"language":"es"}'
✓ Réponse en espagnol

curl ... -d '{"language":"pt"}'
✓ Réponse en portugais
```

---

## ✅ PHASE 3: Tests End-to-End (1h)

### TÂCHE 3.1: Tests Manuels Complets
**Durée:** 1h

**Scénarios à tester:**
- [ ] **User français (IP FR):**
  - Cookie `NEXT_LOCALE=fr` créé automatiquement
  - Assistant répond en français
  - UI en français

- [ ] **User américain (IP US simulé avec VPN):**
  - Cookie `NEXT_LOCALE=en` créé automatiquement
  - Assistant répond en anglais
  - Guardrails EN ("Sorry, that's not my expertise...")

- [ ] **User brésilien (IP BR):**
  - Cookie `NEXT_LOCALE=pt`
  - Assistant répond en portugais

- [ ] **User espagnol (IP ES):**
  - Cookie `NEXT_LOCALE=es`
  - Assistant répond en espagnol

- [ ] **Override manuel:**
  - User FR clique flag 🇬🇧
  - Cookie passe à `en`
  - Assistant passe en anglais
  - Reload garde la langue

- [ ] **Fallback Accept-Language:**
  - Effacer cookie
  - Header `Accept-Language: pt-BR`
  - Détection correcte

**⚠️ CHECKPOINT VALIDATION 3.1:**
```bash
✓ TOUS les scénarios passent
✓ Pas de régression auth (login/logout OK)
✓ Pas de régression routes protégées
✓ Pas d'erreur console
✓ Performance OK (pas de lag)
```

---

## 🔒 CHECKLIST DE SÉCURITÉ (AVANT CHAQUE COMMIT)

### ✅ VALIDATION OBLIGATOIRE

Avant CHAQUE `git commit`, je DOIS vérifier:

#### 1. Auth Supabase
```bash
✓ Login fonctionne (/login → entrer credentials → redirect /jobs)
✓ Logout fonctionne (bouton déconnexion → redirect /login)
✓ Routes protégées bloquent anonymous (/dashboard sans auth → redirect /login)
✓ Session persiste après reload
```

#### 2. API Backend
```bash
✓ Backend démarre sans erreur (cd backend && uvicorn src.main:app)
✓ Endpoints coach répondent (curl /api/coach/chat)
✓ Language parameter fonctionne (tester fr, en, es, pt)
✓ Pas d'erreur 500
```

#### 3. Frontend Build
```bash
✓ npm run build (production) réussit sans erreur
✓ npm run dev (dev) démarre sans warning critique
✓ Pas d'erreur TypeScript (tsc --noEmit)
✓ Pas d'erreur ESLint
```

#### 4. Fonctionnel
```bash
✓ Assistant chat fonctionne (envoyer message → réponse)
✓ Recherche jobs fonctionne
✓ CV analysis fonctionne
✓ Saved jobs fonctionne
✓ Profile fonctionne
```

#### 5. Console Propre
```bash
✓ Pas d'erreur rouge dans console browser (F12)
✓ Pas de warning critique
✓ Network requests OK (pas de 404/500)
```

---

## 🚫 INTERDICTIONS ABSOLUES

### JAMAIS faire:
- ❌ Commit sans tester auth Supabase
- ❌ Commit sans build production réussi
- ❌ Modifier middleware sans comprendre logique auth
- ❌ Supprimer code existant sans vérifier s'il est utilisé
- ❌ Push sur `main` directement (toujours feature branch)
- ❌ Merge PR sans validation manuelle complète
- ❌ Ignorer erreurs TypeScript ("// @ts-ignore")
- ❌ Hardcoder secrets/tokens dans le code

---

## 📝 COMMIT MESSAGES FORMAT

**Format obligatoire:**
```
<type>(scope): <description>

[body optionnel]

Validation:
- ✅ Auth tested
- ✅ Build successful
- ✅ Manual testing done
```

**Types:**
- `feat` - Nouvelle fonctionnalité
- `fix` - Correction bug
- `refactor` - Refactoring sans changement fonctionnel
- `test` - Ajout tests
- `chore` - Maintenance

**Exemples:**
```
feat(i18n): Add IP-based language detection middleware

- Detects user country from Vercel Edge geolocation
- Creates NEXT_LOCALE cookie with priority: cookie > IP > header > fallback
- Preserves existing Supabase auth logic

Validation:
- ✅ Auth tested (login/logout OK)
- ✅ Build successful
- ✅ Manual testing: FR/US/BR IP detection works
```

---

## ⏱️ TIMELINE RÉALISTE (Claude Code)

| Phase | Durée | Checkpoint |
|-------|-------|------------|
| Phase 1.1 (Middleware) | 1h | Auth OK |
| Phase 1.2 (Context) | 30min | TypeScript OK |
| Phase 1.3 (Hardcoded) | 1h | API calls OK |
| Phase 1.4 (Switcher) | 30min | UI OK |
| **CHECKPOINT PHASE 1** | +30min | **TOUT tester** |
| Phase 2.1 (Schema) | 10min | Backend OK |
| Phase 2.2 (Structure) | 30min | Prompts found |
| Phase 2.3 (Load) | 30min | Fallback OK |
| Phase 2.4 (Traduction) | 2h | Responses OK |
| **CHECKPOINT PHASE 2** | +30min | **API tests** |
| Phase 3 (E2E Tests) | 1h | All scenarios |
| **TOTAL** | **6-8h** | **Production ready** |

---

## 🎯 RÉSUMÉ POUR CLAUDE CODE (MOI)

**À CHAQUE modification, je DOIS:**

1. **LIRE** le fichier complet AVANT de modifier
2. **COMPRENDRE** la logique existante
3. **MODIFIER** uniquement ce qui est nécessaire
4. **TESTER** immédiatement après modification
5. **VALIDER** avec checklist de sécurité
6. **COMMIT** avec message structuré
7. **DOCUMENTER** si logique complexe

**Si quelque chose casse:**
- 🚨 STOP immédiatement
- 🔍 Identifier la cause (git diff)
- ↩️ Rollback si besoin (git reset)
- 🐛 Debugger avant de continuer

**Principe d'or:**
> "Mieux vaut prendre 10min de plus pour vérifier que casser 2h à debugger"

---

**Prêt à démarrer Phase 1?**
**J'attends votre GO pour commencer.**
