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
- Lot 515dff55433fc631e83ecdb97739389b31ff4e1c committé avec le skill commit, poussé sur les deux branches staging. API et worker Railway SUCCESS sur ce hash, health OK à 12:58:51 UTC. Frontend, Modal et production inchangés par ce lot.
- Contrôle discriminant du cas de traçabilité avec une source structurée explicitement limitée : les modèles 20b et 120b rejettent tous deux la phrase. Cela ne permet pas d'attribuer le faux positif précédent au seul choix de modèle, ni de déterminer après coup si le fait avait déjà contaminé le CV adapté transmis à la lettre.
- Répétitions du pipeline : un refus Sanitized CV failed factual verification, puis une génération complète via secours source-only. Trace de cette dernière : première vérification échoue sur JSON Groq invalide ; seconde vérification de l'extraction source réussit. CV et lettre de secours conservent les expériences et Excel débutant. Les recommandations de matching restent incorrectes : 5 000 articles et 15% hypothétiques, CACES et Excel avancé présentés comme manques. Le défaut de disponibilité immédiate est rejeté dans les contrôles négatifs, mais la qualité globale n'est pas validée.

## Recette des différentes versions du CV utilisateur, 6 septembre vers 16h30

Périmètre autorisé : CV personnel de référence du 19 mai et autres versions locales. Originaux inchangés. Aucune candidature, aucun paiement Stripe, aucune promotion production. Pas de droit premium/admin temporaire nécessaire pendant cette série.

- Inventaire initial : neuf PDF portant un nom compatible. Le fichier CV from Wissem Karboub.pdf a été traité sur la base de son nom avant constat qu'il contient le profil d'une autre personne. Il est exclu des résultats ci-dessous et n'est plus utilisé. L'identité doit être vérifiée dans le contenu avant une prochaine série.
- Huit PDF appartiennent au corpus personnel, dont deux versions 2025 avec le même texte normalisé. Sept contenus distincts : six PDF textuels et un PDF-image tourné.
- Tests de composants : code local correspondant à 515dff5, variables et services IA staging. Extraction via le code utilisé par la route d'adaptation, analyse ATS, adaptation et lettre. Ces tests ne prouvent pas les contrats HTTP, quotas ou l'UX de chaque fichier.
- Tests navigateur Arc : connexion Google normale au compte de recette, upload et analyse ATS du PDF de référence puis du PDF-image. Compte resté Exploration. Deux analyses consommées, compteur passé de trois à une restante. Aucune élévation de droits ni abonnement créé.
- Données intermédiaires conservées hors Git dans un répertoire temporaire privé. Aucun contenu complet de CV ni de lettre personnelle ajouté à ce rapport.

| Version | Extraction adaptation | ATS composant | Adaptation | Lettre |
| --- | --- | --- | --- | --- |
| CV_Wissem_Karboub.pdf, référence | Texte extrait, nom fusionné au titre | Réponse, 80 | Produite via secours source | Produite, fréquence quotidienne ajoutée |
| Cv Wissem dev 2025.pdf | Texte extrait | Réponse, 66 | Échec de vérification factuelle | Non atteinte |
| Cv Wissem 2025.pdf | Même texte que la version précédente | Résultat du contenu identique réutilisé | Pas de deuxième appel IA | Non atteinte |
| CV_Wissem_Design_v7_1.pdf | Refus, PDF-image sans texte | Parcours navigateur : 0, état terminé | Non atteinte | Non atteinte |
| CV_Wissem_Design_v5.pdf | Texte extrait, espacement du nom altéré | Réponse, 95 | Produite | Secours réduit à des technologies concaténées |
| CV_Wissem_ATS_v2.pdf | Texte extrait | Réponse, 80 | Produite | Produite, mention d'alternance alors que l'offre cible est un CDI |
| CV_Wissem_Karboub_Final_v3.pdf | Texte extrait | Réponse, 80 | Échec de vérification factuelle | Non atteinte |
| CV_Wissem_Karboub_Final.pdf | Texte extrait | Réponse, 76 | Produite | Produite via secours, associations entre outils et missions à revoir |

Résultats techniques : six analyses ATS de contenus textuels distincts retournent success=true ; quatre adaptations sur six aboutissent, deux renvoient Sanitized CV failed factual verification avec validation_error. Quatre lettres sont produites. Un second contrôle IA contre le document source brut rejette deux lettres, mais ses objections contiennent aussi des faux positifs : ne pas confondre disponibilité pour discuter et disponibilité immédiate pour travailler. Ces contrôles ne sont pas une certification humaine.

Constats directement observés :

