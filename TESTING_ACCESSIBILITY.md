# Guide de Test d'Accessibilité - HuntZen

## 🎯 Objectif

Vérifier que les améliorations d'accessibilité WCAG 2.1 AA atteignent un score de **95/100** sur Lighthouse.

---

## 1️⃣ Test Automatisé: Lighthouse

### Option A: Chrome DevTools (Recommandé)

1. **Lancer le serveur de développement**
   ```bash
   cd frontend-next
   npm run dev
   ```

2. **Ouvrir Chrome DevTools**
   - Accédez à `http://localhost:3000/profile`
   - Appuyez sur `F12` (ou `Cmd+Option+I` sur Mac)
   - Allez dans l'onglet **Lighthouse**

3. **Configurer l'audit**
   - Mode: **Desktop** ou **Mobile**
   - Catégories: Cochez uniquement **Accessibility**
   - Cliquez sur **Analyze page load**

4. **Vérifier le score**
   - ✅ **Score cible**: ≥ 95/100
   - Si < 95, consultez la section "Issues" pour les problèmes détectés

### Option B: Ligne de commande

```bash
npm install -g lighthouse
lighthouse http://localhost:3000/profile --only-categories=accessibility --view
```

---

## 2️⃣ Test Manuel: Lecteur d'écran

### Sur macOS: VoiceOver

1. **Activer VoiceOver**
   - Appuyez sur `Cmd + F5`
   - Ou allez dans **Préférences Système → Accessibilité → VoiceOver**

2. **Navigation clavier (VoiceOver activé)**
   - `Tab` / `Shift+Tab`: Naviguer entre les éléments interactifs
   - `Ctrl+Option+→` / `←`: Naviguer entre tous les éléments
   - `Ctrl+Option+Space`: Activer un élément
   - `Cmd+F5`: Désactiver VoiceOver

3. **Scénarios à tester sur `/profile`**

   **A. Avatar Upload**
   - [ ] Naviguer au bouton avatar avec `Tab`
   - [ ] VoiceOver annonce: "Changer votre photo de profil, bouton"
   - [ ] Cliquer pour sélectionner un fichier
   - [ ] Après upload réussi, VoiceOver annonce: "✓ Photo de profil mise à jour"

   **B. Settings Section (Toggles)**
   - [ ] Naviguer au switch "Notifications par email"
   - [ ] VoiceOver annonce: "Activer les notifications par email, coché, case à cocher"
   - [ ] Appuyer sur `Space` pour toggle
   - [ ] Description lue: "Recevez des notifications pour les événements importants..."
   - [ ] Répéter pour "Newsletter HuntZen"

   **C. Subscription Card**
   - [ ] Naviguer au bouton "Passer à Starter"
   - [ ] VoiceOver annonce: "Passer au plan Starter pour 9,99€/mois, bouton"
   - [ ] Les icônes décoratives (Check, Crown, etc.) ne sont PAS annoncées

   **D. Usage Counter (Barres de progression)**
   - [ ] Naviguer aux barres de progression
   - [ ] VoiceOver annonce: "analyses: X restant(e)s sur Y, barre de progression"
   - [ ] Valeurs min/max/current sont lues correctement

### Sur Windows: NVDA (gratuit)

