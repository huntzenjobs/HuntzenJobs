# Incident client — abonnement, double compte et facturation

**Statut :** contained — abonnement annulé, aucun prélèvement futur programmé
**Début de l'investigation :** 11 août 2026
**Périmètre :** Supabase production et Stripe Live en lecture seule
**Confidentialité :** aucun téléphone, email complet, secret ou identifiant Stripe complet n'est conservé dans ce document.

## Résumé exécutif

Le signalement est confirmé. La cliente possède deux comptes Supabase distincts créés avec Google. L'abonnement Stripe Pro est rattaché au compte le plus ancien ; le deuxième compte est resté Gratuit. L'abonnement Stripe n'a jamais été résilié et est actuellement `past_due`, avec une nouvelle tentative automatique annoncée par Stripe pour le 12 août 2026.

Deux paiements de 13,90 EUR ont réussi, le 10 juin et le 10 juillet. La tentative du 10 août a échoué. Aucun remboursement n'est présent.

La projection Supabase de la période payée est également incorrecte : après les renouvellements, `current_period_end` a été remplacé par l'heure du traitement du webhook au lieu de l'échéance Stripe. Le compte pouvait donc apparaître expiré ou perdre ses droits presque immédiatement malgré un paiement réussi.

## Identifiants internes masqués

| Objet | Empreinte | Rôle |
|---|---|---|
| Compte Supabase ancien | `ea7ead34cda9` | Compte portant l'abonnement Pro |
| Compte Supabase récent | `00230d50ef55` | Deuxième compte, plan Gratuit |
| Client Stripe | `65abdd7098a9` | Client Live lié au compte ancien |
| Abonnement Stripe | `e703dc8949d6` | Pro mensuel, actuellement `past_due` |

Les empreintes sont des hashes courts de corrélation, pas les identifiants réels.

## Chronologie confirmée

| Date UTC | Événement confirmé |
|---|---|
| 30 mai 2026 | Création du premier compte Google et abonnement local Gratuit. |
| 10 juin 2026 07:45 | Checkout Stripe lancé depuis le premier compte. |
| 10 juin 2026 07:51 | Paiement initial de 13,90 EUR réussi ; abonnement Pro créé. |
| 17 juin 2026 | Création d'un deuxième compte Google, resté Gratuit. |
| 29 juin 2026 | Le deuxième compte consulte le pricing et clique un CTA, sans création Stripe réussie observée. |
| 10 juillet 2026 07:51 | Renouvellement de 13,90 EUR payé. Supabase projette une mauvaise échéance située au moment du webhook. |
| 11 juillet 2026 | Les deux comptes consultent le pricing ; plusieurs clics CTA sont enregistrés. |
| 11 juillet 2026 | Une seule recherche d'emploi est comptabilisée sur le compte payant ; aucun autre usage quota significatif n'est enregistré. |
| 10 août 2026 07:51–08:51 | Nouveau cycle ; paiement de 13,90 EUR échoué, abonnement Stripe passé `past_due`. |
| 12 août 2026 15:51 | Prochaine tentative automatique actuellement planifiée par Stripe, si aucune action n'est prise. |

## État Supabase actuel

### Compte ancien

- Ligne Gratuit historique : `canceled` lors de la création du Pro.
- Ligne Pro : `past_due`.
- `cancel_at_period_end = false`.
- Aucun `canceled_at` sur le Pro.
- Période locale corrompue : début et fin projetés au même instant le 10 août.
- Aucun paiement présent dans `stripe_payments`, malgré deux factures Stripe payées.
- Aucun événement de résiliation dans `subscription_history` ou `user_events`.

### Compte récent

- Plan Gratuit actif.
- Aucun client, abonnement ou prix Stripe associé.
- Aucun paiement local.
- Plusieurs visites pricing, mais aucune session Stripe Live associée trouvée.

## État Stripe Live actuel

- Un seul Customer Stripe a été trouvé pour les deux identités correspondantes.
- Un seul abonnement : Pro mensuel, `past_due`.
- Aucune annulation programmée ou réalisée.
- Facture juin : 13,90 EUR, payée.
- Facture juillet : 13,90 EUR, payée.
- Facture août : 13,90 EUR, ouverte et impayée.
- Prochaine tentative automatique : 12 août 2026 à 15:51 UTC.
- Aucun remboursement trouvé.
- Un seul endpoint webhook Live est actif : route Railway canonique `/api/stripe/webhook`.