1. Le convertisseur Docling local 2.70.0 reçoit PdfPipelineOptions dans format_options et échoue avec l'attribut backend manquant. Le secours pypdf lit les PDF textuels mais ne lit pas le PDF-image. MODAL_PDF_EXTRACT_URL est absent de la configuration API staging inspectée ; l'analyse ATS distante utilise un autre chemin Modal, donc ne pas généraliser l'échec d'adaptation à tous les endpoints.
2. Le nom du CV de référence est concaténé au titre dans le texte extrait. Cette valeur est reprise dans personal_info.name, puis dans l'en-tête du CV et de la lettre. Deux pages CV et une page LM ont été générées et rendues visuellement : le défaut est visible, pas uniquement présent dans un JSON.
3. Le PDF Design v5 perd des séparations : nom déformé et lettre de secours contenant principalement des noms de technologies collés. Un contrôle factuel positif ne prouve pas une lettre professionnelle ou lisible.
4. L'analyse ATS avec offre affiche une recommandation cloud/IaC non demandée par cette offre. Le texte est codé en dur dans CVAnalyzerAgent.run lorsque l'intersection de mots est vide. Plusieurs sorties ont skills={} malgré success=true, donc aucun verdict de bon alignement n'est déduit du score.
5. La lettre du CV de référence ajoute développe quotidiennement. La source contient aussi une ambiguïté actuelle : son résumé dit actuellement chez l'employeur tandis que les dates indiquent une fin en juin 2026. Cette ambiguïté vient du document et doit être distinguée d'une invention.
6. La référence autorise explicitement une disponibilité immédiate pour le freelance et une alternance à partir de septembre 2026. Ne pas transformer cette phrase en disponibilité immédiate pour un CDI.
7. Dans Arc, référence ATS : score 86, durée interne affichée 57,65 s, résultat enregistré completed. PDF-image : score 0, tous les sous-scores à zéro, message Analyse terminée, durée 22,19 s, ligne staging completed sans error_message. L'utilisateur n'est pas informé du problème de lecture. DOM, capture visuelle et état persistant concordent.

Verdict : recette réalisée avec échecs et défauts de qualité prouvés. Pas de GO commercial des fonctionnalités CV/LM, pas de note 9/10. Priorités : extraction/OCR et identité, distinction échec d'analyse versus score zéro, réponses IA invalides, contrôle contre la source originale, qualité des recommandations et des lettres de secours. Mobile connecté, tous les parcours HTTP d'adaptation/lettre et les exports de chaque variante ne sont pas validés par cette série.

## Fiabilisation locale, 7 septembre 2026

Premier lot, non committé et non déployé :

- Configuration Docling corrigée avec PdfFormatOption, sans changer la version 2.70.0. Lecture réelle du PDF de référence : nom séparé du titre. La complétude et le coût mémoire distant restent à vérifier, OCR toujours désactivé sur ce chemin.
- Fichier PDF temporaire possédé par le thread de conversion. Tests de nettoyage après succès et après erreur réussis. Annulation concurrente non testée.
- Score ATS absent, non numérique, booléen, non fini ou hors limites refusé avant mise en cache. Les scores réels 0, 80 et 100 restent acceptés. Cela ne valide pas encore tous les champs ni la restitution HTTP et navigateur.
- Suppression du conseil cloud/IaC ajouté systématiquement en cas d'intersection lexicale vide. Trois tests sur une offre de manutention échouaient avant suppression, puis passent après correction.
- Validation fraîche : 66 tests ciblés CV analyzer, CV adapter et BaseAgent réussis ; 28 occurrences de deux avertissements de dépréciation Supabase. Ruff sur tout backend avec ignore E501 réussi. git diff --check réussi.
- Le contrôle obligatoire mypy src/ échoue dans de nombreux modules, notamment hors du lot. Aucune comparaison complète au parent réalisée, donc ne pas attribuer tous ces résultats aux changements présents ni les déclarer tous préexistants. Commit non effectué selon le workflow commit, aucun hook contourné.

Pas de GO commercial. Restent notamment OCR et complétude, qualité factuelle CV/LM contre la source originale, erreurs et quotas de bout en bout, validation des types, puis déploiement et recette staging. Production inchangée.

### Suite du 7 septembre, candidat 8fba41f

- Comparaison contrôlée mypy avec le fichier HEAD injecté via shadow-file : 2960 erreurs avant, 2952 après annotations du module, aucun nouveau diagnostic normalisé. Le contrôle ciblé du module passe. Ce résultat distingue une dette globale du lot courant, sans déclarer le backend entièrement typé.
- OCR du chemin extract_text_from_pdf : scan personnel rejeté avant activation Tesseract ; même document lu après modification avec 1852 caractères, prénom et nom présents, 5,34 secondes. PDF textuel de référence : 4544 caractères, 0,78 seconde. Ce sont des mesures locales, pas des engagements de latence ni de fidélité de chaque caractère.
- Contre-test Docling par défaut : scan aussi lisible localement, 2141 caractères. Aucun lien causal établi entre l'ancien ATS zéro distant et une panne OCR Modal. Le changement vise le chemin d'extraction employé par l'adaptation.
- Configuration utilise les langues fra/eng et ne force pas l'OCR des pages à texte natif. Dockerfile backend contient déjà Tesseract et fra ; aucune mise à jour Docling ni nouveau fournisseur.
- Revue indépendante du delta : aucun défaut nouveau prouvé, fidélité complète et image distante non certifiées par la revue.
- Commit via skill commit : 8fba41f7e70c950afea74948b5b7ef1d40e3f4d5, uniquement module et tests. Poussé vers codex/stripe-stabilization et Pre-production. 66 tests ciblés passent, Ruff backend propre, avertissements Supabase toujours présents.
- Modal staging déployé avec tag 8fba41f. Worker Railway staging SUCCESS sur ce SHA. Backend encore BUILDING au démarrage de la recette. Aucun changement frontend ou production.
- Arc : connexion Google normale réussie, scan chargé et analyse ATS globale lancée avec le compte de recette. Résultat final en attente à cet instant.

### Suite de recette staging, 7 septembre vers 02h10 Paris

