# Audit Supabase production — HuntZen

Date : 2026-08-11
Projet : `HuntZen` (`ngiakfikbuyugqfqtfwp`)
Organisation : `huntzenIAOrg` — plan Pro
Branche : `main` — Production

## Verdict

**NO-GO facturation, migrations directes en production et lancement des publicités.**

La production est disponible et Google OAuth fonctionne, mais l'audit PostgreSQL en lecture seule a confirmé plusieurs expositions actives de données et de fonctions privilégiées. Elles doivent être corrigées d'abord sur une préproduction isolée, puis déployées en production par migration contrôlée. Aucune modification n'a été appliquée à la production pendant cet audit.

### Incident sécurité confirmé le 11 août

Un test catalogue exécuté dans une transaction `READ ONLY`, avec le rôle réel `anon`, confirme qu'un visiteur non connecté peut actuellement interroger :

- 3 lignes de `stripe_payments`, incluant des identifiants Stripe, des montants et un `raw_invoice` JSONB ;
- 2 lignes de `recruiter_cache`, incluant des données recruteur JSONB ;
- 783 lignes de `user_subscription_unified`, incluant `user_id`, plan, statut et identifiants Stripe ;
- 15 lignes anonymes de `cv_analyses`, dont le schéma contient URL, texte complet du CV, résultat d'analyse, nom de fichier et IP client.

Le contenu des lignes n'a pas été lu ni exporté. Seuls les comptes et les métadonnées de schéma ont été contrôlés.

## 1. Environnements et migrations

- Un seul projet Supabase existe dans l'organisation.
- Aucune branche persistante de staging et aucune branche preview.
- Aucun dépôt GitHub connecté à Supabase.
- Historique distant : 98 migrations ; dernière migration appliquée `20260325000002_contact_finder_cache`.
- Dépôt local de stabilisation : 111 fichiers SQL ; les migrations postérieures au 25 mars ne sont pas en production.
- Les migrations Stripe `20260810000001` et `20260810000002` ne sont pas appliquées en production.
- Incohérence locale : `20260325000001_contact_finder_cache.sql` et `20260325000002_contact_finder_cache.sql` sont des doublons byte-for-byte. La version `20260325000001` entre aussi en collision avec `atomic_referral_rewards`.
- Incohérence historique : la production enregistre `20260323000003_fix_coach_config_accents_translations`, tandis que le dépôt contient `20260323000003_per_coach_message_quota.sql`.
- La connexion PostgreSQL de production transmise pour l'audit a été vérifiée avec succès via le pooler Supabase. Toutes les requêtes de cet audit ont été forcées en lecture seule.
- Le secret de connexion ayant été transmis dans une conversation, le mot de passe PostgreSQL doit être renouvelé après l'audit et les variables Railway/Vercel correspondantes mises à jour de façon coordonnée.

### Préproduction recommandée

- Créer une **branche Supabase persistante** `staging`, dédiée aux tests.
- Coût affiché par Supabase : `0,01344 $/h`, soit environ `9,81 $/mois` hors egress/stockage/taxes.
- La branche est un environnement Supabase séparé avec ses propres clés et services.
- Les branches sont data-less : ne pas copier les utilisateurs, CV, paiements ou autres données personnelles de production.
- Ajouter uniquement des données de test synthétiques et des comptes Stripe Test.

## 2. RLS et Data API

### Inventaire production

- 47 tables publiques détectées.
- 45 tables avec RLS activée.
- 2 tables exposées sans RLS :
  - `public.stripe_payments`
  - `public.recruiter_cache`
- 114 politiques visibles dans le Dashboard.
- 7 tables sans politique :
  - `admin_notes` — RLS activée
  - `contact_finder_cache` — RLS activée
  - `email_blacklist` — RLS activée
  - `expat_chunks` — RLS activée
  - `expat_documents` — RLS activée
  - `recruiter_cache` — RLS désactivée
  - `stripe_payments` — RLS désactivée

Les cinq tables avec RLS et zéro politique refusent actuellement les lignes via RLS, mais conservent des droits SQL très larges. Les deux tables sans RLS sont réellement exposées en lecture/écriture via la Data API.

### ACL et privilèges réels