1. **Installer NVDA**
   - Téléchargez depuis [https://www.nvaccess.org/download/](https://www.nvaccess.org/download/)
   - Installez et lancez

2. **Navigation**
   - `Tab` / `Shift+Tab`: Naviguer entre éléments
   - `↑` / `↓`: Lire ligne par ligne
   - `Insert+F7`: Liste des éléments (formulaires, liens, titres)
   - `Insert+Q`: Quitter NVDA

3. **Testez les mêmes scénarios** que pour VoiceOver ci-dessus

---

## 3️⃣ Test Clavier Uniquement (Sans souris)

### Navigation

1. **Skip Link (doit apparaître au premier `Tab`)**
   - [ ] Appuyez sur `Tab` dès l'arrivée sur la page
   - [ ] Un lien "Aller au contenu principal" apparaît en haut à gauche (bleu)
   - [ ] Appuyez sur `Enter` → le focus saute au contenu principal

2. **Ordre de tabulation logique**
   - [ ] Les éléments reçoivent le focus dans un ordre logique (haut → bas, gauche → droite)
   - [ ] Tous les boutons, liens, inputs, switches sont accessibles au clavier
   - [ ] L'indicateur de focus est visible (anneau bleu)

3. **Toggles (Switches)**
   - [ ] Utilisez `Tab` pour atteindre un switch
   - [ ] Appuyez sur `Space` pour toggle (PAS `Enter`)
   - [ ] Le changement visuel est immédiat

4. **Avatar Upload**
   - [ ] `Tab` pour atteindre le bouton "Modifier la photo"
   - [ ] `Enter` pour ouvrir le file picker
   - [ ] Sélectionnez un fichier
   - [ ] Le focus revient au bouton après upload réussi

---

## 4️⃣ Checklist de Vérification Rapide

### Éléments Critiques

- [ ] **Tous les éléments interactifs sont accessibles au clavier**
- [ ] **L'indicateur de focus est visible** (anneau bleu)
- [ ] **Les icônes décoratives ont `aria-hidden="true"`**
- [ ] **Les boutons ont des labels clairs** (visuels ET aria-label si nécessaire)
- [ ] **Les switches ont `aria-label` et `aria-describedby`**
- [ ] **Les barres de progression ont `role="progressbar"` avec aria-valuemin/max/now**
- [ ] **Les live regions fonctionnent** (announcements après actions)
- [ ] **Skip link apparaît au premier Tab** et fonctionne

### Contraste des Couleurs

- [ ] Texte noir sur fond blanc: ≥ 4.5:1
- [ ] Texte gris `text-gray-500` sur fond blanc: ≥ 4.5:1
- [ ] Boutons bleus sur fond blanc: ≥ 3:1 (UI components)

### Responsive

- [ ] Tous les éléments restent accessibles sur mobile (touch targets ≥ 44x44px)
- [ ] Le Skip link fonctionne sur mobile
- [ ] Les labels restent lisibles sur petits écrans

---

## 5️⃣ Problèmes Courants et Solutions

### Lighthouse Score < 95

**Problème**: "Elements must have sufficient color contrast"
- **Solution**: Vérifiez les couleurs avec [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- Minimum 4.5:1 pour le texte normal, 3:1 pour les composants UI

**Problème**: "Buttons do not have an accessible name"
- **Solution**: Ajoutez `aria-label` si le bouton contient seulement une icône

**Problème**: "IDs used in ARIA must be unique"
- **Solution**: Vérifiez que tous les `id` sont uniques (ex: `id="email-notifications-description"`)

### Lecteur d'écran n'annonce pas les changements

- **Vérifiez** que `useAnnounceSuccess()` et `useAnnounceError()` sont appelés
- **Vérifiez** que les live regions ont `role="status"` et `aria-live="polite"`

### Focus non visible

- **Solution**: Ajoutez `focus:ring-2 focus:ring-blue-600 focus:outline-none` aux éléments interactifs

---

## 6️⃣ Résultats Attendus

### Lighthouse (Objectif)

| Catégorie        | Score Cible |
|------------------|-------------|
| Accessibility    | **≥ 95/100** |

### WCAG 2.1 AA (Conformité)

- ✅ **1.1.1**: Contenu non textuel (alt text, aria-label)
- ✅ **1.4.3**: Contraste minimum (4.5:1)
- ✅ **2.1.1**: Clavier (tous les éléments accessibles)
- ✅ **2.4.1**: Skip link (Bypass Blocks)
- ✅ **2.4.7**: Focus visible
- ✅ **3.2.2**: Input (no change on focus)
- ✅ **4.1.2**: Name, Role, Value (ARIA labels)

---

## 7️⃣ Outils Supplémentaires

### Extensions Chrome Recommandées

1. **axe DevTools** (gratuit)
   - [Chrome Web Store](https://chrome.google.com/webstore/detail/axe-devtools-web-accessib/lhdoppojpmngadmnindnejefpokejbdd)
   - Détecte 57% de tous les problèmes WCAG automatiquement

2. **WAVE Evaluation Tool** (gratuit)
   - [Chrome Web Store](https://chrome.google.com/webstore/detail/wave-evaluation-tool/jbbplnpkjmmeebjpijfedlgcdilocofh)
   - Visualisation des problèmes d'accessibilité en overlay

3. **Accessibility Insights** (Microsoft, gratuit)
   - [Chrome Web Store](https://chrome.google.com/webstore/detail/accessibility-insights-fo/pbjjkligggfmakdaogkfomddhfmpjeni)
   - Guide de test étape par étape

### Validateurs en Ligne

- **WebAIM Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **WAVE**: https://wave.webaim.org/
- **Accessibility Checker**: https://www.accessibilitychecker.org/

---

## 📊 Rapport de Test (Template)

```markdown
# Rapport de Test d'Accessibilité - HuntZen Profile Page

**Date**: YYYY-MM-DD
**Testeur**: [Votre nom]
**Page testée**: `/profile`

## Lighthouse Score

- **Accessibility**: XX/100
- **Issues détectées**: [Liste des problèmes]

## Lecteur d'écran (VoiceOver/NVDA)

- [x] Avatar Upload: Annonces correctes
- [x] Settings toggles: Labels clairs
- [x] Subscription Card: Bouton upgrade descriptif
- [x] Usage Counter: Barres de progression avec valeurs

## Navigation Clavier

- [x] Skip link fonctionne
- [x] Ordre de tabulation logique
- [x] Focus visible sur tous les éléments
- [x] Tous les éléments activables au clavier

## Problèmes Identifiés

1. [Description du problème]
   - **Sévérité**: Critique / Important / Mineur
   - **Solution proposée**: [...]

## Recommandations

- [...]

## Statut Final

✅ **Prêt pour production** / ⚠ **Nécessite des corrections**
```

---

## 🎯 Prochaines Étapes

1. **Tester avec Lighthouse** → Objectif ≥ 95/100
2. **Tester avec VoiceOver/NVDA** → Tous les scénarios passent
3. **Tester navigation clavier** → Skip link + focus visible
4. **Corriger les problèmes** identifiés
5. **Re-tester** jusqu'à conformité complète
6. **Documenter** dans le rapport de test

---

**Questions ou problèmes ?**
Consultez [ACCESSIBILITY.md](./ACCESSIBILITY.md) pour les patterns détaillés.