- API et worker ont ensuite atteint SUCCESS sur 8fba41f. Modal staging v11, tag 8fba41f. Deux correctifs frontend supplémentaires, committés exclusivement avec le skill commit puis poussés sur les deux branches staging : bd3e99f marque failed après erreur de suivi ; 633915b rend le dépôt accessible après rechargement de ?step=2 ou ?step=3 sans fichier ni résultat en mémoire.
- Les tests de régression ont échoué avant chaque correctif puis réussi. Dernière validation frontend : 489 tests dans 88 fichiers réussis, TypeScript sans erreur et lint global avec max-warnings=0 réussi. Cela ne remplace pas une recette utilisateur exhaustive.
- Frontend 633915b3f6f07c0f5095a6e8cb54d5e92796aa2a READY, métadonnée Pre-production vérifiée, alias staging.huntzenjobs.com affecté à frontend-next-9gx8e948c-huntzen-jobs.vercel.app. API staging SUCCESS sur ce même SHA. Retour frontend possible à la Preview précédente 962bzljmo, sans opération sur les données.
- Contrôle DOM réel après navigation vers ?step=3 : URL nettoyée, input PDF présent, aucune fausse analyse en cours. Le correctif réinitialise seulement le formulaire, il ne reprend pas un ancien traitement et n'en déclenche pas un nouveau.
- Scan personnel analysé avant ce dernier déploiement : completed, success=true, score brut 95, environ 63 secondes en base. Référence PDF ensuite envoyée via le formulaire sur 633915b : completed, success=true, score brut 88, environ 57,5 secondes en base. Les valeurs ATS ne certifient ni la qualité du CV ni la fidélité de chaque fait.
- Limite majeure de la recette visuelle : Arc reste document.visibilityState=hidden, les captures système ne montrent que le fond d'écran. macOS confirme CGSSessionScreenIsLocked=Yes. L'écran conserve une progression à 95% malgré la fin en base et l'arrêt des requêtes HTTP 200. La cause applicative de ce décalage n'est PAS établie tant que l'affichage n'est pas revu après déverrouillage. Les sondes window.fetch injectées via AppleScript n'observent pas les appels visibles dans Performance et ne sont pas une preuve d'absence de trafic.
- Navigateur Playwright séparé accessible, document visible, mais redirigé normalement vers login faute de session. Aucun transfert de cookies, aucune extraction de token ni contournement de connexion. Veille automatique empêchée temporairement pour une heure avec caffeinate, sans désactiver le verrouillage de sécurité.
- Fidélité des lettres contre le CV original, recommandations de matching, parcours adaptés complets et mobile connecté restent à terminer. Aucun GO commercial, aucune promotion ni modification production. Les changements préexistants AGENTS et autres rapports sont préservés hors des commits de code.

### Reprise après déverrouillage, 7 septembre vers 09h30 Paris

- macOS déverrouillé confirmé, capture et contrôle natif Arc fonctionnels. La session antérieure avait expiré ; connexion Google normale avec le compte de recette réussie jusqu'à /jobs, puis navigation vers Analyse CV.
- Aucun ancien document personnel réenvoyé. Un CV textuel synthétique de manutention, avec Excel débutant et disponibilité explicitement différée, a été soumis par le formulaire. Résultat visible dans Arc : Analyse terminée, score ATS 57, durée interne affichée 7,41 secondes. Compteur ATS de quatre à trois restantes. Le parcours visible aboutit, contrairement à l'observation sous verrouillage ; cela ne détermine pas rétroactivement la cause exacte de l'affichage précédent.
- Le compte Exploration masque les points forts/faibles et suggestions. Déblocage ouvre normalement la fenêtre de choix des plans. Aucun plan changé, aucune transaction ni requête de paiement initiée. La fidélité des recommandations n'est pas validée par cette vue gratuite.
- Défaut confirmé dans cette fenêtre : les trois prix mensuels payants étaient suivis de Gratuit. Source isolée : mapping period utilisait plans.free.period pour tous les plans. Test de rendu avec vrais messages next-intl : rouge sur 9,99€Gratuit, puis vert avec billing.perMonth. Annuel et plan gratuit vérifiés comme témoins. Revue indépendante : pas de changement des montants ou de la requête de paiement.
- Commit 7635c72, correction et test uniquement, poussé sur codex/stripe-stabilization et Pre-production. 490 tests frontend passent, TypeScript et lint global max-warnings=0 passent. Déploiement Vercel en cours de vérification à ce stade. Production inchangée.
- Autre observation UI à reprendre : le titre du contenu réservé est partiellement rogné dans le bloc de déblocage, malgré un bouton utilisable. Ne pas confondre ce défaut de présentation avec un problème d'autorisation.
- Blocage réseau confirmé après deux erreurs Vercel CLI : curl vers api.vercel.com échoue sur correspondance du certificat (code 60). Inspection publique du certificat présenté : CN et SAN portail.hotspot.2isr.fr, pas api.vercel.com. Aucun contournement TLS ni alias forcé. 7635c72 est poussé, mais son déploiement et son affectation à staging ne sont pas confirmés. Nécessite validation normale du portail captif ou changement de réseau avant reprise du déploiement.

### Recette connectée du 7 septembre vers 10h, sans commit ni déploiement

