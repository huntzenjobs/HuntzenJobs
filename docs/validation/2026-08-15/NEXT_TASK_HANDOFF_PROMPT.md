# Prompt de passation — HuntZen Launch Readiness

Copier intégralement le bloc ci-dessous dans une nouvelle tâche Codex ouverte sur le projet HuntZen.

---

Tu reprends un chantier critique HuntZen déjà largement analysé et implémenté. Ne recommence pas une cartographie générale du dépôt et ne repars surtout pas de `main`. Reprends exactement l'état de travail existant et continue depuis les preuves enregistrées.

## 1. Emplacement et état Git obligatoires

- Worktree exact : `/Users/wissem/HuntzenIA/huntzen_jobsearch/.worktrees/codex-stripe-stabilization`
- Branche : `codex/stripe-stabilization`
- Commit de base observé : `3f2c297`
- Plus de 100 chemins sont actuellement modifiés, supprimés ou non suivis. Ils représentent un lot de stabilisation multi-services important ; le nombre exact peut évoluer avec les preuves ajoutées.
- Ne lance jamais `git reset`, `git checkout --`, nettoyage récursif, suppression de worktree ou autre commande destructive.
- Préserve tous les changements existants. Vérifie `git status --short --branch`, mais ne refais pas leur investigation depuis zéro : utilise les documents de preuve indiqués ci-dessous.
- Lis entièrement `AGENTS.md` avant toute action. Le projet réel prévaut si une ancienne description le contredit.
- Pour committer, utilise exclusivement le skill personnel `$commit`, namespace `commit-commands:commit`, fourni par `commit-commands@personal`. Aucun commit Git manuel et aucune PR créée directement.
- Ne committe jamais sur `main`. N'ajoute aucune attribution d'auteur automatique. Ne contourne jamais les hooks.

## 2. Mission générale

Rendre HuntZen réellement prêt pour les publicités sans nouvelle réclamation critique : inscription et Google OAuth, connexion/récupération, abonnements, droits, quotas, résiliation/réactivation, paiements et impayés, i18n États-Unis, UI/UX, support, GTM avec consentement, observabilité, staging reproductible et capacité mesurée.

L'ordre validé est « incident-first » :

1. facturation, abonnements et résiliations ;
2. connexion, création de compte et récupération du mot de passe ;
3. langue automatique aux États-Unis et traductions ;
4. fonctionnalités payantes et quotas ;
5. UI/UX mobile et desktop ;
6. support et alertes administratives ;
7. GTM et tracking publicitaire ;
8. tests complets puis tests de charge ;
9. audit final Go/No-Go avant publicités.

La promesse « zéro bug » n'est jamais à affirmer. La décision doit être fondée sur des preuves fraîches. La décision actuelle est **NO-GO production/publicités**, avec poursuite technique autorisée sur staging.

## 3. Architecture et stack connues

- Produit : SaaS HuntZen, assistant IA de recherche d'emploi.
- Frontend : `frontend-next/`, Next.js 14 App Router, TypeScript, Tailwind, Shadcn/Radix, Supabase SSR, React Query/SWR/Zustand, Vitest et Playwright.
- Backend réel : `backend/`, FastAPI Python 3.11, Pydantic, LangChain + Groq, aucun LangGraph, ARQ/Redis, SlowAPI, Sentry.
- Base/Auth/Storage : Supabase PostgreSQL 17, migrations SQL versionnées, RLS/ACL strictes.
- Paiement : Stripe Checkout/Subscriptions, webhooks signés, projection `user_subscriptions`, ledger `stripe_payments`, claim atomique et outbox d'effets.
- Hébergement : frontend Vercel, backend/worker Railway, Redis staging dédié, Modal pour les traitements CV/PDF.
- Email : Resend, avec barrière staging redirigeant tous les destinataires vers `delivered@resend.dev` et supprimant `cc`/`bcc`.
- Monitoring : Sentry production et projet staging séparé.
- i18n : `fr`, `en`, `es`, `pt`. Les visiteurs des États-Unis doivent obtenir l'anglais automatiquement ; fallback neutre anglais.
- Modèles Groq candidats : `FAST_MODEL=openai/gpt-oss-20b`, `PRIMARY_MODEL=openai/gpt-oss-120b`. Ne réintroduis pas les anciens modèles retirés.
- Docling reste strictement `2.70.0`.
- Source de vérité abonnement : `user_subscriptions`, jamais les champs dépréciés `profiles.subscription_*`.

