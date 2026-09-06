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
