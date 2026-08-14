# Test de charge staging — palier public

**Date :** 14 août 2026
**Cible :** backend Railway staging uniquement
**Révision backend retestée :** `4fc00ff`
**Déploiement Railway :** `17f07bb3-b0ad-47dd-871d-49f1001a7304`
**Configuration conservée :** Railway `WORKERS=2`
**Production :** explicitement refusée par le harness

## Périmètre

Ce premier test mesure seulement `GET /api/health/ping`. Il ne permet pas
d'extrapoler la capacité des recherches, des parcours authentifiés, de Stripe,
de Redis, du coach IA ou des traitements CV. Le script
`tests/load/staging_public_smoke.js` exige l'URL et le host staging exacts et
refuse le domaine Railway production.

Seuils : erreurs critiques `< 0,5 %`, p95 `< 500 ms`, p99 `< 1 000 ms`.

## Résultats

| Palier | Durée | Requêtes | RPS | Erreurs | p50 | p95 | p99/max | Décision |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 10 VU | 15 s | 579 | 38,02 | 0 % | 41,67 ms | 104,29 ms | max 295,42 ms | Vert |
| 50 VU, essai 1 | 15 s | 2 231 | 146,41 | 1,16 % (26 timeouts) | 46,46 ms | 105,42 ms | max nominal 289,80 ms | Rouge |
| 50 VU, essai 2 | 15 s | 1 873 | 123,34 | 0 % | 48,28 ms | 138,67 ms | p99 > 1 s, max 4,80 s | Rouge |
| 50 VU, domaine Railway direct | 15 s | 2 226 | 147,86 | 1,30 % (29 timeouts) | 43,16 ms | 107,68 ms | max nominal 647,88 ms | Rouge |
| 50 VU, essai `WORKERS=4` | 15 s | 2 494 | 165,63 | 0,56 % (14 timeouts) | 36,59 ms | 106,47 ms | max nominal 280,08 ms | Rouge |
| 100 VU | 15 s | 2 583 | 168,54 | 2,09 % (54 timeouts) | 53,03 ms | 1,84 s | p99 4,70 s, max 4,81 s | Rouge |
| 50 VU cloud, recyclage corrigé, essai 1 | 15 s | 3 217 | 214,47 | 0 % | 23,17 ms | 39,75 ms | 533,85 / 575,23 ms | Vert |
| 50 VU cloud, recyclage corrigé, essai 2 | 15 s | 1 540 | 102,67 | 0 % | 250,62 ms | 370,74 ms | 1,45 / 1,48 s | Rouge p99 |
| 50 VU cloud, logs corrigés, essai 1 | 15 s | 1 572 | 104,80 | 0 % | 250,83 ms | 346,52 ms | 1,16 / 1,41 s | Rouge p99 |
| 50 VU cloud, logs corrigés, essai 2 | 15 s | 2 407 | 160,47 | 0 % | 99,43 ms | 118,39 ms | 668,81 / 811,26 ms | Vert |
| 50 VU cloud, logs corrigés, essai 3 | 15 s | 3 250 | 216,67 | 0 % | 25,45 ms | 36,05 ms | 334,52 / 370,03 ms | Vert |

Les paliers 250 et 500 n'ont pas été lancés : le seuil d'arrêt a été franchi à
50 VU sur le candidat final. Le service est revenu à `200` après les tests.

## Diagnostic et corrections

Le premier passage avec `WORKERS=1` échouait dès 50 VU avec 3,15 % de timeouts.
Un ancien essai à deux workers avait rendu 50 VU vert, mais les relances sur le
candidat exact montrent que ce palier n'est pas reproductible. Les requêtes qui
atteignent FastAPI restent rapides et sans 5xx ; les échecs observés sont des
`request timeout` k6 (`error_code 1050`) avant réponse. Le domaine Railway direct
reproduit le problème, ce qui exclut le DNS personnalisé. Quatre workers réduisent
les timeouts sans passer le seuil.

Les logs Railway du candidat ont ensuite fourni deux causes concrètes : les deux
workers atteignaient presque ensemble la limite Gunicorn de 1 000 requêtes, puis
Railway rejetait des rafales au-delà de 500 logs/s à cause du double access log
Gunicorn + middleware. Le commit `4cf6ff8` porte le recyclage à 10 000 requêtes
avec 5 000 de jitter. Le commit `4fc00ff` conserve le log applicatif, supprime le
doublon Gunicorn et exclut le ping infra. Après publication, aucune limite de
recyclage, aucun nouveau boot worker, aucun quota de logs et aucune requête
Railway supérieure à une seconde ne sont observés pendant les trois essais.

Les timeouts sont éliminés sur les cinq sondes cloud post-correction. Le seuil
p99 reste cependant dépassé sur un essai final vu depuis Modal (1,16 s), alors
que Railway ne mesure aucune requête au-dessus de 1 s. Deux essais finaux sur
trois sont entièrement verts. Le palier 50 VU n'est donc pas encore déclaré
reproductible sous le gate strict, même si le goulot applicatif identifié est
fermé et le taux d'erreur est désormais nul.

## Réponse honnête à la question des 5 000 utilisateurs

La capacité de 5 000 utilisateurs simultanés n'est **pas démontrée**. Le
déploiement staging actuel valide 10 VU sur un endpoint minimal. À 50 VU, les
timeouts applicatifs ont disparu mais le p99 réseau franchit encore le seuil de
façon intermittente. Les parcours IA et paiement devront être mesurés séparément
avant toute extrapolation.

## Preuves brutes

- `load-test-smoke-10.json`
- `load-test-smoke-50.json`
- `load-test-smoke-100.json`
- Modal `ap-Zbj5sDDNPso5g1eQAXRT7P`, `ap-UXprduVomrsDMc1xRA8J2t` et
  `ap-RokIMf9gFGfAIuNs4c8w48` pour les trois essais finaux.