Avant de créer une UI, un hook, un endpoint ou une table, consulte `docs/audit/MAP.md` et cherche l'existant avec `rg`. Étends l'existant au lieu de créer un doublon.

## 4. Documents faisant foi

Lis ces fichiers avant d'agir, sans refaire leur enquête complète :

1. `docs/superpowers/plans/2026-08-11-huntzen-launch-readiness-master.md` — grande todo et journal d'exécution.
2. `docs/validation/2026-08-15/FINAL_GO_NO_GO.md` — verdict actuel et gates.
3. `docs/validation/2026-08-15/staging-inventory.md` — état Supabase, Railway, Vercel, Stripe, Redis, Sentry, Resend, Modal et domaines.
4. `docs/validation/2026-08-15/stripe-go-no-go.md` — facturation et campagne restant à exécuter.
5. `docs/validation/2026-08-15/supabase-security.md` — RLS, ACL, Auth et Storage.
6. `docs/validation/2026-08-15/load-test.md` et les trois JSON k6 — capacité mesurée.
7. `docs/incidents/2026-08-client-billing-incident.md` — incident cliente, causes et containment.
8. Les autres preuves du même dossier : i18n, GTM, Sentry, Modal, email et inventaires.

Certaines lignes anciennes de l'inventaire contiennent des compteurs antérieurs. Les résultats frais à retenir sont ceux de la section suivante.

## 5. Incident cliente déjà traité

- Deux comptes Supabase Google distincts existaient ; un seul portait l'abonnement Pro Stripe.
- Le deuxième compte était Gratuit et ne pouvait pas retrouver/résilier l'abonnement de l'ancien compte.
- Deux paiements de 13,90 EUR avaient réussi en juin et juillet ; la tentative d'août avait échoué.
- La projection locale des périodes Stripe était corrompue et pouvait supprimer les droits presque immédiatement après paiement.
- Après autorisation explicite de Wissem, l'unique abonnement Stripe Live a été annulé immédiatement.
- La facture d'août est restée ouverte mais son recouvrement automatique a été désactivé ; aucune future tentative n'est programmée.
- Aucun remboursement n'a été effectué, conformément à la décision de Wissem.
- Aucun compte n'a été supprimé ou fusionné.
- Ne touche plus à ce dossier Live sans nouvelle autorisation explicite. La date de demande de résiliation reste nécessaire avant toute décision de remboursement commercial.

## 6. Correctifs systémiques déjà présents dans le worktree

Ne réécris pas ces mécanismes sans preuve d'un défaut nouveau :