- Les privilèges par défaut du schéma `public` accordent à `anon` et `authenticated` tous les droits de table, séquence et exécution de fonction.
- Les 51 tables/vues publiques visibles accordent notamment `SELECT`, `INSERT`, `UPDATE`, `DELETE` et même `TRUNCATE` aux deux rôles. La RLS limite une partie de ces droits, mais toute table sans RLS devient immédiatement exposée.
- `anon` possède bien le privilège de mise à jour sur `user_subscriptions.plan_id` et `user_subscriptions.status`.
- La politique `Users can update own subscriptions` vérifie seulement `user_id`. Un utilisateur connecté peut donc falsifier son propre plan, son statut et ses identifiants Stripe.
- `usage_quotas` accorde aussi aux utilisateurs l'UPDATE de leurs propres compteurs : un utilisateur peut remettre ses usages à zéro ou augmenter artificiellement ses quotas.
- Les politiques `cv_analyses` considèrent toute ligne avec `user_id IS NULL` et `anonymous_id IS NOT NULL` comme lisible/modifiable par tout rôle anonyme, sans lier `anonymous_id` au client courant.

Ces trois chemins constituent des bloqueurs d'autorisation et de facturation.

### Exposition Data API

- Schémas exposés : `public` et `graphql_public`.
- 51/51 tables exposées.
- 168/168 fonctions exposées.
- L'exposition automatique des nouvelles tables est activée.
- Limite PostgREST : 1000 lignes.

**Risque :** toute nouvelle table ou fonction publique peut devenir accessible à `anon`/`authenticated` par défaut. La cible est de désactiver l'auto-exposition, révoquer les objets internes et, à terme, exposer un schéma API dédié minimal.

### Advisors sécurité

- 3 erreurs critiques :
  - vue `public.user_subscription_unified` en mode SECURITY DEFINER ;
  - RLS absente sur `stripe_payments` ;
  - RLS absente sur `recruiter_cache`.
- 183 warnings, majoritairement des fonctions au `search_path` mutable.
- Exemples : `extend_subscription_days`, `apply_quota_bonus`, `insert_tier_reward`, `cleanup_old_records`, fonctions de triggers `updated_at`.
- Catégories exactes visibles : `Function Search Path Mutable`, `Extension in Public`, `Auth OTP Long Expiry`, `Leaked Password Protection Disabled`, `Public Bucket Allows Listing`, `Public Can Execute SECURITY DEFINER Function`, `Signed-In Users Can Execute SECURITY DEFINER Function`.
- Le catalogue contient 63 fonctions `SECURITY DEFINER` ; les 63 sont exécutables par `anon` et `authenticated`.
- 33 de ces fonctions contiennent des mutations SQL. Parmi elles : `apply_quota_bonus`, les deux signatures de `extend_subscription_days`, `update_subscription_tier`, `update_stripe_price`, `increment_usage`, `reset_quotas_rpc`, `mark_webhook_event_processed`, `insert_tier_reward` et plusieurs fonctions de purge.
- Pour ces 33 fonctions mutantes, l'audit statique n'a détecté aucun contrôle `auth.uid()` sauf deux fonctions sans rapport avec la facturation. Les RPC acceptant un UUID arbitraire peuvent donc contourner RLS avec les droits du propriétaire.
- 171 fonctions publiques n'imposent aucun `search_path` fixe dans le catalogue.
- La base historique contient beaucoup de fonctions `SECURITY DEFINER`; toutes doivent être revues pour :
  - `search_path = ''` et objets qualifiés ;
  - `REVOKE ... FROM PUBLIC, anon, authenticated` ;
  - `GRANT` minimal au seul rôle réellement nécessaire ;
  - contrôle de l'identité dans la fonction lorsque l'appel utilisateur est attendu.

## 3. Storage

Six buckets sont présents :

| Bucket | Public | Limite | MIME |
|---|---:|---:|---|
| `support-attachments` | non | 50 MB | tout type |
| `cvs-adaptes` | non | 10 MB | PDF |
| `lettres-motivation` | non | 10 MB | PDF |
| `cv-uploads` | non | 15 MB | PDF/DOCX |
| `avatars` | oui | 2 MB | JPEG/PNG/WebP |
| `cvs` | **oui** | 10 MB | PDF |

