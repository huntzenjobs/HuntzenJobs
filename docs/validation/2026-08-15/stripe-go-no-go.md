# Go/No-Go facturation Stripe

**Date :** 12 août 2026
**Périmètre :** sandbox Stripe Test + Supabase/Railway staging
**Production :** aucune mutation pendant cette validation

## Décision actuelle

**NO-GO production / GO technique partiel en staging.**

Le code critique dispose de 104 tests ciblés verts (101 unitaires et 3 tests
PostgreSQL staging réels) et les migrations
transactionnelles/outbox sont présentes sur PostgreSQL staging réel. Un sandbox
Stripe Test est désormais raccordé à la préproduction, mais le backend Railway
staging exécute encore la branche distante historique et ne contient donc pas le
lot local complet (`stripe_effect_outbox_task` absent des logs ARQ).

## Éléments validés

- Sandbox Stripe Test confirmé : aucune transaction réelle possible.
- Catalogue séparé avec trois produits : Recherche Active, Accélérateur et Carrière.
- Six prix EUR récurrents mensuel/annuel créés et mappés uniquement dans Supabase staging.
- Endpoint webhook staging distinct limité aux cinq événements réellement traités.
- Clés Test et secret de signature injectés comme variables masquées Railway staging.
- L'ancienne clé standard Test rendue visible pendant l'audit a été immédiatement tournée.
- Backend staging toujours sain après l'injection : `/api/health/ping` retourne `200`.
- 104 tests backend ciblés Stripe, recruteur, promo, réconciliation, Auth et Storage CV passent.
- Le claim webhook et outbox a été exercé avec deux connexions PostgreSQL
  concurrentes : un seul propriétaire, token de fencing obligatoire, retry puis
  dead-letter, ACL service_role et nettoyage final à zéro.

## Gates encore obligatoires

1. Publier le candidat local sur une branche distante autorisée, sans écraser les changements existants.
2. Redéployer backend et worker staging ; exiger `stripe_effect_outbox_task` dans les logs ARQ et un seul réplica worker.
3. Réauthentifier Stripe CLI Test puis rejouer les cinq événements signés
   contre ce candidat ; la session locale a expiré le 12 août.
4. Tester Checkout, renouvellement, impayé, résiliation, réactivation, concurrence et retry partiel.
5. Exécuter le nettoyage des sessions legacy en dry-run, inspecter chaque cible, puis seulement appliquer.
6. Exécuter la réconciliation Stripe en dry-run et obtenir zéro divergence critique.
7. Vérifier l'alerte dead-letter/Sentry par erreur contrôlée.
8. Valider avec Leonel la politique TVA avant toute activation de Stripe Tax ; aucune activation automatique n'a été faite.

Tant que ces gates ne sont pas verts, aucune clé Test ne doit être remplacée par
une clé Live et aucun endpoint production ne doit être modifié.
