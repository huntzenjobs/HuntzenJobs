# Recette recherche et expatriation

## État au 6 septembre 2026

Modifications locales uniquement. Aucun déploiement effectué pour ce lot.
Le changement préexistant de frontend-next/AGENTS.md est préservé.

## Preuves

- Test rouge puis vert : le changement Canada vers Allemagne transmettait encore Canada à askExpat. Dépendance country du callback corrigée.
- Les 15 destinations proposées transmettent maintenant le pays sélectionné dans le test du composant réel. API IA simulée à la frontière : la qualité des réponses réelles n'est pas certifiée par ce test.
- Test rouge puis vert : devise EUR manquante dans les salaires expatriation, désormais affichée.
- Test rouge puis vert : faux état vide pendant le debounce, remplacé par chargement.
- Test rouge puis vert : échec réseau de liste pays masqué par le formulaire. Propagation vers un état d'erreur traduit FR/EN/ES/PT, au lieu d'un résultat vide. Rejet de validation pays désormais intercepté.
- Identifiants autocomplete uniques, libellés accessibles du sélecteur destination et du champ de question.
- GET production /api/countries : success=true, 249 entrées, 249 codes distincts, aucun nom vide ni code mal formé selon le contrôle effectué.
- Lien natif vers l'offre : rôle accessible et href testés, suppression du double mécanisme window.open. Revue indépendante approuvée.
- Suggestions expatriation contextualisées pour la destination dans les quatre langues, test rouge puis vert.
- Vitest complet : 481 tests passent, 83 fichiers (6 septembre, 04:18 heure locale). ESLint ciblé et tsc --noEmit : codes de sortie 0.

## Restant, non validé

- Recherches réelles et villes pour chacun des 249 pays. Le catalogue de pays ne prouve pas la couverture des fournisseurs d'offres.
- Recette visuelle desktop et mobile du candidat, captures avant/après.
- Navigation externe réelle de la fiche offre, devises/périodes des salaires d'offres sans inventer les données manquantes.
- Cohérence de l'historique après changement de pays.
- Validation staging, puis décision de déploiement. Ne pas annoncer le lot comme terminé ou déjà corrigé en production.

## Snapshot avant déploiement

- Vercel production observé Ready : dpl_9aYaW5DpBJvTqFZtpYzHWuzCY7ny, frontend-next-en5s0qsns-huntzen-jobs.vercel.app, alias www.huntzenjobs.com et huntzenjobs.com.
- Lot frontend uniquement. Aucune migration nécessaire, aucun changement backend/worker.
- Rollback envisagé : retour à ce déploiement frontend, sans modification de données.
- Recette locale authentifiée bloquée sur la page de connexion. Aucun contournement ni extraction de session effectué.

## Deuxième lot visuel, non committé

- Réutilisation des cartes et actions existantes. Deux colonnes maximum, titres moins gras, ombres réduites, badges neutres, bouton principal bleu avec focus visible.
- Production : compte wissemkarboub@gmail.com et plan Carrière observés dans le menu du compte.
- Production : filtre CDI réduit le compteur secondaire de 70 à 40 offres. Compteur principal reste à 88 : cohérence à retravailler.
- Production : filtres sources répétant « Offre vérifiée » et clés contractType_h / contractType_m visibles. Correction locale des noms sources et repli du libellé de contrat lorsqu'une traduction manque.
- 483 tests passent sur 84 fichiers. TypeScript passe. ESLint ciblé : aucune erreur, deux avertissements de dépendances React sur jobs/page.tsx.
- Aucun nouveau déploiement effectué. Rendu du deuxième lot non certifié desktop/mobile.

## Limite découverte dans les tests historiques

- Le fichier integration/pages/jobs.test.tsx contenait 20 tests sans rendu du composant, dont des assertions constantes. Le total historique de tests passants ne doit pas être présenté comme une recette fonctionnelle de la page recherche.
- Remplacés dans le même fichier par quatre tests du formulaire réel : soumission des paramètres par les deux variantes, validation d'une recherche vide et désactivation pendant chargement. Les tests jsdom ne prouvent pas le rendu responsive réel.
- Candidat local rouvert sur /jobs : affiche toujours « Connectez-vous pour continuer ». Connexion utilisateur nécessaire pour poursuivre cette recette visuelle.