- Réseau revérifié : TLS Vercel valide et login staging HTTP 200. Ancien onglet intégré restait sur une page ERR_ADDRESS_UNREACHABLE. Une navigation HTTPS fraîche fonctionne. Le contrôle natif Arc échouait avec noWindowsAvailable ; aucune conclusion de panne applicative tirée de cette erreur outil.
- Connexion Google normale réussie dans le navigateur intégré avec le compte de recette autorisé, retour /jobs puis /cv-analysis. Aucun transfert de cookie ou contournement de connexion.
- PDF de référence autorisé soumis à une offre fictive full-stack en CDI à Paris. L'offre contient explicitement une consigne de fidélité : cet essai est donc contraint et ne représente pas une annonce ordinaire. CV adapté et lettre atteignent l'écran de résultat ; score affiché 90 %, quotas adaptation et lettre de 10 à 9. Les deux boutons PDF sont présents, sans preuve à ce stade du téléchargement et du rendu des fichiers exportés.
- Défauts factuels PROUVÉS par comparaison du PDF original avec les champs de l'éditeur et son aperçu : première expérience sans dates ; troisième expérience portant les dates de la première au lieu de ses dates originales. La deuxième expérience conserve ses dates, contre-exemple à une perte générale des dates. Résumé ajoutant une localisation à Paris et une recherche de CDI, alors que le CV indique Île-de-France, freelance et alternance. La lettre reprend ce résumé. Aucune disponibilité immédiate ajoutée dans cet essai, ce qui ne valide pas la fidélité globale.
- L'interface affiche néanmoins CV optimisé, score 90 % et mentions ATS Certified. Le score et la génération aboutie ne constituent donc pas une preuve de fidélité. Localement, le formulaire transmet cv_data adapté au générateur de lettre, sans texte source original dans cette requête. La phase exacte ayant déplacé les dates reste à isoler, ne pas l'attribuer au seul LLM ou à l'OCR sans preuve intermédiaire.
- Éditeur mobile connecté testé à 390 x 844 : capture montrant aperçu et actions tronqués. Mesure DOM du dialogue : clientWidth 351, scrollWidth 652 ; clientHeight 735, scrollHeight 903. Débordement horizontal prouvé. Retour à la taille normale après vérification, aucune édition sauvegardée ni candidature marquée.
- Recette NON validée pour commercialisation. Priorités : association des dates aux expériences, conservation des contraintes du candidat depuis la source originale jusqu'à la lettre, éditeur mobile, puis exports et nouvelle recette. Aucun nouveau commit, push, déploiement, paiement ou changement de droits. Changements préexistants conservés.

### Suite locale du 7 septembre, fidélité documentaire et contre-tests

- Cause isolée sur le PDF de référence : l'extraction Docling déplace les dates de la première expérience après la deuxième, avant tout appel de reformulation. La lecture native pypdf en mode layout conserve les associations entreprise/dates observées. Le raccourci natif est limité aux pages suffisamment textuelles sans image détectée ; les autres PDF conservent le parcours OCR.
- Contre-exemple de revue : une page contenant plus de 100 caractères natifs et une expérience en image perdait cette dernière avec le premier raccourci. Test rouge reproduit, puis vert après prise en compte des images. Le CV de référence comporte deux pages sans image, ce garde-fou conserve donc le bénéfice constaté. Cela ne prouve pas l'exhaustivité de tous les PDF mixtes.
- La lettre reçoit désormais la source originale séparément du CV adapté, dans les parcours upload, profil, file de tâches et éditeur. Un brouillon de secours n'est plus marqué valide automatiquement : un contrôle factuel supplémentaire doit l'accepter, sinon aucun paragraphe n'est renvoyé comme résultat réussi. Les anciens appels sans source restent compatibles, leur fidélité à un original absent n'est pas certifiée.
- Les modifications explicites de l'utilisateur sont comparées au CV adapté initial. Seuls les champs modifiés sont ajoutés comme corrections à la source de la lettre. Les autres faits générés ne deviennent pas des déclarations utilisateur. Les références sont effacées à la fermeture. Tests rouges puis verts ; revue indépendante sans nouveau défaut prouvé. Interprétation des chemins d'expériences par le modèle encore à vérifier réellement.
- Confidentialité : la source n'est pas ajoutée au champ cv_data sauvegardé dans les documents, mais transite dans les arguments/résultats ARQ. Le worker configure keep_result à 3600 secondes. La durée effective et les éventuelles copies distantes ne sont pas vérifiées : ne pas présenter ce traitement comme sans stockage.
- Essai réel Groq avec le candidat local et les prompts fichiers, avant le garde-fou images : dates des trois expériences du CV de référence correctes, adaptation réussie en 54,3 secondes. Résumé absent après repli vers les faits source. La lettre passe par le brouillon de secours contrôlé, sans localisation ou disponibilité ajoutée dans les paragraphes observés. Cette lettre plus générique et le résumé absent ne suffisent pas à valider la qualité commerciale. Aucun PDF de ce nouvel essai encore vérifié.
- Éditeur mobile : corrections locales de conteneur flex, largeur minimale et empilement des actions. Recette visuelle après correction non terminée. Deux essais Google locaux, depuis 127.0.0.1 puis localhost, n'ont pas établi de session locale utilisable ; le second aboutit à la page d'accueil staging non connectée. Configuration des redirections non encore vérifiée, cause non affirmée.
- Contrôles frais après les derniers changements : 493 tests frontend, 77 tests backend ciblés, TypeScript, lint frontend max-warnings=0 et Ruff des fichiers backend concernés réussis. Les tests backend affichent 52 avertissements de dépréciation, non masqués. git diff --check passe.
- Aucun nouveau commit, push ou déploiement. Recette complète, exports, qualité rédactionnelle et validation mobile restent nécessaires avant toute conclusion commerciale.

### Reprise autonome, contrôles réels FR/EN et blocage local identifié