- extraction des périodes Stripe compatible Clover ;
- webhooks fail-closed avec vérification de signature ;
- claim atomique `processing/processed/failed`, token de fencing, lease, reprise et dead-letter ;
- suppression du payload Stripe complet/PII du journal ;
- projection abonnement + outbox transactionnelles ;
- idempotence des Checkout Sessions, snapshots immuables session/token/prix/plan ;
- prévention des doubles paiements abonnement et recruteur ;
- gestion des replays après effets partiels ;
- gardes sur les updates Supabase à zéro ligne ;
- transitions idempotentes sur `invoice.paid`, `payment_failed`, `subscription.deleted` ;
- outbox Resend avec clés idempotentes ; dépendance Resend relevée à une version compatible ;
- récompenses referral et promos durables/idempotentes ; extensions `trial_end` monotones et protégées par lease ;
- scripts de réconciliation abonnements et de nettoyage des Checkout legacy ;
- route de résiliation scoped par propriétaire et compatible `past_due` ;
- ownership renforcé sur les paiements recruteur ;
- emails et HTML recruteur durcis ;
- ACL des RPC `SECURITY DEFINER`, search path vide et service role seulement lorsqu'approprié ;
- RLS/ACL sur tables sensibles, y compris abonnements, quotas, paiements, sessions et caches ;
- bucket CV privé et URLs signées courtes pour Modal ;
- Google OAuth staging réparé après suppression du trigger d'inscription legacy dupliqué ;
- domaine Supabase production `auth.huntzenjobs.com` activé et Google OAuth réel validé ;
- domaine Vercel staging `staging.huntzenjobs.com` avec TLS valide ;
- détection automatique anglais pour visiteurs américains ;
- Google Tag Manager `GTM-N9VT3999` intégré sur toutes les pages mais bloqué avant consentement explicite ;
- Sentry staging séparé et masquage Replay ;
- barrière email non-production ;
- configuration ESLint structurellement réparée en supprimant le fichier flat-config ESLint 9 incompatible avec Next.js 14/ESLint 8.

## 7. Supabase staging — état exact

- Production : projet `ngiakfikbuyugqfqtfwp`. Ne jamais appliquer une migration en production sans snapshot, plan, risques, rollback et autorisation explicite.
- Staging : branche persistante séparée, sans copie des données utilisateur de production.
- 124 migrations sont alignées entre le dépôt et staging.
- La migration la plus récente du lot est `20260812071945_fix_remaining_postgres_lint_warnings.sql`.
- Elle corrige les quatre derniers avertissements sur `check_coach_message_quota`, `log_webhook_failure`, `can_user_perform_action` et `generate_referral_code`, en conservant les signatures et ACL nécessaires.
- `supabase db lint --level warning` a retourné zéro erreur et zéro avertissement sur staging après application.
- Les tests catalogue ont confirmé zéro table publique sans RLS et zéro fonction `SECURITY DEFINER` exécutable par `anon`.
- Le runtime de branche est `ACTIVE_HEALTHY` et la base fonctionne.
- Le statut administratif Dashboard reste `MIGRATIONS_FAILED` malgré un registre aligné et les tentatives d'override avec les CLI 2.84.2 et 2.113.0.
- Ne prétends pas que ce drapeau est réparé. La solution durable probable est une recréation contrôlée de staging, mais ne supprime jamais la branche actuelle avant : inventaire complet des variables/URLs/keys, publication du candidat, plan de bascule Vercel/Railway/Stripe, tests de la nouvelle branche et rollback.
- Une URL PostgreSQL de production a été partagée historiquement dans la conversation. Ne l'affiche jamais, ne la recopie dans aucun document et considère le mot de passe comme sensible ; vérifier sa rotation séparément avant clôture sécurité.

## 8. Tests déjà exécutés et résultats frais

- Frontend : `292 passed` dans 28 fichiers Vitest.
- TypeScript : `npx tsc --noEmit` vert.
- ESLint : `npx eslint . --quiet` vert ; exécution complète avec 0 erreur et 102 warnings historiques non bloquants à réduire progressivement.
- Stripe/recruteur/promo/réconciliation/email : 101 tests unitaires ciblés verts.
- PostgreSQL Stripe réel : 3 tests d'intégration verts lors de l'exécution avec la connexion staging : concurrence webhook, fencing token, retry/dead-letter outbox et refus `anon/authenticated` avec succès `service_role`. Une relance sans URL staging les ignore ; ne confonds pas un skip d'environnement avec une régression.
- Ruff ciblé du lot Stripe : vert.
- `git diff --check` : vert.
- Modal/CV : 11 tests ciblés verts.
- Build Next.js : déjà réussi dans l'environnement staging, mais doit être rejoué sur la révision commitée exacte.
- Lint PostgreSQL staging : zéro warning.
- Le workflow CI global historique n'est pas encore une preuve fiable : ancien arbre de tests backend, Python système, avertissements et commandes masquées restent à corriger dans la Task 12.
- Dette connue : 43 vulnérabilités npm observées au build, dont 4 critiques. Auditer sans mise à jour majeure aveugle.