## Déploiement et diagnostic des liens, 6 septembre

- Le lot précédent 801aa75 a été poussé sur codex/stripe-stabilization et Production. Vercel Ready : dpl_C9kiuJULxF4A42L7RS8eqK5g2H84, frontend-next-j1fz847ay-huntzen-jobs.vercel.app. Badges Adzuna observés sur www.huntzenjobs.com avec le compte Wissem.
- Une nouvelle refonte sobre est uniquement locale : formulaire cyan, en-têtes sans dégradé, cartes compactes, fenêtre de détail blanche. Ne pas confondre avec le lot déjà déployé.
- L'offre Adzuna 5870119298 a ouvert une seule nouvelle fenêtre vers EmploiSoignant 2814469. Le navigateur intégré affiche ERR_HTTP_RESPONSE_CODE_FAILURE. Une requête HTTP indépendante sur l'adresse finale renvoie 200 avec le titre et le contenu de cette offre. Le lien Adzuna lui-même renvoie 403 au client HTTP. Les résultats varient selon le client : ni expiration ni cause réseau précise démontrée. Aucun contournement de protection ou de TLS.
- Défaut distinct reproduit en test contrôlé : une réponse tardive de la description A écrase l'URL de B après changement d'offre. Correction locale : ignorer les réponses obsolètes, réinitialiser erreur et chargement au changement d'URL. Deux tests de non-régression passent après échec constaté avant correctif. TypeScript et ESLint du hook passent.
- Local ouvert sur http://127.0.0.1:3100/jobs. Recette authentifiée du nouveau design encore nécessaire. Aucun paiement, candidature envoyée ou suppression d'offre pendant ce diagnostic.

## Recette authentifiée Arc, 6 septembre, 12h45 à 13h10

- Google OAuth réel réussi dans Arc avec le compte de test Wissem. Le compte staging est sur le plan Exploration, une recherche restante affichée. Aucun droit modifié.
- Staging observé sur c02692d, Vercel Ready. Production toujours sur frontend-next-j1fz847ay, non modifiée.
- Recherche récente manutention : 200 résultats reçus, 10 accessibles au plan actuel. Détail ouvert, extrait signalé explicitement, bouton Voir l'offre originale avec lien d'annonce Adzuna. La destination externe de ce lien n'a pas encore été validée dans cette passe.
- Capture desktop locale : /tmp/huntzen-staging-arc-detail-20260906.png. Non versionnée car une notification personnelle est apparue sur la capture.
- Défauts reproduits : noms fournisseurs encore visibles dans les filtres ; montant 25,000 interprété comme 25 ; compteur principal 200 inchangé après filtrage alors que le compteur secondaire passe à 27.
- Correctifs candidats : suppression du filtre fournisseurs, compteur fondé sur les résultats filtrés, parseur partagé filtre/tri pour milliers, décimales et suffixe K. Aucun taux de change ni annualisation inventés. Libellé et avertissement explicites pour les montants non convertis, dans les quatre langues.
- Tests rouges : six échecs sur séparateurs, puis deux échecs sur suffixe K. Après correction : 485 tests / 86 fichiers passent, TypeScript passe, lint global avec max-warnings 0 passe.
- Revue indépendante lecture seule : suffixe K découvert puis corrigé ; absence de tests de rendu JobsPage signalée. Les tests du parseur ne certifient pas les compteurs dans le navigateur.
- Ouverture connectée vérifiée pour saved-jobs, candidatures, documents, cv-analysis, assistant, expat, profile, referral et recruiter-contact. Le verrou du plan Exploration est affiché pour recruiter-finder. Ces ouvertures ne valident pas les traitements IA, téléchargements ou paiements.
- Pages publiques pricing, contact, faq, about, privacy, terms, legal et temoignages : titres rendus, pas de débordement horizontal au viewport desktop de 1512px, pas de message Application error/500/404 observé. Aucun avis juridique ni certification du contenu commercial.
- Restant observé : textes mêlant tu/vous ; parrainage à zéro affichant encore trois amis vers Argent alors que le premier palier Bronze est à un ami ; statistiques commerciales visibles non justifiées dans cette passe.
- Admin : recette non effectuée avec un rôle admin. Navigation tentée, sans élévation de privilèges.
- Mobile : tentative de fenêtre 390px non effective, Arc conserve 1512px ; iframe de recette non accessible et retirée. Aucun résultat mobile à revendiquer.
- Verdict de cette passe : recette globale INCOMPLÈTE, aucune promotion production ni lancement de publicité autorisé par ces seuls résultats.