- Lecture du dashboard Supabase staging : Site URL staging, seulement deux redirections autorisées, /auth/callback et /auth/recovery sur staging. Aucune URL localhost. Cela explique le retour local vers staging observé. L'ajout limité de http://localhost:3100/auth/callback a été demandé en confirmation non bloquante, aucune configuration modifiée pendant les autres tests.
- Test réel Groq avec source synthétique de débutante Excel et CV adapté volontairement contaminé : le premier contrôle anglais acceptait une utilisation professionnelle d'Excel pour suivre les dossiers, absente de la source. Contre-test isolé : faux énoncé accepté et traduction fidèle acceptée. Deux tentatives précédentes avaient échoué sur le réseau et sont exclues du verdict métier.
- Consigne du vérificateur précisée : une compétence ne prouve pas une tâche effectuée, un intitulé ne prouve pas les missions habituelles. Même paire de phrases après changement : deux refus du faux énoncé et deux acceptations du témoin fidèle. Pas une garantie générale d'absence d'hallucinations.
- Le prompt de génération, lorsqu'une source originale existe, ne contient plus les données adaptées contradictoires. Test de contamination rouge puis vert. Le secours repart également d'une réextraction de l'original, contrôlée ensuite contre le texte original, pas contre cette réextraction. Signature corrigée après revue et preuve d'un TypeError ; le test utilise maintenant create_autospec pour détecter ce type d'erreur.
- Un essai réel a montré un secours anglais partiellement français. Traduction du secours ajoutée avant le contrôle factuel final, couverte par un test rouge puis vert. Le dernier essai réel anglais réussit en 9 secondes sans passer par le secours ; la traduction réelle de cette branche reste donc à contrôler, ne pas la déclarer validée par ce dernier essai.
- Qualité rédactionnelle encore insuffisante pour certifier le lot : répétition d'une expérience et de la disponibilité dans une lettre française ; formulation anglaise affirmant une année complète à partir des seules années 2023-2024. Ces résultats sont à distinguer des vérifications qui passent.
- Deux exports synthétiques et un export français issu de la génération réelle inspectés en image : chacun sur une page, texte lisible, pas de coupure visible. Le premier jeu synthétique utilisait institution/end_date au lieu des clés school/year attendues pour la formation ; l'absence de ces données dans ce PDF ne prouve pas un défaut sur un payload conforme. Le PDF réel confirme les répétitions rédactionnelles, sans défaut de découpe observé.
- Contrôle mypy ciblé du module CV adapter : sept diagnostics. Certains concernent des lignes hors du dernier delta ; comparaison complète au parent non faite dans cette reprise. Ne pas déclarer ce module sans erreurs de types.
- Aucun déploiement, changement de données, transaction ni modification d'abonnement. Le contrôle mobile connecté du candidat local attend toujours l'autorisation de redirection locale ; aucune session copiée ni connexion contournée.

### Contre-tests de format du vérificateur, 7 septembre

- Nouvelle exécution locale : 81 tests ciblés passent, 60 avertissements de dépréciation restent affichés. La revue du garde-fou de complétude des lettres traduites ne relève aucun problème prouvé dans ce delta. Cela ne valide ni leur langue ni leur qualité rédactionnelle.
- Trois appels Groq contrôlés sur le même texte extrait de CV_Wissem_Design_v5 et la même extraction structurée, sans mutation distante : vérification complète en JSON libre refusée en HTTP 400 après 9,6 s ; verdict compact en JSON libre refusé en HTTP 400 après 9,8 s ; même verdict compact avec schéma strict lisible en 5,6 s, 4 388 tokens, un fait signalé. Le code précis des deux erreurs 400 n'a pas été conservé dans cette mesure, ne pas l'inférer du seul statut.
- Contre-épreuve avec schéma strict incluant aussi le CV corrigé : premier appel HTTP 400, deuxième appel exploitable en 10,4 s et 7 515 tokens. Le schéma strict n'est donc pas, à lui seul, un correctif démontré du parcours complet.
- Ces variantes restent des expériences en mémoire, non intégrées au code ni déployées. La fidélité, la complétude et la disponibilité du parcours doivent toutes être vérifiées ; un refus correct de faux faits n'est pas une réussite utilisateur de génération.

### Suite mesurée : modèles et référence factuelle

- Même requête complète : 20B renvoie json_validate_failed ; 120B renvoie deux JSON exploitables en 8,4 et 10,9 secondes. Contrôle final CV passé localement au modèle puissant, sans changer le contrôle LM. Extraction du même CV v5 : 20B échoue ; 120B retrouve deux formations datées puis passe le contrôle contre la source. Extraction initiale passée également au puissant. Deux tests de régression observés rouges puis verts ; 38 tests CV adapter et Ruff passent, 58 avertissements de dépréciation restent visibles.
- Matrice réelle après ces deux changements, avec CVAnalyzerAgent réellement initialisé : v5 réussit en 28,9 s, scan v7_1 échoue en 58,3 s, dev2025 réussit en 35,4 s, ATSv2 réussit en 52,4 s, référence réussit en 52,4 s, Final_v3 échoue en 48 s, Final réussit en 38,3 s. Cinq réussites techniques sur sept, dont quatre replis sans résumé. Pas un résultat commercial validé. Un précédent essai du scan utilisant object.__new__ sans convertisseur initialisé est exclu des résultats produit.
- Connexion Google rétablie dans le navigateur avec wissemkarboub@gmail.com sur staging ; page CV accessible. Aucun traitement du candidat local lancé dans cet écran, qui reste sur la version déployée. HTTP 200 observé aussi sur localhost:3100/login.
- Scan v7_1 inspecté visuellement : texte tourné à 90°, rotation PDF déclarée à 0. Docling 2.70.0 intègre déjà une correction d'orientation OCR ; l'hypothèse d'une simple option OSD absente est rejetée. Test en mémoire de rotation PDF déclarée à 90° : extraction tombe de 1 852 à 14 caractères, donc cette rotation seule n'est pas retenue. Aucun original modifié.

