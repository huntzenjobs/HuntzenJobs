# 🔧 Plan de Correction des 10 Bugs Critiques
**Issue**: #13
**Branche**: `fix/10-critical-bugs-issue-13`
**Créé le**: 2026-02-13

---

## 📋 Résumé Exécutif

10 bugs identifiés lors des tests utilisateur, classés par priorité (P0-P3).
**Objectif**: Corriger sans casser le code existant, sans duplication.

---

## 🔴 PRIORITÉ 0 - CRITIQUES (Fix Immédiat)

### Bug #1: Vérification Plan Premium Cassée
**Symptôme**: User Premium voit "Passez à Premium" pour historique + favoris
**Impact**: 🔴 Critique - Bloque fonctionnalités payées
**Cause Racine**: `hasFeature()` utilise limites hardcodées au lieu de l'API

**Analyse Technique**:
```typescript
// subscription-context.tsx:332
hasFeature: freemium.hasFeature, // ❌ Utilise PLAN_LIMITS hardcodés

// Devrait utiliser les données API:
hasFeature: (feature) => {
  if (!apiData.quotas) return freemium.hasFeature(feature)
  // Logique avec données API
}
```

**Fichiers Impactés**:
- `frontend-next/src/contexts/subscription-context.tsx` (ligne 332)
- `frontend-next/src/hooks/use-freemium-limits.ts` (lignes 16-76)

**Solution**:
1. ✅ Ajouter `hasFeature()` dans `subscription-context.tsx` qui utilise les données API
2. ✅ Vérifier que `/api/auth/me` retourne bien les features du plan Premium
3. ✅ Fallback sur limites locales si API indisponible
4. ✅ Test: User Premium doit accéder historique/favoris

**Estimation**: 30 min

---

### Bug #2: Soft Skills Non Détectés dans Analyse CV
**Symptôme**: Section Soft Skills non détectée malgré présence dans CV
**Impact**: 🔴 Critique - Fonctionnalité core cassée
**Cause Racine**: Parsing CV ou prompt système ne détecte pas section

**Analyse Technique**:
```python
# backend/src/agents/cv_analyzer/main_agent.py
# Sub-agent: SkillExtractor (ligne 72-78)
# Prompt: cv_skill_extractor.txt
```

**Fichiers Impactés**:
- `backend/src/agents/cv_analyzer/main_agent.py`
- `backend/prompts/cv_skill_extractor.txt` (à vérifier)
- `backend/prompts/cv_analyzer_context.txt` (à vérifier)

**Solution**:
1. ✅ Lire le prompt `cv_skill_extractor.txt` actuel
2. ✅ Identifier si "Soft Skills" est explicitement cherché
3. ✅ Améliorer prompt pour détecter variations:
   - "Soft Skills"
   - "Compétences comportementales"
   - "Qualités personnelles"
   - "Savoir-être"
4. ✅ Tester avec CV réel contenant Soft Skills
5. ✅ Vérifier que le JSON retourné inclut la section

**Estimation**: 45 min

---

## 🟠 PRIORITÉ 1 - IMPORTANTS (Fix Aujourd'hui)

### Bug #3: Affichage Cassé Assistant Coach (Scroll Bloc)
**Symptôme**: Bloc avec scroll au lieu d'affichage fluide
**Impact**: 🟠 Important - UX dégradée
**Cause Racine**: CSS overflow/height sur conteneur messages

**Fichiers Impactés**:
- `frontend-next/src/app/(dashboard)/assistant/page.tsx` (ligne 389)
- CSS du `CardContent` ligne 389

**Solution**:
1. ✅ Identifier conteneur avec `overflow` problématique
2. ✅ Ajuster `flex-1 overflow-y-auto` pour expansion correcte
3. ✅ Vérifier que messages scrollent naturellement
4. ✅ Test: Chat fluide sans bloc scroll interne

**Estimation**: 20 min

---

### Bug #4: Recherches Populaires Non Cliquables
**Symptôme**: Clic sur recherche populaire ne déclenche pas recherche
**Impact**: 🟠 Important - Feature inaccessible
**Cause Racine**: Prop `onSearchClick` non passée au composant

**Analyse Technique**:
```tsx
// jobs-placeholder.tsx:44 - onClick existe ✅
onClick={() => onSearchClick?.(job)}

// jobs/page.tsx - Composant utilisé mais sans prop ❌
<JobsPlaceholder /> // Manque onSearchClick={handleSearch}
```

**Fichiers Impactés**:
- `frontend-next/src/app/(dashboard)/jobs/page.tsx` (ligne ~530)
- `frontend-next/src/components/jobs/jobs-placeholder.tsx` (déjà OK)

**Solution**:
1. ✅ Dans `jobs/page.tsx`, passer prop `onSearchClick` au `JobsPlaceholder`
2. ✅ Connecter à la fonction de recherche existante
3. ✅ Test: Clic sur "Développeur Full Stack" → lance recherche

**Estimation**: 15 min

---

### Bug #5: Envoi Message avec Touche Entrée
**Symptôme**: Actuellement Ctrl/Cmd+Entrée, demande Entrée simple
**Impact**: 🟠 Important - UX non standard
**Demande**: Entrée envoie, Shift+Entrée nouvelle ligne

**Fichiers Impactés**:
- `frontend-next/src/app/(dashboard)/assistant/page.tsx` (lignes 503-510)

**Solution**:
```tsx
// Avant (ligne 503-510):
onKeyDown={(e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    // Send
  }
}}

// Après:
onKeyDown={(e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage(input)
  }
  // Shift+Enter = nouvelle ligne (comportement natif textarea)
}}
```

**Estimation**: 10 min

---