## Retest du candidat 94efe7c, 13h07 à 13h15

- Commit poussé sur codex/stripe-stabilization et Pre-production. Vercel dpl_8i43rGwVxpWb4U2d8U6UXGxemXcG Ready, alias staging.huntzenjobs.com basculé. API et worker staging Online, health API status=ok.
- Retest Arc du seuil 100 sur la même recherche : 36 résultats, compteurs principal et secondaire cohérents, cartes 2,200 et 25,000 conservées. Noms fournisseurs absents du panneau. Validation réelle des défauts reproduits précédemment.
- Coach Nova : question synthétique manutentionnaire vers chef d'équipe, réponse réelle reçue, quota 5 vers 4. Réponse structurée, mais formations et durées précises non sourcées. Ce test ne certifie pas la qualité de tous les assistants.
- ATS texte fictif : traitement lancé depuis le wizard. Logs API : création à 11:09:09 UTC, callback completed à 11:09:31 UTC. Quota 5 vers 4. Arc conserve un écran 95% et un document hidden ; restitution du résultat non certifiée. Ne pas relancer aveuglément le traitement ni confondre calcul terminé et rendu terminé.
- Chromium séparé, sans authentification, viewport réellement mesuré à 390px : home, pricing, contact, FAQ, signup, forgot-password et payment/cancel rendent sans débordement horizontal ni erreur Application error/500/404 détectée. Formulaires non soumis. Ce n'est pas une recette mobile authentifiée.
- Refus cookies testé dans Chromium : bannière masquée, aucun chargement gtm.js ni Google Analytics collect observé avant ou après refus dans cette session.
- Contraste Refuser reproduit : texte rgb(209,213,219) sur blanc, ratio calculé 1,47:1. Correctif local fond transparent/texte blanc et cibles 44px. Les handlers de consentement restent inchangés, revue indépendante et six tests ciblés passent. Retest visuel déployé encore nécessaire.
- Une autorisation temporaire admin + plan supérieur staging a été demandée pour poursuivre la couverture payante. Aucun droit modifié tant que cette demande reste sans réponse.

## Recette après autorisation des droits temporaires, 6 septembre

