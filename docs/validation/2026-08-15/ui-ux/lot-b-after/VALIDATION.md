# Validation UI/UX staging — lot B

**Date :** 2026-08-15

**Commits :**

- `46d2c81` (`fix(frontend): improve public form accessibility`)
- `b1b552a` (`fix(contact): avoid duplicate mobile validation toast`)
- `249be49` (`fix(security): skip anonymous audit RPC calls`)
- `cf7fbc5` (`chore(vercel): exclude local build caches`)

**Déploiement Vercel final :** `dpl_6cGPr4waoRsXPxE5X4YJVq8gLPhA`

**Cible :** environnement personnalisé `staging`

**URL vérifiée :** `https://staging.huntzenjobs.com`

## Résultat

- Déploiement Vercel `READY` et domaine `staging.huntzenjobs.com` rattaché
  durablement à l'environnement personnalisé `staging`.
- Formulaires de connexion, inscription et contact vérifiés à 390 × 844 ; FAQ
  vérifiée à 1440 × 900 avec le navigateur intégré, sans Playwright.
- Les champs d'authentification exposent les attributs d'auto-complétion attendus,
  les erreurs sont reliées aux champs et le focus revient au premier champ invalide.
- Le succès d'inscription utilise un dialogue accessible et scrollable ; ses actions
  restent visibles sur mobile sans chevauchement avec la bannière cookies.
- Le formulaire Contact affiche ses erreurs localement sans toast redondant qui
  recouvrirait l'en-tête mobile.
- La recherche FAQ est un champ `search` nommé et les accordéons exposent leur état.
- Le logger de sécurité n'appelle plus la RPC protégée sans session authentifiée ;
  les échecs anonymes restent couverts par les journaux Supabase Auth.
- Serwist reste désactivé sur le staging protégé et sur les hôtes `*.vercel.app`,
  donc la redirection SSO Vercel ne peut pas casser son enregistrement.
- L'upload Vercel est passé d'environ 135 Mo à 755 Ko grâce à `.vercelignore`.

## Captures

- `signup-success-390-after.jpg` : dialogue de confirmation mobile avec toutes les
  actions accessibles. Capture réalisée sur le déploiement précédent du même lot
  (`dpl_Ayer5mz23gRsG2GVQRH2Jh8SuRcA`) ; le redéploiement final ne modifie que le
  logger de sécurité, sans changement visuel.
- `contact-errors-390-after.jpg` : erreurs locales et absence de toast superposé.
  Capture réalisée sur `dpl_Ayer5mz23gRsG2GVQRH2Jh8SuRcA` après `b1b552a`.
- `faq-desktop-after.jpg` : FAQ au breakpoint desktop sur le déploiement final
  `dpl_6cGPr4waoRsXPxE5X4YJVq8gLPhA`.

La capture Login contenant un identifiant auto-rempli par le navigateur a été
explicitement exclue des preuves. Le DOM mobile et la console ont été vérifiés
séparément sans erreur.

## Gates de l'état final

- TypeScript : vert (`npx tsc --noEmit`).
- ESLint : zéro erreur, 102 avertissements historiques (seuil inchangé).
- Vitest : 47 fichiers, 340 tests verts.
- Build Vercel Next.js 16.3.1 / Turbopack : vert, 61 pages.
- Serwist : 12 entrées de précache, 49,99 Kio.
- Traductions : 2 211 clés présentes dans les quatre locales.
- `git diff --check` : vert sur les changements de code.

## Rollback

Réassigner l'environnement staging au déploiement
`dpl_Ayer5mz23gRsG2GVQRH2Jh8SuRcA`, puis revert des commits du lot dans l'ordre
inverse si nécessaire. La production n'a pas été modifiée.
