# Validation sécurité Supabase staging

**Date :** 12 août 2026
**Projet staging :** branche persistante sans données de production
**Mode :** catalogue PostgreSQL en lecture seule

## Résultat actuel

Le durcissement SQL du lot est effectif sur la base staging. Le bucket historique `cvs` est désormais privé, les policies anonymes ont été supprimées et le code candidat utilise une URL signée de dix minutes pour Modal. La décision reste **NO-GO intégration CV** tant que cette version candidate n'est pas publiée sur le backend staging et testée avec une application Modal staging isolée.

## Contrôles verts

- PostgreSQL staging : `17.6`.
- Utilisateurs staging : zéro donnée utilisateur de production.
- Tables publiques sans RLS : `0`.
- Fonctions `SECURITY DEFINER` exécutables par `anon` : `0`.
- `stripe_payments`, `recruiter_cache` et `user_sessions` ne sont pas sélectionnables par `anon` et ont la RLS active.
- `user_subscriptions`, `usage_quotas` et `profiles` ne possèdent plus aucun privilège de table pour `anon`.
- `authenticated` ne peut plus muter `user_subscriptions` ni `usage_quotas`; sur `profiles`, seules les six colonnes d'interface non privilégiées restent modifiables.
- `is_admin(uuid)` : refusée à `anon`, autorisée à `authenticated` et `service_role`; l'implémentation lie l'appel utilisateur à `auth.uid()`.
- `log_security_event(...)` : refusée à `anon`, autorisée à `authenticated` et `service_role`; l'identité et les événements navigateur sont bornés.
- Les migrations de durcissement Stripe, maintenance, cache et journal sécurité sont présentes sur staging.
- La migration forward `20260812071945_fix_remaining_postgres_lint_warnings.sql` corrige les quatre derniers avertissements legacy sans modifier les signatures publiques utilisées par le backend.
- `supabase db lint --level warning` ne remonte désormais aucune erreur ni aucun avertissement sur staging.
- Les migrations forward `20260812030000` et `20260812030001` ont été appliquées sur staging après deux tests d'intégration rouges, puis quatre tests ACL verts.
- La matrice HTTP réelle crée deux identités synthétiques et vérifie : aucune lecture croisée A/B, refus des champs profil privilégiés, mise à jour d'un champ autorisé, refus `anon`, upload/lecture/suppression CV par le propriétaire et refus autre utilisateur/anon.
- Les 7 tests d'intégration staging sont verts et leur nettoyage laisse zéro utilisateur et zéro objet CV synthétique.
- La suppression administrative d'un compte, initialement bloquée par le trigger `subscription_history`, est corrigée par `20260812030002`; la policy profil récursive `42P17` est corrigée par `20260812030003`.
- Le parcours Google OAuth staging est opérationnel. La migration `20260812025700_remove_duplicate_auth_signup_trigger.sql` supprime le trigger legacy non privilégié ; le catalogue ne contient plus que `on_auth_user_created`, et l'inscription crée une seule projection cohérente profil/abonnement/quota.

## Bloqueur restant

Le catalogue Storage réel indique encore :

| Bucket | Public | Décision |
|---|---:|---|
| `avatars` | oui | attendu pour les avatars publics |
| `cvs` | non | corrigé sur staging par migrations forward |
| `cvs-adaptes` | non | conforme |
| `lettres-motivation` | non | conforme |
| `support-attachments` | non | conforme, MIME à borner |

Le backend candidat conserve maintenant le chemin privé en base et ne transmet à Modal qu'une URL signée courte. Les tests unitaires prouvent qu'aucune URL publique n'est produite et que le statut d'analyse exige un propriétaire authentifié. La suite de validation reste :

1. publier le code candidat sur la branche distante de préproduction ;
2. valider Storage avec propriétaire, autre utilisateur et anon ;
3. déployer une application Modal staging isolée ;
4. valider upload, analyse, polling et historique avec compte synthétique ;
5. seulement ensuite préparer le déploiement production.

## Autres validations à terminer

- Tester `anon`, utilisateur A, utilisateur B, admin et `service_role` sur chaque table/Storage sensible avec des comptes synthétiques.
- Comparer les Security/Performance Advisors avant et après.
- Ajouter un compte synthétique admin à la matrice complète et tester les autres buckets privés (`cvs-adaptes`, lettres, support).
- Régénérer les types après la migration Storage finale.
- Tester un rollback forward qui ne rouvre jamais les données à `anon`.

## Décision

**NO-GO production** tant que le parcours CV signé n'a pas été exécuté de bout en bout sur Modal staging. Le bloqueur `cvs public`, l'accès anonyme aux analyses et l'ownership Storage A/B sont fermés sur PostgreSQL staging réel.

Le lint PostgreSQL staging ne remonte aucune erreur ni aucun avertissement. Le passage en production reste interdit tant que les validations applicatives et opérationnelles listées ci-dessus ne sont pas vertes sur la même révision candidate.