- Candidat staging b4899a2 : nouveau rendu de consentement vérifié à 390px, boutons de 44px et refus lisible. Capture locale staging-cookie-mobile-b4899a2-2026-09-06T11-17-47-759Z.png. Refus confirmé, aucun chargement GTM/Analytics observé dans cette session.
- Autorisation utilisateur reçue pour le compte Wissem sur staging uniquement. Hôte Supabase vérifié cxkpbciubsvopgxakgbj.supabase.co. État initial : is_admin=false, formule Exploration, une seule souscription active sans identifiant Stripe, période non expirée.
- Élévation temporaire par mises à jour conditionnelles de is_admin et plan_id uniquement. Aucune nouvelle souscription, aucun paiement, aucun autre compte modifié. Relecture des valeurs après chaque opération. La première tentative de pilotage Arc a expiré et les droits ont été immédiatement restaurés ; la seconde a permis la recette admin.
- Quatorze routes admin ouvertes : dashboard, plans, support, coaches, analytics, referrals, recruiter-requests, notifications, coupons, segments, prompts, logs, suggestions, live. Titres et commandes rendus, aucune erreur visible détectée ni débordement horizontal. Aucun bouton de mutation globale utilisé. Ceci ne valide pas chaque action métier.
- Pilotage Arc interrompu par un délai AppleEvent avant le parcours premium complet. Restauration des deux champs confirmée en base, même ligne de souscription et même période. Après purge du seul cache de formule du compte et rechargement, le menu affiche à nouveau Exploration. Aucun droit admin permanent laissé par cette recette.
- Analyse CV synthétique précédente : résultat finalement rendu, score ATS 78 et détails visibles. Le blocage 95% n'est plus reproduit ; sa cause n'est pas établie.
- Défauts CV observés : compétence « Excel débutant » présentée comme « Strong proficiency », et aucune suggestion. Cause de perte confirmée : _get_improvements renvoie la chaîne JSON brute, puis run ignore les résultats qui ne sont pas des dictionnaires.
- Correctif local : décodage des recommandations, libellés neutres dans les quatre langues, cache v2 séparé par langue pour ne pas recycler les anciennes réponses vides. Suppression du contenu brut des journaux du parseur JSON, cas reproduit uniquement avec une donnée synthétique.
- Validation : cinq tests rouges avant correction CV, puis un test rouge sur le journal brut. Après correction : 41 tests ciblés passent ; Ruff passe. 22 avertissements de dépréciation Supabase existants sur timeout/verify, non masqués. Couverture ajoutée : JSON valide/Markdown/invalide, compétences débutantes, chaîne run et séparation des caches par langue.
- Ce nouveau correctif CV n'est pas encore déployé au moment de cette entrée. Production inchangée. Recette premium complète, mobile authentifié, génération CV/LM, scénarios Stripe et qualité des autres assistants restent à terminer. Aucun verdict 9/10 ou GO publicitaire global.

## Déploiement et retest CV de c9b265f

- Commit c9b265fd36d02d6f0b559c6b9781f5db602a0931 poussé sur codex/stripe-stabilization et Pre-production. API et worker Railway staging SUCCESS sur ce hash. Health API status=ok à 11:38:36 UTC.
- Modal staging : app huntzen-cv-processor, environnement explicitement staging, version v10, tag c9b265f, déployée à 13:37:22 Paris. Version précédente v9. Aucun déploiement Modal main. Le frontend est inchangé par ce lot Python.
- Nouvelle connexion Google réelle réussie après expiration de session. Nouveau texte CV fictif de 870 caractères saisi dans le wizard, analyse ATS lancée avec bouton activé. Analyse 3c02b219-1571-4388-98f4-ab7a15883e58 créée à 11:41:26 UTC, statut completed relu en base. Résultat rendu à l'écran : score 74, durée de traitement interne affichée 3,79 secondes. Cette durée n'est pas la latence totale de bout en bout.
- Plan Exploration : score accessible, détails et suggestions verrouillés. Plan Carrière temporaire : deux points forts et cinq recommandations affichés. La formulation observée est désormais « Compétences mentionnées : Manutention manuelle, Préparation de commandes, Excel débutant ». Le résultat persistant contient bien les recommandations décodées.
- Le rafraîchissement par focus seul n'a pas actualisé la formule pendant son délai de cache. L'événement applicatif subscription-changed déclenche la relecture serveur et affiche Carrière. Aucun état d'authentification ni résultat API falsifié pour le test.
- Après chaque essai, restauration conditionnelle du plan initial et relecture en base. Le rôle admin est resté false pendant les essais CV premium. Aucune souscription Stripe ni ligne supplémentaire créée.
- Qualité restante : recommandations génériques, chiffres et normes proposés en exemples sans validation avec le candidat ; les mêmes cinq recommandations apparaissent dans deux sections. Les certifications recommandées dans la réponse IA ne sont pas certifiées exactes par cette recette. Ne pas présenter la qualité globale comme 9/10.
- Capture macOS tentée : uniquement le fond d'écran a été capturé, pas la page Arc. Ce fichier temporaire n'est donc pas une preuve visuelle et n'est pas versionné. Les constats CV de cette section viennent du DOM rendu et du résultat de traitement, pas d'une capture visuelle complète.
- Ref Production relue : 801aa757f5ebe3b51a9a23d08f6c689049805827, inchangée. Recette commerciale globale toujours incomplète.