## 9. Test de charge déjà effectué

Le harness sûr est `tests/load/staging_public_smoke.js`. Il exige le host staging exact et refuse explicitement la production.

Résultats uniquement sur l'ancien backend Railway staging et `GET /api/health/ping` :

- 10 VU, 15 s : 668 requêtes, 43,88 RPS, 0 erreur, p95 32,77 ms — vert.
- 50 VU, 15 s : 2 196 requêtes, 144,26 RPS, 1,09 % de timeouts — rouge.
- 100 VU : 3 533 requêtes, 200,62 RPS, p95 4,66 s — rouge.
- 250/500 VU non lancés car le seuil d'arrêt était déjà franchi.
- Retour nominal confirmé ensuite sur le health endpoint et outbox vide.

Ne garantis jamais 5 000 utilisateurs simultanés. Le premier goulot observé est une saturation intermittente Railway/proxy/app, à diagnostiquer avec métriques CPU/mémoire/instances/connexions après publication du candidat. Les parcours IA, recherche, Auth et paiement doivent être chargés séparément.

## 10. État des plateformes et authentifications

- Vercel staging existe, build et domaine sont opérationnels. La CLI globale 48.9.0 est ancienne ; utiliser ou installer 58.9.4+ (`npm i -g vercel@latest`) avant mutation.
- Railway staging existe avec backend, Redis et worker dédiés, mais Railway CLI n'était plus authentifiée au dernier contrôle.
- Le backend et le worker Railway staging exécutent encore l'ancienne branche distante `Pre-production`, pas le candidat local complet.
- Le service ARQ staging possède un seul réplica et un fichier worker dédié, mais les logs ne montrent pas encore `stripe_effect_outbox_task` tant que le candidat n'est pas publié.
- Stripe Test staging possède trois produits, six prix EUR, un endpoint webhook distinct et des secrets Test masqués dans Railway. La session Stripe CLI locale a expiré.
- Aucun secret Stripe Live ou Resend production ne doit entrer dans staging.
- Sentry staging existe mais l'injection contrôlée attend le candidat publié.
- Modal ne possède pas encore d'application staging isolée.
- OVH, Supabase, Stripe, Railway et Vercel ont déjà été connectés dans la session précédente, mais une reconnexion utilisateur peut être requise. Utiliser Google OAuth enregistré lorsqu'approprié ; ne jamais contourner un MFA.

## 11. Ordre exact de reprise

Ne repars pas sur un nouvel audit général. Procède dans cet ordre :

