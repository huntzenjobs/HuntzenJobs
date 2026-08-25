# Validation UI/UX staging — lot A

**Date :** 2026-08-15

**Commit :** `d57a4c2` (`fix(frontend): harden shared mobile UX`)

**Déploiement Vercel :** `dpl_DLghrp6PVuJr1DACPSX8t5CZBkrQ`

**Cible :** `staging`

**URL vérifiée :** `https://staging.huntzenjobs.com`

## Résultat

- Déploiement Vercel `READY` et alias staging réassigné au déploiement ci-dessus.
- Accueil, connexion, inscription, tarifs, FAQ, contact, emplois et worker Serwist : HTTP 200.
- Vérification visuelle réelle à 390 × 844 et 1440 × 900 avec le navigateur intégré, sans Playwright.
- Aucun débordement horizontal visible à 390 px ; logo compact, CTA d'inscription et bouton menu entièrement visibles.
- Menu mobile complet : connexion, inscription, recherche, salons, outils, ressources, tarifs et quatre langues.
- Noms accessibles vérifiés dans le DOM : ouverture/fermeture du menu et changement de langue.
- Navigation desktop préservée à 1440 px.
- Onglet staging neuf : aucune erreur ni aucun avertissement dans la console.
- L'enregistrement Serwist est désactivé sur `staging.huntzenjobs.com` et les hôtes `*.vercel.app`, tout en restant actif sur `huntzenjobs.com`.

## Captures

- `home-390-after.jpg` : accueil mobile fermé.
- `menu-390-after.jpg` : menu mobile ouvert.
- `home-1440-after.jpg` : accueil desktop.

## Gates du commit

- TypeScript : vert.
- ESLint : zéro erreur, 102 avertissements historiques (aucune augmentation).
- Vitest : 41 fichiers, 330 tests verts.
- Build Next.js 16.3.1/Turbopack avec environnement Vercel preview : vert, 61 pages.
- `git diff --check` : vert.

## Rollback

Réassigner `staging.huntzenjobs.com` au déploiement précédent
`dpl_F2kGBLdMXpPHxxU8Eaj2PPDWNQR3`, puis revert du commit `d57a4c2` si nécessaire.