## Reprise après réveil du Mac, 6 septembre vers 14h

- Veille automatique temporairement empêchée avec caffeinate -di -t 14400, démarrage vers 13h51 Paris. Assertions macOS PreventUserIdleDisplaySleep et PreventUserIdleSystemSleep vérifiées. Aucun réglage permanent modifié, capot fermé et arrêt manuel non empêchés.
- Captures système à nouveau disponibles. Écran ATS desktop vu à 1512 x 949 CSS pixels. Tentative de mode responsive Arc non aboutie : largeur observée 1013 puis retour 1512, donc aucune validation mobile authentifiée revendiquée.
- Fixture PDF synthétique créée et rendue : Alex Test, manutentionnaire, Excel débutant, CAP logistique, aucune expérience de management ni CACES. Offre fictive Exemple Logistique, CDI de manutentionnaire à Lyon. Aucune candidature réelle envoyée.
- Plan premium temporaire attribué au seul compte de recette avec restauration de sécurité. Parcours réel : sélection PDF, adaptation à une offre, génération du CV et de la lettre, résultat affiché avec matching 95. Ce score produit par l'application n'est pas une note de qualité indépendante.
- CV et lettre téléchargés depuis leurs boutons. Arc a demandé une autorisation de téléchargements multiples ; autorisation accordée à staging.huntzenjobs.com, fichiers récupérés ensuite. Deux clics sur la lettre ont produit deux copies locales, pas deux générations prouvées.
- Les deux PDF sont lisibles sur une page chacun, sans texte coupé observé lors du rendu. Le CV contient toutefois une responsabilité de traçabilité non présente dans la source. La lettre ajoute une disponibilité immédiate et une ambition de l'entreprise absentes des données fournies. Parcours technique réussi, fidélité factuelle NON validée.
- Investigation en lecture seule : load_prompt charge ai_prompts avant les fichiers locaux. Les entrées staging cover_letter_generator et cv_adapter_fact_checker diffèrent de leurs fichiers. La première demande une raison liée à des recherches sur l'entreprise ; la seconde autorise encore des certifications plausibles. Ces contradictions sont observées ; leur correction doit être vérifiée par un nouveau test identique.
- Prochaine modification proposée, non appliquée : migration ciblée des deux prompts staging vers les versions corrigées, avec sauvegarde des anciennes valeurs et rollback, puis retest CV/LM. Aucun prompt de production modifié.
- Plan Exploration restauré et is_admin=false relus en base à la fin du parcours. Aucun abonnement Stripe ni nouveau droit permanent.

## Fidélité CV/lettre, correctifs du 6 septembre après accord

