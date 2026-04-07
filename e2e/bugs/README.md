# 🧪 Bug Tests E2E - Playwright

Tests automatisés pour valider les 9 bugs corrigés sur **production déployée**.

## 📋 Tests Créés

| Test | Bug | Priority | Scénarios | Durée |
|------|-----|----------|-----------|-------|
| `bug01-soft-skills-detection.spec.ts` | #1: Détection Soft Skills CV | P1 | 3 | 10 min |
| `bug02-coach-scroll.spec.ts` | #2: Scroll assistant coach | P1 | 3 | 5 min |
| `bug03-enter-key-send.spec.ts` | #3: Envoi avec Entrée | P2 | 5 | 5 min |
| `bug04-premium-history-access.spec.ts` | #4: Premium historique | P1 | 3 | 8 min |
| `bug05-premium-favorites-limit.spec.ts` | #5: Premium favoris | P1 | 5 | 8 min |
| `bug06-popular-searches-clickable.spec.ts` | #6: Recherches populaires | P2 | 4 | 5 min |
| `bug07-08-contact-recruiter-ui.spec.ts` | #7-8: Contact Recruteur UI | P3 | 7 | 5 min |
| `bug09-job-search-performance.spec.ts` | #9: Performance recherche | P1 | 6 | 10 min |

**Total:** 8 tests automatisés (9 bugs), 36 scénarios, ~60 min

## 🚀 Lancement des Tests

### 1. Configuration Environnement

Créer `.env.test` à la racine:

```bash
# Test credentials (use test account, not real user!)
TEST_USER_EMAIL=test@huntzenjobs.com
TEST_USER_PASSWORD=test_password_secure

# Production URLs (already in playwright.production.config.ts)
PLAYWRIGHT_BASE_URL=https://huntzenjobs.com
BACKEND_URL=https://huntzenjobs-production.up.railway.app
```

### 2. Installer Browsers Playwright

```bash
npx playwright install chromium
```

### 3. Lancer Tests Production

**Tous les tests:**
```bash
npx playwright test --config=playwright.production.config.ts
```

**Test spécifique:**
```bash
npx playwright test bug01-soft-skills-detection --config=playwright.production.config.ts
```

**Mode UI (visuel):**
```bash
npx playwright test --config=playwright.production.config.ts --ui
```

**Mode debug:**
```bash
npx playwright test bug02-coach-scroll --config=playwright.production.config.ts --debug
```

### 4. Voir le Rapport

Après exécution:
```bash
npx playwright show-report playwright-report-production
```

## 📝 Fixtures Nécessaires

Les tests CV (#1) nécessitent des fichiers PDF de test. Créer dans `e2e/fixtures/`:

```
e2e/fixtures/
├── cv-with-soft-skills.pdf       # CV avec "Leadership", "Communication", etc.
├── cv-technical-only.pdf          # CV avec seulement compétences techniques
└── cv-sample.pdf                  # CV générique pour tests performance
```

**Si les fixtures n'existent pas:** Les tests seront skipped automatiquement.

## 🎯 Critères de Succès

**Bug validé si:**
- ✅ Tous scénarios P1 (✅ PRIORITAIRE) passent
- ✅ Performance < seuils définis (3s recherche, 30s analyse CV)
- ✅ Pas de régression
- ✅ Aucune erreur console critique

## 🐛 Tests Manuels Requis

Tests NON automatisés (nécessitent validation manuelle):

| # | Bug | Raison | Action |
|---|-----|--------|--------|
| 4 | Premium historique | Nécessite comptes Free/Premium | Test manuel |
| 5 | Premium favoris | Nécessite comptes Free/Premium/Pro | Test manuel |
| 6 | Recherches populaires cliquables | Simple clic UI | Test manuel 2 min |
| 7 | Bouton "Voir les avis" | Contraste visuel | Test manuel 1 min |
| 8 | FAQ coupée | Scroll visuel | Test manuel 1 min |

**Voir:** `TEST_PLAN_9_BUGS.md` pour procédures détaillées

## 🔍 Debug

**Si test échoue:**

1. **Vérifier screenshots:**
   - `test-results-production/` contient screenshots d'échecs

2. **Vérifier trace:**
   ```bash
   npx playwright show-trace test-results-production/trace.zip
   ```

3. **Vérifier selectors:**
   - Tests utilisent `data-testid` quand disponible
   - Si UI change, mettre à jour selectors

4. **Network issues:**
   - Tests production = latence réseau
   - Augmenter timeouts si nécessaire

## 📊 CI/CD Integration

Ajouter au GitHub Actions:

```yaml
- name: Run Bug Tests (Production)
  run: |
    npm install
    npx playwright install chromium
    npx playwright test --config=playwright.production.config.ts
  env:
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

## 🛠️ Maintenance

**Quand mettre à jour les tests:**
- UI change (nouveaux selectors)
- Feature évolution (nouveaux flows)
- Nouvelles régressions découvertes

**Bonnes pratiques:**
- Utiliser `data-testid` dans composants React
- Garder tests indépendants (pas de dépendances entre tests)
- Nettoyer données de test après exécution

---

**Status:** ✅ Prêt à exécuter
**Prochaine étape:** Créer `.env.test` + lancer `npx playwright test --config=playwright.production.config.ts`