1. Ouvrir le worktree exact et lire les documents faisant foi.
2. Inspecter le diff et les 105 chemins sans les réinitialiser. Identifier seulement les éventuels fichiers étrangers ou secrets accidentels.
3. Rejouer les vérifications fraîches nécessaires au commit : frontend, TypeScript, ESLint bloquant, Stripe ciblé, Ruff, diff-check et migration/lint staging si la connexion est disponible.
4. Utiliser `$commit` pour créer un commit unique et cohérent sur `codex/stripe-stabilization`, sans inclure de fichier interdit par `AGENTS.md`.
5. Publier la branche candidate de façon contrôlée, sans fusionner dans `Production` et sans créer directement de PR si le workflow du dépôt ne l'autorise pas.
6. Aligner frontend Vercel staging, backend Railway staging et worker ARQ staging sur le même SHA. Vérifier la version déployée et les logs.
7. Réauthentifier Railway CLI et Stripe CLI Test si nécessaire. Ne jamais utiliser Stripe Live pour cette campagne.
8. Vérifier qu'un seul endpoint webhook Stripe Test canonique est actif et que son secret correspond au backend staging.
9. Exécuter le nettoyage Checkout legacy en dry-run avec filtre HuntZen strict, inspecter chaque session, puis appliquer seulement si la liste est validée ; refaire un dry-run et exiger zéro session legacy HuntZen ouverte.
10. Rejouer avec Stripe CLI les cinq événements traités, y compris ordre inversé, doublons et erreur/finalisation partielle.
11. Tester le parcours complet avec comptes synthétiques : création Google/email, Checkout, renouvellement, impayé, droits, résiliation, double résiliation, réactivation et suppression réelle.
12. Vérifier ARQ, Redis, cron minute, connexion fermée, lease, retry, dead-letter et alerte Sentry par erreur contrôlée.
13. Exécuter `reconcile_stripe_subscriptions.py` en dry-run ; exiger zéro divergence critique avant tout apply.
14. Valider Resend staging uniquement après publication de la barrière email, vers `delivered@resend.dev` exclusivement.
15. Déployer/tester Modal staging isolé pour CV privé signé ; aucun endpoint privilégié public.
16. Diagnostiquer Railway avec métriques, corriger le goulot puis reprendre les paliers k6 progressivement. Arrêter au premier seuil rouge.
17. Réparer la CI canonique et exécuter Playwright billing/auth sur la même révision candidate.
18. Mettre à jour la grande todo et tous les rapports avec les preuves fraîches.
19. Rendre un nouveau `GO`, `GO LIMITÉ` ou `NO-GO`. Aucune publicité et aucune migration production avant tous les gates critiques verts et autorisation explicite.

## 12. Gates Stripe obligatoires avant production

- un paiement réussi ne laisse jamais un utilisateur sans droits ;
- une résiliation confirmée ne permet aucun prélèvement automatique futur ;
- aucun double abonnement ni double paiement possible ;
- propriété utilisateur vérifiée sur toutes les mutations ;
- signature webhook invalide refusée ;
- claim/finalisation/retry réellement idempotents sous concurrence ;
- ledger financier présent avant notifications ;
- outbox sans effet `dead` inexpliqué ;
- réconciliation dry-run sans divergence critique ;
- Checkout, renouvellement, impayé, résiliation et réactivation E2E verts ;
- un seul endpoint webhook par environnement ;
- Stripe Tax reste désactivé tant que la politique TVA n'est pas validée avec Leonel.

## 13. Règles de sécurité et d'autonomie

- Production-first : avant toute mutation Supabase, Stripe, Railway, Vercel ou Modal, relire le dernier état déployé, afficher modification/risque/migration/rollback et obtenir l'autorisation si la production est concernée.
- Staging est autorisé ; production ne l'est pas, sauf actions déjà exécutées et documentées.
- Ne révèle jamais les secrets, mots de passe, URLs signées, tokens, emails complets, téléphone client ou identifiants Stripe complets.
- N'invente aucune variable d'environnement ; utilise `.env.example`.
- N'utilise jamais une clé Live dans staging.
- Aucun remboursement, suppression de compte, fusion, mutation de droits ou recréation destructive de branche Supabase sans autorisation explicite.
- Après toute migration, tester RLS/ACL avec `anon`, utilisateur A, utilisateur B, admin et `service_role`.
- Toute modification doit avoir des tests et une preuve fraîche proportionnée au risque.
- Ne marque une tâche terminée que si son résultat est effectivement vérifié.

## 14. Résultat attendu de la nouvelle tâche

La nouvelle tâche doit commencer par confirmer en quelques lignes : worktree exact, branche, nombre de changements préservés, documents lus, première étape non cochée et absence de mutation production. Elle doit ensuite agir, pas refaire une longue analyse architecturale déjà accomplie.

Le handoff est réussi si elle reprend au point « commit/publier le candidat staging puis campagne Stripe et observabilité », conserve toutes les modifications, utilise `$commit` et maintient la décision NO-GO jusqu'aux preuves E2E/charge/alertes finales.

---