### Task 1: Validation de la référence factuelle, plan d'implémentation

> Exécution dans cette session, avec le workflow executing-plans et revue ciblée. Pas de nouveau chantier ni de commit avant la recette complète demandée.

**Goal:** ne plus restaurer une extraction LLM contestée comme si elle était la source humaine.

**Architecture:** ajouter une validation bornée avant la reformulation. Une correction proposée doit être structurée et revérifiée contre le texte brut, y compris sa couverture. Les garde-fous de conservation existants s'appliquent ensuite à cette référence validée.

**Tech Stack:** Python 3.11, Groq existant, pytest. Docling reste à 2.70.0.

**Spec:** les contre-tests factuels consignés dans ce rapport et la demande de fidélité aux CV/lettres.

**Contraintes:** aucun changement distant, aucune désactivation d'authentification, aucun assouplissement des comparaisons de dates/formations, aucune réussite si le contrôle échoue.

**Fichiers:** backend/src/agents/cv_adapter/main_agent.py et backend/tests/unit/test_cv_adapter_json_fallback.py.

**Interfaces:** `_validate_extracted_data(cv_text, extracted_data)` renvoie une extraction avec `success=True` ou un refus explicite. `_fact_check(..., require_complete=False)` peut exiger la couverture du document source pour cette étape uniquement.

- [ ] Test rouge : extraction avec titre/date erronés, correction complète validée contre la source, résultat final conservant les valeurs corrigées.
- [ ] Tests de refus : correction partielle, correction encore invalide, échec du contrôle. Aucun document certifié ne doit sortir.
- [ ] Implémenter la séquence bornée ci-dessous avant l'analyse de l'offre :

```python
original_data = await self._validate_extracted_data(cv_text, original_data)
if not original_data.get("success"):
    return original_data
```

- [ ] Dans la validation, appeler `_fact_check(cv_text, extracted_data, require_complete=True)`. Si valide, conserver l'extraction. Sinon, exiger un `sanitized_cv` avec les sept sections typées déjà contrôlées par le module ; refuser les sections manifestement manquantes ; revérifier une seule fois avec `require_complete=True`. Ne jamais restaurer l'extraction refusée.
- [ ] La consigne de couverture exige les expériences, formations, certifications, projets et compétences, avec leurs associations de dates ; les doublons de présentation d'un même fait ne deviennent pas plusieurs expériences ou diplômes.
- [ ] Exécuter `.venv/bin/pytest backend/tests/unit/test_cv_adapter_json_fallback.py -q --no-cov`, puis les routes/workers/OCR, Ruff et `git diff --check`.
- [ ] Revue indépendante et nouveaux essais réels sur les CV refusés. Mesurer le temps total face au délai de route existant, sans rallonger ce délai par défaut.
- [ ] Commit et déploiement restent suspendus à la recette complète, conformément à la demande utilisateur.

### Contre-tests de reprise, 7 septembre

- Validation de référence : 43 tests ciblés réussis, 60 avertissements de dépréciation Supabase. Revue indépendante du delta contre les snapshots : aucun défaut bloquant prouvé. La couverture réelle et le délai total restent à vérifier.
- Premier vrai essai v5 avec contrôle initial : refus en 22,5 secondes, le second contrôle signale Vercel absent de la liste des compétences. Il reste à distinguer une omission réelle d'une exigence injustifiée de duplication entre sections. Ce refus n'est pas une recette réussie.
- Scan v7_1 : OSD sur rendu 300 dpi annonce orientation 270°, rotation corrective 90°, confiance 12,59. Le rendu réduit à 1 600 pixels échoue avec « Too few characters ». La résolution influe donc sur ce contrôle local.
- Rotation des pages en mémoire, image extraite et reconstruction PDF ne suffisent pas : export Docling par défaut réduit à 14 caractères. En inspectant le résultat, 256 éléments texte sont présents mais inclus dans un cluster image. `traverse_pictures=True` restitue 2 029 caractères sur le PDF reconstruit, avec un mot par paragraphe. Sur le PDF original, cette option seule ne change rien : 1 852 caractères dans les deux cas. Aucun de ces essais n'est retenu comme correctif complet.
- Tous les originaux sont préservés. Aucun commit, déploiement ni changement distant effectué pendant ces contre-tests.

### Réécriture et lettre, contre-tests complémentaires

