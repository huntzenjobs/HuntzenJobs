# Rapport Load Test — cv_stress / burst

**Date :** 2026-03-14T17:38:09.297626  
**Users :** 20  
**Durée :** 90.6s  
**Taux d'erreur :** 49.2%  
**Seuil de rupture :** 20  
**Bottleneck :** cv_adapt  

## Métriques par étape

| Étape | P50 | P95 | P99 | Succès | Erreurs |
|-------|-----|-----|-----|--------|---------|
| cv_cover_letter | 39.091s | 59.534s | 59.534s | 100.0% | — |
| cv_adapt | 39.835s | 82.228s | 82.228s | 80.0% | cv_adapt_timeout:4 |
| cv_upload | 18.008s | 18.008s | 18.008s | 4.8% | cv_upload_502:1, cv_upload_error:19 |

## Recommandations

- Taux d'erreur 49% > 20% à 20 users — seuil de rupture identifié.
