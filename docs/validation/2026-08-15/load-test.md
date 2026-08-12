# Test de charge staging — palier public

**Date :** 12 août 2026
**Cible :** backend Railway staging uniquement
**Révision distante :** ancienne branche `Pre-production`, pas encore le candidat local
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
| 10 VU | 15 s | 668 | 43,88 | 0 % | 24,94 ms | 32,77 ms | p99 42,10 ms, max 86,98 ms | Vert |
| 50 VU | 15 s | 2 196 | 144,26 | 1,09 % (24 timeouts) | 23,96 ms | 48,06 ms | p99 5 s, max 5 s | Rouge |
| 100 VU | interrompu après franchissement | 3 533 | 200,62 | 0 % | 24,29 ms | 4 662,71 ms | max 4 888,66 ms | Rouge |

Les paliers 250 et 500 n'ont pas été lancés : le seuil d'arrêt était déjà
franchi à 50 VU. Après le test, cinq requêtes séquentielles ont répondu `200`
en 41–48 ms et l'outbox Stripe est restée vide, ce qui confirme le retour à
l'état nominal pour ce parcours.

## Premier goulot observé

Le profil bimodal (médiane autour de 24 ms, mais timeouts/p95 proches de 5 s)
indique une saturation intermittente du déploiement Railway staging actuel ou
de sa couche d'entrée. Sans authentification Railway, les métriques CPU,
mémoire, connexions et nombre d'instances ne peuvent pas encore départager le
proxy, l'instance applicative et la configuration Gunicorn.

## Réponse honnête à la question des 5 000 utilisateurs

La capacité de 5 000 utilisateurs simultanés n'est **pas démontrée**. Le
déploiement staging actuel franchit déjà les seuils sur un endpoint minimal à
50 utilisateurs virtuels. Il faut publier le candidat, récupérer les métriques
Railway, corriger le premier goulot, puis reprendre progressivement 10 → 50 →
100 → 250 → 500. Les parcours IA et paiement devront être mesurés séparément.

## Preuves brutes

- `load-test-smoke-10.json`
- `load-test-smoke-50.json`
- `load-test-smoke-100.json`