## 🟡 PRIORITÉ 2 - MINEURS (Fix Cette Semaine)

### Bug #6: Bouton Blanc "Voir les Avis"
**Symptôme**: Bouton invisible (blanc sur blanc)
**Impact**: 🟡 Mineur - Esthétique

**Fichiers**: `frontend-next/src/components/recruiter/hero-section.tsx:58-65`

**Solution**:
1. ✅ Vérifier contraste couleurs
2. ✅ Ajuster classes CSS si nécessaire
3. ✅ Test visuel

**Estimation**: 10 min

---

### Bug #7: FAQ Coupée en Bas
**Symptôme**: Section FAQ coupée en bas de page
**Impact**: 🟡 Mineur - Contenu partiellement caché

**Fichiers**:
- `frontend-next/src/components/recruiter/faq-section.tsx`
- `frontend-next/src/app/(dashboard)/recruiter-contact/page.tsx`

**Solution**:
1. ✅ Ajouter `mb-16` ou padding approprié
2. ✅ Vérifier rendu complet

**Estimation**: 5 min

---

## ⚡ PRIORITÉ 3 - OPTIMISATIONS (Sprint Prochain)

### Bug #8: Performance Recherche d'Emploi
**Symptôme**: Recherche un peu lente
**Impact**: ⚡ Optimisation - Performance

**Solution**:
1. Profiler requêtes DB
2. Ajouter index manquants
3. Optimiser queries Supabase
4. Cache côté frontend

**Estimation**: 2-3h (investigation + implémentation)

---

### Bug #9: Stockage CV dans Profil
**Symptôme**: Duplication CV en DB (10 CV/user possible)
**Impact**: ⚡ Feature - Optimisation DB

**Solution**:
1. Table `user_cvs` avec CV principal
2. Option "Utiliser mon CV enregistré"
3. Téléchargement ponctuel toujours possible
4. Migration données existantes

**Estimation**: 4-6h (feature complète)

---

## 🎯 Ordre d'Exécution Recommandé

### Phase 1: Fix Critiques (1h15)
1. ✅ Bug #1: Premium verification → **30 min**
2. ✅ Bug #2: Soft Skills detection → **45 min**

### Phase 2: Fix Importants (1h)
3. ✅ Bug #4: Recherches cliquables → **15 min**
4. ✅ Bug #5: Entrée envoie message → **10 min**
5. ✅ Bug #3: Affichage assistant → **20 min**

### Phase 3: Fix Mineurs (15 min)
6. ✅ Bug #6: Bouton avis → **10 min**
7. ✅ Bug #7: FAQ coupée → **5 min**

### Phase 4: Optimisations (Sprint suivant)
8. ⏭️ Bug #8: Performance recherche
9. ⏭️ Bug #9: Stockage CV profil

**Total Phases 1-3**: ~2h30
**Total avec optimisations**: ~10h

---

## ✅ Checklist de Validation

### Pour chaque bug:
- [ ] Code modifié et testé localement
- [ ] Pas de breaking changes
- [ ] Pas de duplication de code
- [ ] Tests manuels OK
- [ ] Build passe sans erreurs
- [ ] Commit avec message descriptif
- [ ] Update de ce document avec statut

### Avant PR finale:
- [ ] Tous les bugs P0-P2 corrigés
- [ ] Tests de non-régression
- [ ] Build frontend + backend OK
- [ ] Documentation mise à jour
- [ ] Screenshots avant/après pour bugs visuels

---

## 📝 Notes Techniques

### Architecture Impactée:
- **Frontend**: Contexts, Hooks, Components
- **Backend**: Agents CV, Prompts système
- **DB**: Aucune migration nécessaire (P0-P2)

### Risques Identifiés:
- ⚠️ Bug #1: Cache localStorage peut persister → Clear cache recommandé
- ⚠️ Bug #2: Changement prompt peut affecter autres analyses → Tests requis
- ✅ Autres bugs: Low risk, changements localisés

### Dépendances:
- Aucune dépendance croisée entre bugs P0-P2
- **Parallelisation possible**: Bugs peuvent être fixés indépendamment

---

## 🚀 Prochaines Étapes

1. **Immédiat**: Commencer par Bug #1 (Premium verification)
2. **Aujourd'hui**: Finir Phase 1-2 (bugs P0-P1)
3. **Cette semaine**: Phase 3 (bugs P2)
4. **Sprint prochain**: Phase 4 (optimisations)

---

---

## 📊 STATUS FINAL

### ✅ Bugs Corrigés (7/10)

**🔴 P0 - CRITIQUES** (2/2) ✅
- [x] Bug #1: Premium verification (historique + favoris) - 30 min
- [x] Bug #2: Soft Skills detection - 45 min

**🟠 P1 - IMPORTANTS** (3/3) ✅
- [x] Bug #3: Affichage assistant coach - 20 min
- [x] Bug #4: Recherches populaires cliquables - 15 min
- [x] Bug #5: Envoi message avec Entrée - 10 min

**🟡 P2 - MINEURS** (2/2) ✅
- [x] Bug #6: Bouton "Voir les avis" - 10 min
- [x] Bug #7: FAQ coupée - 5 min

**⚡ P3 - OPTIMISATIONS** (0/2) ⏭️ Sprint prochain
- [ ] Bug #8: Performance recherche
- [ ] Bug #9: Stockage CV profil

### 📈 Résumé
- **Temps estimé P0-P2**: 2h10
- **Temps réel**: ~2h00
- **Build**: ✅ PASSE
- **Breaking changes**: ❌ AUCUN
- **Tests**: ✅ Manuels OK

---

**Status**: ✅ COMPLETED (P0-P2)
**Dernière MAJ**: 2026-02-13
**Par**: Claude Code + Wissem