- Migration 20260906121700 appliquée uniquement à Supabase staging, dans une transaction avec contrôle des valeurs avant modification. Les deux contenus ont été relus et comparés exactement aux fichiers. Registre des migrations renseigné dans la même transaction. Sauvegarde et rollback ciblé conservés, aucune table utilisateur modifiée par cette migration.
- Les prompts interdisent explicitement disponibilité, mobilité, permis ou autorisation de travail supposés, élévation du niveau de maîtrise et affirmations non sourcées sur l'entreprise.
- Test réel du pipeline Python avec Groq staging et CV fictif : CV généré ; lettre régénérée puis secours source-only après deux rejets. Contrôle indépendant d'une lettre volontairement fausse : disponibilité immédiate, maîtrise Excel, traçabilité et entreprise leader ont tous été rejetés. Contrôle positif : disponibilité explicitement fournie et Excel débutant acceptés. Ces tests ne démontrent pas une absence universelle d'hallucinations.
- Défaut de classement des compétences reproduit par tests : perte du niveau débutant, ajout de SAP, doublons et perte de la seizième compétence en erreur fournisseur. Correction déterministe : classement uniquement des libellés source, réintégration des omissions, déduplication et conservation complète en secours.
- Défaut du texte de secours reproduit en français et anglais : deux expériences attribuées au premier employeur. Correction : pas d'attribution globale à un employeur lorsque plusieurs expériences sont agrégées.
- Commits c875f19 puis be26be2 poussés sur codex/stripe-stabilization et Pre-production. API et worker staging SUCCESS sur be26be228449a80508b29d29e96fe6175549cc21. Health API OK à 12:28:51 UTC. Pas de modification frontend ni Modal nécessaire pour ces méthodes CVAdapter exécutées par l'API/worker.
- Validation finale locale : 46 tests ciblés passent, Ruff propre. 22 avertissements Supabase timeout/verify préexistants non masqués. Revue indépendante des deux correctifs et de la migration favorable.
- Branche Production relue à 801aa757f5ebe3b51a9a23d08f6c689049805827, inchangée. Recette Arc sur la version exacte en cours à la rédaction de cette entrée.
- Premier retest Arc sur be26be2 : adaptation refusée après environ 20 secondes, HTTP 500 et message « Adapted CV returned an invalid sanitized document ». L'onglet en arrière-plan a retardé l'actualisation visuelle ; après activation, le message et Réessayer sont visibles. Aucun blocage infini de l'interface établi.
- Cause du refus : la version assainie proposée par le modèle ne conservait pas le contrat de données source. Nouveau chemin de secours : reprendre l'extraction source complète, sans brouillon refusé, puis la vérifier de nouveau contre le CV brut. Échec maintenu si cette seconde vérification est négative. Pas de certification sans contrôle réussi.
- Test de régression rouge puis vert ; 47 tests ciblés réussis et Ruff propre. Revue indépendante favorable. Commit 1dbe87c poussé, API et worker staging SUCCESS sur 1dbe87c0b5476415902f705ff8d6ef5c58545acf. Un test Python réel a exercé ce secours après erreur JSON du modèle puis produit CV et lettre ; le contrôle de la lettre fausse reste négatif.
- Limite qualitative encore observée dans les métadonnées de matching du test Python : le mapper propose des métriques hypothétiques et cite CACES parmi les manques alors que l'offre synthétique ne l'exige pas. Ne pas assimiler le score de matching à une évaluation indépendante de qualité. Ce point reste à traiter séparément ; aucune certification globale 9/10.
- Retest Arc sur 1dbe87c : CV et lettre générés, enregistrés dans Mes documents et téléchargés. Le texte des PDF ne contient pas de disponibilité immédiate ajoutée. Défauts observés : Excel sans débutant et en double, catégories techniques anglaises, date française rendue avec September, préfixe Objectif repris dans la phrase de candidature.
- Correctifs locaux complémentaires : récupération des niveaux explicitement adjacents dans la source, déduplication, traduction des clés techniques françaises, date sans dépendance à la locale système et retrait du préfixe Objectif. Revue : le premier regex traversait les lignes ; deux contre-tests rouges ont reproduit Excel Advanced attribué à tort depuis Advanced English. Séparateurs horizontaux et fin de niveau bornée corrigent ces deux cas. 53 tests ciblés passent, Ruff propre, 28 avertissements de dépréciation Supabase non masqués.
- Nouveau pipeline Groq réel avec ce code : Excel débutant conservé une fois et date 6 septembre 2026. MAIS la lettre ajoute encore la traçabilité des opérations et son lien à Excel, acceptés par le vérificateur IA. Le contrôle séparé d'une lettre volontairement fausse rejette disponibilité immédiate, maîtrise Excel et entreprise leader, sans couvrir ce faux positif subtil. Fidélité globale NON validée, pas de promotion production. Catégorie Soft Skills encore observée malgré les clés techniques localisées.
- Le plan de recette a été restauré à Exploration et is_admin=false après le test Arc. Veille automatique temporairement empêchée, assertions macOS relues vers 14h55 Paris.