### Bloqueur confidentialité

Le bucket `cvs` est public et possède des politiques destinées à `public`, dont upload et lecture anonymes. Des CV contiennent des données personnelles ; ils ne doivent pas être servis par une URL publique.

La politique anonyme de lecture porte sur tout objet du dossier `anonymous` sans preuve de possession. Elle recoupe l'exposition des 15 analyses anonymes constatée dans `cv_analyses`.

Inventaire sans lecture de fichier : le bucket `cvs` contient 544 objets, dont 6 sous le préfixe `anonymous`. Comme le bucket est marqué public, toute URL d'objet connue est téléchargeable sans authentification ; la confidentialité ne peut pas reposer sur l'imprévisibilité du chemin.

Corrections staging obligatoires :

- rendre `cvs` privé ;
- supprimer les politiques anonymes historiques ;
- utiliser des chemins par `user_id` et des URLs signées courtes ;
- vérifier que SELECT/INSERT/UPDATE/DELETE sont limités au propriétaire ;
- migrer les fichiers existants sans casser les URLs ;
- limiter `support-attachments` à une liste MIME et une taille métier raisonnable ;
- mettre en place une sauvegarde externe des objets Storage, car les backups DB ne sauvegardent pas les fichiers.

## 4. Auth, Google OAuth et domaine

### État validé

- Inscriptions activées.
- Confirmation email activée.
- Connexions anonymes désactivées.
- Google OAuth activé.
- Test réel réussi le 11 août : clic sur « Continuer avec Google », création/échange de session et redirection vers HuntZen sans erreur.
- Site URL : `https://www.huntzenjobs.com`.
- SMTP personnalisé Resend activé avec expéditeur `contact@huntzenjobs.com` / `HuntZenJobs`.
- TOTP MFA activé ; durée AAL1 limitée à 15 minutes.
- Access token : 3600 secondes.
- Détection de réutilisation des refresh tokens activée, fenêtre 10 secondes.

### Domaine OAuth

Le callback Google reste sur le domaine technique `*.supabase.co`. Aucun Custom Domain n'est activé. Supabase facture cette option **10 $/mois**.

Cible recommandée : `auth.huntzenjobs.com` ou `api.huntzenjobs.com`, puis ajout du nouveau callback dans Google Auth Platform avant activation. Il faut aussi vérifier le branding Google (nom, logo, domaine vérifié).

### Redirect URLs à nettoyer

La production autorise actuellement :

- les callbacks `www.huntzenjobs.com` et `huntzenjobs.com` ;
- des wildcards sur les deux domaines ;
- deux anciennes URLs Vercel de preview ;
- `http://localhost:3000/`.

Les URLs preview et localhost doivent quitter la production après création de staging. Les wildcards doivent être réduits aux routes réellement nécessaires.

### Paramètres Auth insuffisants

- OTP email : 86400 secondes (24 h), au-dessus de la recommandation de moins d'une heure.
- Mot de passe minimal : 6 caractères.
- Aucune exigence de complexité.
- Protection contre mots de passe compromis désactivée.
- Changement sécurisé de mot de passe désactivé.
- Mot de passe courant non requis pour une modification.
- CAPTCHA désactivé.
- Notifications de sécurité par email désactivées : changement de mot de passe/email, liaison ou suppression d'une méthode, ajout/suppression MFA.
- Sessions non limitées dans le temps et sans timeout d'inactivité ; session unique désactivée.

À valider en staging avant durcissement pour éviter de bloquer les utilisateurs existants.

## 5. Base, réseau, sauvegardes et versions

