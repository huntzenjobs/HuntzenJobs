# Go/No-Go facturation Stripe

**Date :** 12 août 2026
**Périmètre :** sandbox Stripe Test + Supabase/Railway staging
**Production :** aucune mutation pendant cette validation

## Décision actuelle

**NO-GO production / GO technique renforcé en staging.**

Le candidat aligné est déployé sur Vercel, Railway et le worker ARQ staging. Un
Checkout HuntZen synthétique complet a validé la création Starter, le ledger,
les webhooks, la résiliation idempotente et la réactivation. Le scénario
d'impayé réel a révélé puis corrigé par migration forward un défaut d'ordre des
événements Stripe. La production reste inchangée.

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
- Un Checkout Starter mensuel Test à 9,99 EUR a été payé avec une carte de test,
  puis résilié et nettoyé ; aucun paiement réel n'a été lancé.
- L'ordre réel `customer.subscription.updated(past_due)` avant
  `invoice.payment_failed` est désormais indépendant : deux effets outbox et
  une notification idempotente sont créés par facture.
- Les migrations `20260813224640_fix_payment_failed_notification_order.sql` et
  `20260814083310_enforce_unique_payment_failed_notification.sql` sont
  appliquées uniquement au staging ; l'unicité est garantie par index, les 4
  tests PostgreSQL ciblés et le lint DB au niveau warning sont verts.

## Gates encore obligatoires

1. Transférer les quatre domaines HuntZen vers la nouvelle équipe Resend après
   activation du forfait Pro autorisé, puis valider une livraison contrôlée.
2. Restaurer la livraison email staging puis vérifier une réception Resend
   contrôlée ; le retry, le passage dead-letter et l'appel Sentry sont déjà verts.
3. Valider avec Leonel la politique TVA avant toute activation de Stripe Tax ;
   aucune activation automatique n'a été faite.

La réconciliation du 14 août ne contient plus aucune divergence active : un
abonnement est synchronisé et cinq abonnements annulés restent classés comme
historique Stripe Test. Les deux fixtures génériques encore actives ont été
annulées en mode Test.

Tant que ces gates ne sont pas verts, aucune clé Test ne doit être remplacée par
une clé Live et aucun endpoint production ne doit être modifié.