### Confirmation visuelle dans le Dashboard Stripe

La connexion au Dashboard Stripe Live a été vérifiée le 11 août 2026 en lecture seule. La page de l'abonnement confirme le statut impayé, les factures de juin et juillet payées, la facture d'août en nouvelle tentative, l'absence d'annulation et l'absence de remboursement. Elle affiche également une prochaine facture au 10 septembre si l'abonnement reste ouvert. Aucun taux de taxe n'est appliqué à cet abonnement et le panneau d'activité ne présente aucun log de requête associé.

## Webhooks et auditabilité

- Stripe possède des événements d'août liés à cet abonnement.
- `stripe_webhook_events` ne contient que deux événements datant du 23 mars pour l'ensemble du projet.
- Aucun événement récent lié à la cliente n'est marqué localement comme traité.
- Aucun `webhook_failure` correspondant n'est enregistré.
- L'événement `invoice.payment_failed` conserve actuellement un webhook en attente côté Stripe.
- L'ancien code de production continue lorsque la vérification ou le marquage d'idempotence échoue ; il peut donc modifier la projection puis ne conserver aucune preuve fiable.

## Cause racine

### Cause 1 — Abonnement lié au mauvais compte utilisé

**Certitude : élevée.** Le paiement est lié au compte ancien tandis que le compte recréé est Gratuit. Une résiliation tentée depuis le deuxième compte ne peut pas trouver l'abonnement du premier compte.

### Cause 2 — Projection de période incompatible avec la structure Stripe actuelle

**Certitude : élevée.** Le handler déployé lit `current_period_start/end` au niveau historique de Subscription. Quand ces valeurs ne sont pas présentes à cet endroit, il utilise l'heure courante comme fallback pour les deux bornes. Les historiques montrent exactement ce comportement en juillet et août.

Conséquence : le système peut considérer les droits comme expirés presque immédiatement après un paiement réussi.

### Cause 3 — Route de résiliation trop dépendante de l'état local

**Certitude : élevée.** La route cherche uniquement un abonnement local avec `status = active` appartenant au compte connecté. Elle échoue pour le deuxième compte Gratuit et échoue désormais aussi pour le compte Pro devenu `past_due`.

### Cause 4 — Webhooks fail-open et journal financier incomplet

**Certitude : élevée.** Les RPC d'idempotence ne produisent plus de trace récente, tandis que l'ancien handler avale leurs erreurs. Les paiements de juin et juillet sont absents de `stripe_payments`.

### Date de demande de résiliation

**Non confirmée.** Aucune annulation Stripe, aucun changement `cancel_at_period_end` et aucun événement local de résiliation ne sont présents. Il faut obtenir la date ou le message de demande pour décider si le paiement de juillet doit être qualifié de prélèvement post-résiliation. L'absence quasi totale d'usage et la perte probable de droits constituent néanmoins un motif commercial distinct à considérer.

## Risque immédiat

Risque contenu le 11 août 2026 à 22:51 CEST. L'abonnement Live a été annulé immédiatement après autorisation de Wissem. La facture d'août reste ouverte, mais Stripe a passé `auto_advance=false` et supprimé `next_payment_attempt` : aucun nouveau prélèvement automatique n'est programmé.

Selon la documentation Stripe actuelle, l'annulation immédiate de l'abonnement met les factures ouvertes en `auto_advance=false`, ce qui suspend leur recouvrement automatique. Cette action est terminale et nécessite une autorisation explicite.

## Action de production exécutée

- Autorisation reçue : annulation immédiate de l'abonnement Stripe Live.
- Abonnement passé de `past_due` à `canceled`.
- Facture d'août conservée ouverte, avec recouvrement automatique désactivé et aucune prochaine tentative.
- Aucun remboursement créé, conformément à la décision de Wissem.
- Projection Supabase relue après webhook : une ligne correspondante, statut `canceled` et date d'annulation présente.
- Aucun compte Supabase supprimé ou fusionné.

