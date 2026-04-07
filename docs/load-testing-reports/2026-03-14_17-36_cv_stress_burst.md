# Rapport Load Test — cv_stress / burst

**Date :** 2026-03-14T17:36:08.664672  
**Users :** 10  
**Durée :** 42.1s  
**Taux d'erreur :** 33.3%  
**Seuil de rupture :** 10  
**Bottleneck :** cv_cover_letter  

## Métriques par étape

| Étape | P50 | P95 | P99 | Succès | Erreurs |
|-------|-----|-----|-----|--------|---------|
| cv_cover_letter | 35.613s | 42.085s | 42.085s | 100.0% | — |
| cv_adapt | 35.614s | 42.015s | 42.015s | 100.0% | — |

## Recommandations

- Taux d'erreur 33% > 20% à 10 users — seuil de rupture identifié.
