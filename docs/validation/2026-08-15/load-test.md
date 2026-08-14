# Test de charge staging — palier public

**Date :** 14 août 2026
**Cible :** backend Railway staging uniquement
**Révision backend retestée :** `8516ba7` puis publication identique dans `798b97e`
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

Les paliers 250 et 500 n'ont pas été lancés : le seuil d'arrêt a été franchi à
50 VU sur le candidat final. Le service est revenu à `200` après les tests.

## Premier goulot observé

Le premier passage avec `WORKERS=1` échouait dès 50 VU avec 3,15 % de timeouts.
Un ancien essai à deux workers avait rendu 50 VU vert, mais les relances sur le
candidat exact montrent que ce palier n'est pas reproductible. Les requêtes qui
atteignent FastAPI restent rapides et sans 5xx ; les échecs observés sont des
`request timeout` k6 (`error_code 1050`) avant réponse. Le domaine Railway direct
reproduit le problème, ce qui exclut le DNS personnalisé. Quatre workers réduisent
les timeouts sans passer le seuil. La configuration a donc été remise à deux
workers et la capacité stable démontrée reste 10 VU sur ce seul ping public.

## Réponse honnête à la question des 5 000 utilisateurs

La capacité de 5 000 utilisateurs simultanés n'est **pas démontrée**. Le
déploiement staging actuel valide 10 VU sur un endpoint minimal et franchit les
seuils de façon intermittente dès 50 VU. Les parcours IA et paiement devront être mesurés séparément
avant toute extrapolation.

## Preuves brutes

- `load-test-smoke-10.json`
- `load-test-smoke-50.json`
- `load-test-smoke-100.json`
