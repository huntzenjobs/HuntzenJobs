# Validation UI/UX staging — lot C (espace candidat)

**Date :** 2026-08-15

**Commits :**

- `7156be3` (`fix(frontend): stabilize quota hydration`)
- `31874b7` (`fix(frontend): refine CV analysis mobile UX`)
- `b95e123` (`fix(frontend): improve candidate dashboard UX`)
- `be07b7c` (`fix(frontend): align fallback quota limits`)

**Déploiement Vercel final :** `dpl_BqFBfaesWHXM98MmV2UFwLUYjbZb`

**Cible :** environnement personnalisé `staging`

**URL vérifiée :** `https://staging.huntzenjobs.com`

## Résultat

- Déploiement final `READY`, build Next.js 16.3.1/Turbopack vert et alias staging actif.
- L'analyse CV mobile ne compacte plus ses actions au point de masquer les libellés ;
  le compteur de quota reste lisible et expose une progression accessible.
- L'hydratation conserve les limites de repli pendant le chargement au lieu de
  faire clignoter des limites nulles.
- Le dashboard candidat améliore les libellés, états et actions des documents,
  favoris, profil et recherche de recruteur sans changer les fonctions ni les couleurs.
- Le dernier contrôle DOM staging sur `/jobs` et `/cv-analysis` confirme
  `5 adaptations CV/5/jour`, `5 restant(e)s sur 5`,
  `10 lettres de motivation/10/jour` et `10 restant(e)s sur 10`.
- La console du navigateur intégré est vide sur les pages candidat finales.
- Le compte candidat est correctement redirigé de `/admin` vers `/jobs`.

## Preuve visuelle

La capture `../lot-c-before/cv-analysis-390-before.png` conserve l'état mobile
ayant déclenché les corrections. Après déploiement, la vérification visuelle et
DOM a été effectuée dans le navigateur intégré. La capture finale n'a pas été
conservée : l'API locale de capture a expiré puis fermé la cible, sans erreur de
page ni de console. Cette panne d'outil ne remplace pas la preuve DOM et n'est pas
présentée comme une anomalie applicative.

## Gates

- TypeScript : vert (`npx tsc --noEmit`).
- ESLint : 0 erreur, 99 avertissements historiques.
- Vitest : 53 fichiers, 352 tests verts.
- `npm audit --audit-level=low` : 0 vulnérabilité.
- Build Vercel distant : vert, 61 pages et 12 entrées Serwist.
- Backend staging : `/health`, `/api/health/ping` et `/api/auth/test-debug` répondent `200`.

## Rollback

Réassigner l'environnement staging au déploiement UI/UX précédent, puis revert
des commits du lot dans l'ordre inverse. La production n'a pas été modifiée.