- Postgres `17.6.1.063`; mise à jour `17.6.1.155` disponible.
- Auth `2.195.0`; PostgREST `14.1`.
- SSL entrant non forcé.
- Base accessible depuis toutes les adresses IP.
- Pool DB configuré à 30 connexions ; maximum client Micro : 200.
- Instance Micro : 1 Go RAM, CPU partagé ; elle ne constitue pas à elle seule une preuve de capacité à 5 000 utilisateurs simultanés.
- Consommation observée : mémoire ~45 %, CPU ~8 %, disque ~4 %.
- Sauvegardes physiques quotidiennes disponibles, mais les 7 et 10 août n'apparaissent pas dans la liste observée.
- PITR non activé.
- Les objets Storage ne sont pas inclus dans les sauvegardes DB.
- Aucun Edge Function déployé.
- Realtime actif sur `user_events` et `user_notifications`.
- État instantané PostgreSQL : 19 connexions, 2 actives, 15 idle, aucune transaction abandonnée ; aucune contrainte non validée et aucun index public invalide.
- L'extension `vector` est installée dans `public`, ce qui explique l'avertissement `Extension in Public`.

Corrections : forcer SSL après vérification des clients, définir une stratégie de restriction réseau compatible Railway, tester une restauration, investiguer les sauvegardes manquantes et prévoir un backup Storage.

## 6. Logs et performance

- Fenêtre observée : 0 réponse 5xx, 8 réponses 4xx, 25 réponses 2xx.
- Les 404 observés concernent l'endpoint Dashboard des Custom OAuth Providers désactivés ; ils ont été déclenchés pendant l'audit et ne prouvent pas une panne utilisateur.
- Performance Advisor : 0 erreur, 141 warnings, 46 suggestions.
- Les warnings visibles concernent surtout la réévaluation de `auth.uid()`/`current_setting()` par ligne dans les politiques RLS. Utiliser `(select auth.uid())` lorsque la sémantique est identique.
- Clés étrangères non indexées visibles sur : `admin_notes`, `ai_prompts`, `expat_chunks`, `referral_rewards`, `stress_test_runs`, `subscription_history`, `user_applications` (deux contraintes), `user_feature_overrides`, `user_promo_codes`, `user_subscriptions`.
- Plusieurs index sont signalés inutilisés ; ne pas les supprimer avant d'avoir vérifié la durée de collecte et les requêtes réelles.
- Index Advisor non activé.

## 7. Ordre de correction contrôlé

1. Contenir l'incident par une migration d'urgence testée : activer RLS sur `stripe_payments` et `recruiter_cache`, révoquer leurs ACL publiques, sécuriser ou retirer `user_subscription_unified`, bloquer l'UPDATE client des abonnements/quotas et corriger l'isolation des CV anonymes.
2. Révoquer immédiatement l'exécution publique des 33 RPC mutantes ; classer les 30 RPC de lecture par audience et ajouter des contrôles d'identité aux rares RPC destinées au client.
3. Remplacer les privilèges par défaut de `public` par une liste blanche et figer les `search_path`.
4. Obtenir l'accord de coût et créer la branche persistante `staging`.
5. Résoudre les collisions/dérives de versions de migrations localement.
6. Appliquer sur staging la migration de durcissement, puis les migrations Stripe manquantes.
7. Rendre le stockage CV privé et tester toutes les fonctionnalités CV/documents.
8. Durcir Auth : OTP, mots de passe, CAPTCHA, alertes de sécurité et redirects.
9. Configurer Google OAuth staging et tester nouveau compte, compte existant, callback, logout et récupération.
10. Configurer Stripe Test, Railway staging, Redis/ARQ staging et Sentry `environment=staging`.
11. Rejouer les webhooks Stripe et tous les scénarios abonnement.
12. Lancer Advisors, tests RLS `anon`/`authenticated`/`service_role`, réconciliation Stripe et tests E2E.
13. Exiger : 0 erreur Security Advisor, 0 donnée de paiement/abonnement/CV accessible à `anon`, 0 CV public, 0 effet Stripe dead-letter et 0 divergence de projection avant Go facturation.

### Rollback attendu

La migration de sécurité doit être transactionnelle et accompagnée d'un script de rollback explicite. Le rollback ne doit jamais réouvrir les données à `anon` : en cas de régression applicative, il restaure uniquement les accès `service_role` nécessaires et conserve RLS/ACL fermées jusqu'à diagnostic.

## Décisions nécessitant accord

1. Branche Supabase staging persistante : environ 10 $/mois plus usage.
2. Custom Domain Supabase : 10 $/mois.
3. PITR : add-on payant, prix affiché par Supabase à partir de 100 $/mois.
