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