## Actions proposées à Wissem

### Containment recommandé

1. Autoriser l'annulation immédiate de l'abonnement Stripe Live.
2. Vérifier ensuite que l'abonnement est `canceled` et que la facture d'août ne possède plus de tentative automatique.
3. Laisser le deuxième compte Gratuit intact ; ne supprimer aucun compte pendant l'investigation.
4. Réconcilier ensuite la projection Supabase de manière contrôlée si le webhook de suppression ne le fait pas correctement.

### Remboursement

- Obtenir la date de demande de résiliation transmise au support.
- Si elle précède le 10 juillet, proposer le remboursement de la facture de juillet.
- Même sans preuve antérieure au 10 juillet, évaluer un remboursement commercial de juillet car la période locale était invalide et l'usage enregistré est presque nul.
- Ne rembourser aucune facture avant validation du montant et du motif par Wissem/Leonel.

### Comptes

- Ne pas fusionner physiquement ni supprimer maintenant.
- Choisir avec la cliente l'identité à conserver.
- Après stabilisation, rattacher les données/droits nécessaires via une procédure auditée et désactiver l'autre identité seulement après révocation de ses sessions.

## Correctifs systémiques déjà préparés localement, non déployés

- Extraction compatible des périodes Stripe.
- Claim/finalisation atomiques des événements webhook.
- Token de propriété et reprise contrôlée.
- Projection + outbox transactionnelles.
- Déduplication des Checkout Sessions et effets externes.
- Garde sur mises à jour locales à zéro ligne.
- Scripts de réconciliation Stripe et nettoyage Checkout legacy.

Ces correctifs doivent encore être appliqués et testés sur une base staging réelle avant production.

## Preuves de non-régression locales

Le 11 août 2026, 99 tests Stripe, recruteur, promotions et réconciliation ont réussi. Les tests qui reproduisent directement les mécanismes de l'incident vérifient notamment que :

- le compte Gratuit secondaire ne peut jamais modifier l'abonnement Stripe de l'autre compte ;
- un abonnement `past_due` reste résiliable par son propriétaire ;
- une période Stripe au format Clover est extraite depuis les lignes d'abonnement et ne retombe pas sur une échéance égale à l'heure du webhook ;
- une facture payée ancienne ne réactive pas un abonnement déjà annulé ;
- un impayé et une suppression sans projection locale ne sont pas finalisés silencieusement.

Ruff a également validé tous les fichiers Python modifiés du lot. La validation PostgreSQL réelle reste obligatoire sur staging avant déploiement.

## Messages proposés

### Pour Leonel

> L'incident a été vérifié. La cliente avait créé deux comptes HuntZen, mais un seul portait l'abonnement payant. L'abonnement n'avait pas été résilié dans Stripe. Il est maintenant annulé, aucune nouvelle tentative automatique n'est programmée et aucun remboursement n'a été effectué pour l'instant. Les correctifs généraux sont en cours de validation avant déploiement afin d'empêcher la perte de droits et de fiabiliser les résiliations.

### Pour la cliente

> Bonjour, nous avons vérifié votre situation. Deux comptes HuntZen distincts existaient, tandis que l'abonnement était rattaché uniquement au compte le plus ancien. Nous avons annulé cet abonnement et aucune nouvelle tentative automatique de paiement n'est programmée. Aucun remboursement n'a été lancé pour le moment. Nous vous contacterons séparément pour confirmer le compte que vous souhaitez conserver, sans supprimer vos données entre-temps. Nous sommes désolés pour cette expérience.

## Critères de résolution de l'incident

- [x] Abonnement Stripe annulé ou autre décision explicitement validée.
- [x] Aucune tentative de paiement future active.
- [x] Décision documentée sur la facture de juillet : aucun remboursement pour l'instant.
- [ ] Remboursement vérifié si autorisé.
- [ ] Compte que la cliente doit utiliser clairement identifié.
- [x] Projection Supabase cohérente avec Stripe.
- [x] Test de non-régression reproduisant double compte + résiliation.
- [x] Tests Stripe ciblés verts.
- [x] Message non technique préparé pour Leonel et la cliente.
