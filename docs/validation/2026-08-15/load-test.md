# Test de charge staging — palier public

**Date :** 14 août 2026
**Cible :** backend Railway staging uniquement
**Révision distante :** `0cdbd95`, configuration Railway `WORKERS=2`
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
| 10 VU | 15 s | 581 | 37,79 | 0 % | 38,15 ms | 108,53 ms | p99 137,32 ms, max 178,66 ms | Vert |
| 50 VU | 15 s | 2 681 | 175,54 | 0 % | 52,17 ms | 108,87 ms | p99 124,98 ms, max 157,40 ms | Vert |
| 100 VU | 15 s | 2 583 | 168,54 | 2,09 % (54 timeouts) | 53,03 ms | 1,84 s | p99 4,70 s, max 4,81 s | Rouge |

Les paliers 250 et 500 n'ont pas été lancés : le seuil d'arrêt a été franchi à
100 VU. Le service est revenu à `200` après le test.

## Premier goulot observé

Le premier passage avec `WORKERS=1` échouait dès 50 VU avec 3,15 % de timeouts.
Le passage prudent à deux workers a rendu 50 VU entièrement vert. Le profil
bimodal réapparaît à 100 VU : la capacité démontrée de ce déploiement est donc
50 utilisateurs virtuels sur le ping public, pas davantage.

## Réponse honnête à la question des 5 000 utilisateurs

La capacité de 5 000 utilisateurs simultanés n'est **pas démontrée**. Le
déploiement staging actuel valide 50 VU sur un endpoint minimal et franchit les
seuils à 100 VU. Les parcours IA et paiement devront être mesurés séparément
avant toute extrapolation.

## Preuves brutes

- `load-test-smoke-10.json`
- `load-test-smoke-50.json`
- `load-test-smoke-100.json`