- Le vérificateur a classé le champ technique racine `success: true` comme une hallucination. Ce champ est maintenant exclu du JSON factuel, sans mutation de l'entrée ni retrait d'une donnée candidat. Test rouge puis vert.
- Le rédacteur recevait l'ordre `MUST-USE KEYWORDS` malgré l'interdiction d'inventer. Même après reformulation de cette consigne, un essai réel a repris « disponibilité immédiate » depuis les mots-clés de l'offre. La liste brute des mots-clés et exigences n'est donc plus transmise au rédacteur. L'analyse et le matching ne sont pas supprimés.
- Un filtre lexical intermédiaire a été rejeté après revue : présence d'un mot dans une négation ou dans une clé JSON ne prouve pas une compétence. Il n'est pas conservé dans le code.
- Les consignes contradictoires de changement de titre en reconversion sont supprimées. Les tests couvrent les branches reconversion et absence de reconversion. Les tests de prompt ne prouvent pas la fidélité sémantique.
- Essai complet synthétique, source assistant administratif, Excel débutant et « pas de disponibilité immédiate », offre senior Python/Kubernetes : résultat accepté en 11,4 s, titre et dates source conservés, aucun ajout Python/Kubernetes/disponibilité immédiate dans le CV final. Résumé absent. Cela valide ce cas uniquement.
- Nouveau v5 : adaptation acceptée en 22,1 s, lettre acceptée en 19,7 s via le repli source. Défaut observé dans la lettre : candidature « Tech Lead Fullstack » alors que l'offre vise développeur full-stack. Le repli utilise maintenant « poste proposé » au lieu de confondre titre actuel et poste visé. Tests FR/EN rouges avant correction.
- Nouveau Final_v3 : refus en 61,9 s, Firebase considéré absent alors qu'il est présent dans le PDF natif sous ShowroomBaby. Le contrôle factuel présente encore des faux positifs. La recette complète reste NON VALIDÉE.
- Suite de 93 tests CV/LM, routes, worker, PDF et OCR réussie avant le dernier correctif du titre de lettre, 66 avertissements de dépréciation recensés. Aucun déploiement.
- Après le correctif de lettre : 94 tests réussis, 66 avertissements recensés, Ruff et `git diff --check` réussis. Le test existant exigeant le titre candidat dans le repli est remplacé par le contrat de non-confusion avec le poste visé, tout en conservant les assertions sur résumé, réalisations et absence d'inventions.
- Deux PDF synthétiques produits avec le moteur applicatif, CV ATS et lettre : une page chacun, texte extractible et rendu PNG inspecté sans coupure ni chevauchement visible. Cela ne couvre pas encore les longs CV ni tous les modèles.
- Diagnostic indépendant OCR : la reconstruction depuis `TextItem`, `prov.charspan` et `prov.bbox` conserve les 164 spans du scan original et améliore les lignes d'expérience. La séparation des colonnes utilisée pour l'expérience est manuelle, donc non généralisée et non intégrée. Le convertisseur par défaut du Mac utilisait OcrMac, pas Tesseract ; ses résultats ne sont pas transposables tels quels au backend Linux.
- Essais vision isolés avec `qwen/qwen3.8-27b`, disponible sur la clé staging : image tournée non corrigée, 4,1 s, nombreuses inventions ; image redressée, 3,6 s, associations améliorées mais dates de fin manquantes ; image redressée et marges recadrées, 2,7 s, dates retrouvées mais noms déformés et une technologie ajoutée à FlotteQ. Aucun changement de modèle ou de configuration retenu. Cette piste n'est pas validée.

### Répétabilité du candidat expérimental, reprise du 7 septembre

- Le remplacement du modèle puissant par Qwen 3.8 reste une interception en mémoire du client de test. Aucun paramètre distant ni modèle du code applicatif n'est modifié. Le modèle rapide reste GPT OSS 20B.
- Première série : Final_v3 accepté en 29,8 s, puis refusé en 36,7 s au nouvel essai sans réponse fournisseur comptabilisée ; v5 accepté en 14,3 s ; scan v7_1 refusé en 11,4 s. La cause précise du refus sans réponse n'a pas été conservée et reste inconnue.
- Trois contre-tests terminés : Python expert absent de la source rejeté ; disponibilité immédiate contredisant la source rejetée ; Excel débutant fidèle à la source accepté. Ils ne prouvent pas la fidélité de tous les CV.
- Deux extractions seules de Final_v3 réussissent en 4,6 et 4,3 s, avec structure complète. L'erreur précédente d'extraction n'est pas reproduite.
- Deux parcours complets consécutifs sur le même texte natif et la même offre : refus en 39,6 s après échec de vérification du CV corrigé, puis réussite technique en 35,7 s. Une erreur fournisseur HTTP 400 `json_validate_failed` est observée dans chacun des deux parcours. Le diagnostic imprimait le type et le code, pas le modèle de l'appel en erreur : ne pas attribuer cette erreur à Qwen ou au 20B sans cette preuve.
- Consommation du premier parcours : Qwen 18 046 tokens d'entrée et 8 483 de sortie sur 5 réponses, 20B 3 425 et 7 314 sur 3 réponses. Second parcours : Qwen 18 018 et 5 495 sur 5 réponses, 20B 3 425 et 9 967 sur 3 réponses. Ces compteurs de réponses ne constituent pas un relevé de facturation et n'incluent pas nécessairement les appels rejetés.
- Conclusion : un remplacement de modèle seul n'est pas un correctif validé. La validation probabiliste répétée ne fournit pas une référence suffisamment stable sur cette recette ; le scan reste aussi mal extrait. Aucune nouvelle permutation de modèle n'est retenue.
- Régression locale relancée : 94 tests réussis, 66 avertissements de dépréciation en 2,28 s. Ruff ciblé et `git diff --check` passent. HEAD reste `7635c72` et tous les changements locaux sont préservés.
- Navigateur : sélection du compte Google de recette effectuée ; le retour vers le callback staging rencontre `ERR_TIMED_OUT`. Le contrôle indépendant de `/login` répond HTTP 200 en 2,40 s. Ce contrôle public ne valide pas le callback ni la session authentifiée. Aucun contournement de la politique navigateur effectué.
- Recette complète toujours non validée. Aucun commit, push ou déploiement pendant cette reprise.

### Vérification humaine de source, tranche autorisée le 7 septembre

