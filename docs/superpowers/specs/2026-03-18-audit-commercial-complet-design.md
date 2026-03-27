# Design — Audit Commercial Complet HuntZen
Date : 2026-03-18
Statut : Validé par Wissem

---

## Contexte

HuntZen est un SaaS d'aide à la recherche d'emploi (Next.js 14 + FastAPI + Supabase + Stripe) en phase de lancement commercial imminent (1 semaine). Le flow principal (signup → jobs → coach) fonctionne, mais les edge cases, la sécurité, l'i18n, et la cohérence UI n'ont jamais été auditées systématiquement. L'objectif est d'atteindre le standard 100/100 sur toutes les dimensions avant de vendre à des clients payants.

---

## Approche choisie : Audit séquentiel complet (Option A)

Audit total d'abord → rapport complet → corrections dans l'ordre de criticité.

**Raison :** Wissem veut une vision exhaustive du projet avant de corriger, pour ne rien manquer et prioriser correctement sur la semaine de lancement.

---

## Architecture en 3 phases

### Phase 0 — Cartographie totale
Un subagent dédié explore l'intégralité du projet et produit une MAP complète.

**Contenu de MAP.md :**
1. Inventaire pages frontend (chemin, type SSR/SSG/CSR, auth requise)
2. Inventaire composants UI par catégorie (chemin complet)
3. Inventaire endpoints backend (méthode, chemin, auth, rate limit)
4. Inventaire tables Supabase (nom, colonnes clés, RLS activée)
5. Inventaire variables d'environnement (nom, service, obligatoire)
6. Inventaire intégrations tierces (service, usage, clé d'env)
7. Inventaire fichiers de traduction (clés présentes FR vs EN)

**Output :** `docs/audit/MAP.md`
**Gate :** Wissem valide la map avant de lancer les 10 subagents

### Phase 1 — Audit en parallèle (10 subagents Opus)
Tous les subagents lisent les fichiers réels. Rien n'est supposé.
Chaque subagent produit `docs/audit/subagents/[nom].md`.

**Modèle :** claude-opus-4-6 pour tous les subagents d'audit

| # | Subagent | Périmètre |
|---|----------|-----------|
| # | Subagent | Périmètre | Focus |
|---|----------|-----------|-------|
| 1 | business-logic | Auth flows, plans/quotas, Stripe, CV, Jobs, Coach | **Correction fonctionnelle** : est-ce que les flows font ce qu'ils sont censés faire ? |
| 2 | ui-ux | Toutes les pages, états UI, navigation, modaux, **mobile 320px** | États loading/error/empty, touch targets 44px, iOS Safari, breakpoints |
| 3 | i18n | Strings hardcodés, clés FR/EN, wording, copywriting | Chaque fichier .tsx scanné ligne par ligne |
| 4 | security | Auth guards, RLS Supabase, validation inputs, CORS, secrets | Ne pas dupliquer avec #6 : focus sur ACCÈS et DONNÉES |
| 5 | database | Schéma, index, migrations, contraintes, RLS policies | Index manquants, FK avec ON DELETE, migrations conflictuelles |
| 6 | api-integrations | Endpoints FastAPI, webhooks, emails, Modal Labs, **Sentry config** | **Implémentation technique** : error handling, idempotence, timeouts, Sentry source maps |
| 7 | performance-seo | Core Web Vitals, metadata, SSR/SSG, sitemap, images | Metadata unique par page, hreflang FR/EN, next/image partout |
| 8 | accessibility | WCAG AA, contraste, clavier, ARIA, labels | Ratio contraste 4.5:1, focus visible, annonces screen reader |
| 9 | code-quality | TODOs, console.log, any TypeScript, deps, code smell, **Sentry alerts** | Sentry configuré avec user context + alert rules |
| 10 | missing-features | Features manquantes critiques pour le lancement | CGU, mentions légales, bannière RGPD, customer portal Stripe |

### Phase 2 — Consolidation
Un subagent synthèse agrège les 10 rapports partiels en un rapport final.

**Output :** `docs/audit/AUDIT_COMMERCIAL_COMPLET.md`
**Gate :** Wissem valide le rapport avant de lancer les corrections

### Phase 3 — Corrections par sprint
Après validation du rapport, corrections dans l'ordre strict de criticité.

**GSD** (sans risque, immédiat) :
- Strings hardcodés → externalisation i18n
- console.log oubliés → suppression
- Imports inutilisés → nettoyage

**superpowers:execute-plan** (corrections complexes) :
- Sprint 1 — Sécurité critique + Auth + Stripe (Jour 1-2)
- Sprint 2 — UI critique + i18n (Jour 3-4)
- Sprint 3 — SEO + Performance + Qualité (Jour 5-6)
- Sprint 4 — Buffer + validation finale (Jour 7)

Après chaque sprint :
- `npm run type-check` + `ruff check` + tests
- Commit conventionnel
- Update du plan d'action dans le rapport

---

## Format du rapport final

```markdown
## SCORES PAR DIMENSION
| Dimension | Score | Statut |
|-----------|-------|--------|
| Logique métier     | X/100 | 🔴/🟠/🟡/🟢 |
| Interface utilisateur | X/100 | |
| Internationalisation | X/100 | |
| Sécurité | X/100 | |
| Base de données | X/100 | |
| API & Intégrations | X/100 | |
| Performance & SEO | X/100 | |
| Accessibilité | X/100 | |
| Qualité du code | X/100 | |
| Features produit | X/100 | |

SCORE GLOBAL : X/100
PRÊT POUR LANCEMENT : OUI / NON / PARTIELLEMENT

## 🔴 BLOQUANTS (0 tolérance avant lancement)
### N. [Titre]
- Fichier : path/to/file:ligne
- Problème : description précise
- Impact client : ce que voit le user
- Fix : solution exacte

## 🟠 IMPORTANTS (corriger dans la semaine)
[même format]

## 🟡 AMÉLIORATIONS (v2)
[même format]

## ✅ CE QUI FONCTIONNE BIEN
[liste]

## 📋 PLAN D'ACTION SPRINT PAR SPRINT
[détail par jour]
```

---

## Contraintes

- Modèle : claude-opus-4-6 pour tous les subagents d'audit
- Rien n'est supposé — chaque claim est lié à un fichier:ligne réel
- Les docs/plans/ ne sont pas commités (CLAUDE.md rule)
- Pas de Co-Authored-By dans les commits
- Toujours sur branche Production (jamais main)

---

## Scoring

**Méthode :** chaque subagent note sa dimension sur 100. Le score global est une moyenne pondérée :

| Dimension | Poids (launch readiness) |
|-----------|--------------------------|
| Sécurité | 20% |
| Logique métier | 20% |
| API & Intégrations | 15% |
| Interface utilisateur | 15% |
| Internationalisation | 10% |
| Base de données | 10% |
| Performance & SEO | 5% |
| Accessibilité | 2% |
| Qualité du code | 2% |
| Features produit | 1% |

La sécurité et la logique métier pèsent le plus lourd car ce sont elles qui font perdre un client payant.

## Critère de succès

Le rapport final identifie 0 🔴 non corrigé avant le lancement.
Score global pondéré ≥ 85/100 avant lancement (100/100 objectif v2).
Wissem peut répondre "oui" à : "Est-ce que je paierais pour une app qui fait ça ?"

---

## Sprint A — i18n 28→100 (détail d'implémentation)

**Branche :** Production (worktree dédié `sprint-i18n`)
**Modèle :** claude-opus-4-6 sur tous les subagents
**Priorité :** Score i18n = 28/100 → objectif 100/100
**État Sprint 1 :** commité (`a75b502`). Sprint A entièrement vierge.

### Ordre d'exécution et dépendances

```
A1 (scanner) → A2+A3 (fix JSON) → A4, A5, A6, A7, A8 (en parallèle) + A9 (indépendant) → A10 (sync finale) → A-REVIEW
```

### Subagent A1 — SCANNER i18n (lecture seule)

**Objectif :** Produire la liste exhaustive de TOUS les strings hardcodés restants.
**Action :** Lire chaque fichier `.tsx`, `.ts`, `.py` ligne par ligne. NE RIEN MODIFIER.
**Output :** `docs/audit/i18n-todo.md` au format `fichier:ligne:texte:clé-proposée`
**Gate :** A2+A3 ne démarre qu'après la production de ce fichier.

### Subagent A2+A3 — FIX traductions JSON (fusionné)

**Objectif :** Corriger TOUS les problèmes JSON en une seule passe (évite les conflits de merge).
**Fichiers :** `messages/fr.json`, `messages/en.json`, `messages/es.json`, `messages/pt.json`

Corrections à appliquer :
- **44 clés FR→EN manquantes** (hero, features, footer, taglines pricing) — ajouter dans `en.json`
- **EN :** `documents.downloadButton` → "Download" (pas "Upload")
- **EN :** section salons → "Online" (pas "Inline"), "Event" (pas "Property"), etc.
- **PT :** `experienceSenior` → "Sênior" (pas "Idoso" — offensant)
- **ES :** `savedJobs.comingSoonTitle` → supprimer balises `<g>`
- **PT :** `payment.cancel.tipLabel` → supprimer `&#x0D;`

**Validation :** `diff messages/en.json avant/après` + vérification manuelle de chaque traduction
**Commit :** `fix(i18n): add 44 missing FR→EN keys + correct erroneous EN/PT/ES translations`

### Subagents A4-A8 (parallélisables après A2+A3)

**A4 — Pages dashboard hardcodées** (priorité commerciale) :
Pages dans cet ordre : pricing → referral → candidatures → expat → documents → salons
Process par page : identifier strings → créer clés dans fr.json ET en.json → remplacer avec `useTranslations` → `tsc --noEmit` → commit par page

**A5 — Pages publiques hardcodées** :
Pages : about (~100+ strings), faq (~50), blog (~40), temoignages (~30)
Privacy et terms : créer fichiers MDX séparés par langue plutôt que clés i18n (textes légaux longs)

**A6 — 35 toasts hardcodés** :
Remplacer chaque `toast("message FR")` par `toast(t("namespace.clé"))`
Vérification finale : `grep 'toast("' .` → 0 résultat

**A7 — CV builder placeholders** :
Fichiers `step-*.tsx` — externaliser ~20 placeholders dans namespace `cvBuilder.*`

**A8 — Tutoiement/vouvoiement** :
Lire la landing page pour identifier le registre dominant → appliquer uniformément sur TOUT le dashboard
Review : 10 pages représentatives pour confirmer cohérence du ton

### Subagent A9 — Emails multilingues (indépendant — backend)

**Fichier :** `backend/src/services/email.py`
Ajouter paramètre `language` sur les 11 templates email.
Créer versions EN de chaque template.
**Validation :** `ruff check .`
**Commit :** `fix(i18n): add language parameter to email templates`

### Subagent A10 — Sync ES/PT (après A4-A8)

Synchroniser les sections manquantes en ES et PT :
- `welcome` (messages d'accueil coach)
- `quickAction` (actions rapides dashboard)
- `referral` (page de parrainage)

**Validation :** script diff entre `fr.json` et `es.json`/`pt.json` → 0 section présente en FR absente en ES/PT
**Commit :** `fix(i18n): sync ES/PT with FR missing sections`

### Subagent A-REVIEW — Audit final

Relancer `/commercial "dimension i18n uniquement"`.
Si score < 100 → identifier ce qui manque → corriger.
Si score = 100 → `/checkpoint` → valider transition Sprint B.

### Règles absolues Sprint A

- **READ → MODIFY → VALIDATE → VERIFY → COMMIT** — jamais sauter une étape
- Validation après chaque fichier : `cd frontend-next && npm run lint && npx tsc --noEmit`
- Backend : `ruff check . 2>&1 | head -20`
- Si erreur → corriger IMMÉDIATEMENT avant tout autre fichier
- Jamais committer `docs/plans/`
- Pas de `Co-Authored-By` dans les commits
- Un subagent reviewer indépendant relit chaque modification avant commit