- L'utilisateur autorise la vérification/correction des informations extraites avant génération. Plan local `docs/superpowers/plans/2026-09-07-cv-source-review.md`. Aucun changement distant autorisé par ce seul constat de qualité.
- Décision explicite : vérifier chaque nouveau fichier d'adaptation, faute de score de lisibilité suffisamment fiable. Les profils déjà saisis et l'analyse ATS indépendante restent inchangés. La confirmation humaine ne doit pas désactiver les garde-fous factuels.
- Recette locale isolée du composant réel en cours de réalisation : desktop puis largeur 390 px, sans débordement horizontal. La confirmation est inactive initialement ; modifier le texte après avoir coché invalide la coche ; après confirmation, le texte transmis correspond exactement à la correction. Source synthétique et réponse extraction simulée, aucune validation de staging déduite de ce test.
- Même écran avec extraction simulée HTTP 422 : message compréhensible, saisie manuelle possible, texte non vide et confirmation nécessaires. Aucun document ni paiement réel créé par cette recette UI.
- Extraction DOCX réelle via la nouvelle fonction de route : les 174 caractères du paragraphe synthétique sont restitués exactement. La soupape de concurrence et l'authentification ont été remplacées uniquement dans ce harness local ; ce test n'en prouve pas le fonctionnement. Un premier lancement avait échoué à l'import faute de clé Supabase locale factice, avant toute extraction.
- Contre-test LLM sur source synthétique propre : un refus final en 11,7 s, puis une réussite en 10,7 s. Une trace supplémentaire montre la source initiale validée, puis un résumé excessif rejeté, une proposition corrigée revérifiée et acceptée. La confirmation humaine de l'OCR n'est pas, à elle seule, une validation de la fiabilité de la reformulation.
- Recette de CV long : dix projets conservés, deux pages, pas de projet tronqué dans le texte extractible. Défaut observé : technologies en liste rendues avec la syntaxe `['Python', 'React']`. Tâche corrective isolée ajoutée au plan. L'appel `modern` utilise le repli ATS car ce template n'existe pas ; aucun écran de sélection Modern dans le parcours ApplyModal contrôlé, qui impose ATS. Ne pas prétendre avoir validé deux designs distincts.
- Le premier harness PDF avait passé `fr` en argument positionnel `compact` ; ce résultat de langue est exclu. Relance avec `language='fr'` nommé : rubriques françaises confirmées, défaut de liste toujours présent.
- Extraction réelle du PDF natif autorisé `CV_Wissem_Karboub_Final_v3.pdf` via la nouvelle fonction de route : 9 148 caractères en 0,37 s, passages Firebase et ShowroomBaby présents. Aucun LLM ni service distant appelé. Authentification et capacité remplacées dans le harness local, donc non validées par cet essai.
- Vérification de source terminée : 98 tests backend et 30 tests frontend ciblés réussis. La revue indépendante a fait corriger deux cas limites, cohérence de la borne 100 000 caractères et conservation des corrections après refus de quota, puis les a confirmés résolus.
- Affichage PDF des technologies corrigé et approuvé : listes jointes par virgules, chaîne conservée, HTML échappé et aucune ponctuation sur liste vide. Le PDF final de recette contient les dix projets sur deux pages, dix occurrences lisibles de `Python, React`, aucune représentation Python et aucun chevauchement ou contenu coupé observé sur les deux rendus PNG.
- Nouveau test réel Final_v3 avec les modèles staging : extraction native 9 148 caractères, puis adaptation refusée après 31,3 s par la revérification de la référence corrigée. Une validation isolée immédiatement répétée sur la même source a réussi : le premier contrôle a corrigé trois incohérences de classement de compétences, le second a accepté la structure complète. L'instabilité du verdict est donc reproduite ; une seule revérification supplémentaire, toujours fermée après deux refus, est ajoutée comme Task 3.

### Revue factuelle structurée avant génération

- **PROUVÉ** : la revue précédente portait uniquement sur le texte OCR brut. Une préparation authentifiée distincte produit maintenant les sept rubriques factuelles, puis l'utilisateur peut corriger chaque champ, ajouter ou supprimer des éléments et confirmer explicitement la référence avant génération.
- **PROUVÉ** : la préparation est limitée à 5 requêtes par minute, ne débite aucun quota de génération et rejette plus de 100 000 caractères avant tout appel fournisseur. Le JSON confirmé est limité à 100 Ko, fermé par schémas stricts et transmis de façon identique aux chemins synchrone et ARQ.
- **PROUVÉ** : avec une référence confirmée, l'offre n'est jamais une source de preuve. L'adaptation et la lettre utilisent la représentation canonique de la référence comme autorité factuelle.
- **PROUVÉ** : sur le CV autorisé Final_v3, un essai contrôlé a préparé 3 expériences et 10 projets. L'adaptation a réussi en 41,5 s, a conservé Firebase et ShowroomBaby et n'a ajouté aucune disponibilité immédiate. La lettre a réussi en 24,3 s après repli source contrôlé, sans disponibilité immédiate ajoutée.
- **LIMITE** : le harness a auto-confirmé la structure pour vérifier le pipeline. La confirmation humaine réelle et la recette visuelle staging restent nécessaires avant commercialisation.
- **PROUVÉ** : 552 tests backend unitaires et 507 tests frontend passent. TypeScript, ESLint avec zéro avertissement, Ruff, `git diff --check` et le build Next réussissent.
- Contre-test réel après Task 3 : source native toujours 9 148 caractères, `adapt_success=false`, erreur `Corrected CV failed complete factual verification`, durée 46,1 s. La capacité Redis et l'authentification n'étaient pas exercées dans ce harness local. Répéter deux fois le même objet corrigé ne résout donc pas le cas réel ; Task 4 doit chaîner les nouvelles corrections complètes renvoyées par chaque passe.
