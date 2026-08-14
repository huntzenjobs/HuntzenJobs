# Validation sécurité Modal

**Date :** 14 août 2026
**Environnement :** application Modal staging isolée + Supabase/Railway staging
**Décision actuelle :** GO staging pour les chemins normal, corrompu, trop lourd, replay et timeout réel ; l'alerte budget reste requise avant production.

## Correctifs vérifiés localement

- Les deux fonctions HTTP Modal déclarent `requires_proxy_auth=True`.
- Le backend n'active Modal que si `MODAL_ENABLED=true`, qu'une URL explicite est fournie et que les deux éléments du proxy token sont présents.
- Les URL de production implicites ont été supprimées.
- Le backend joint `Modal-Key` et `Modal-Secret` aux appels CV et PDF.
- Une source PDF n'est acceptée que si son URL HTTPS signée appartient exactement au projet Supabase configuré et au bucket privé `cvs`.
- Les identifiants CV/utilisateur sont validés comme UUID et la langue est limitée à `fr`, `en`, `es` ou `pt`.
- Le webhook CV utilise un modèle Pydantic `extra="forbid"`; le texte CV et la description de poste sont bornés.
- L'extracteur PDF utilise un modèle Pydantic `extra="forbid"`, limite le base64 et refuse un PDF décodé supérieur à 10 Mio.
- Le processeur CV est borné à 20 conteneurs ; l'extracteur PDF à 10 conteneurs, sans conteneur chaud permanent.
- Le traitement réserve désormais atomiquement une ligne `pending` avant tout appel Groq. Un replay `processing`, `completed` ou `failed` ne relance pas l'analyse.
- Le webhook CV utilise l'interface asynchrone Modal et renvoie HTTP 500 si le spawn échoue, sans exposer l'exception interne.
- L'extracteur PDF renvoie 422 pour un payload/PDF invalide ou vide, 413 au-delà de 10 Mio et 500 pour une panne interne ; ces erreurs ne sont plus déguisées en HTTP 200.

## Preuves

```text
backend/tests/unit/test_modal_cv_storage_security.py : 25 passed
Ruff ciblé : All checks passed
py_compile des deux applications Modal : succès
git diff --check : succès
PDF synthétique privé signé : completed, résultat persisté, callback réussi
PDF synthétique corrompu : failed, aucun résultat, erreur persistée
PDF synthétique > 10 Mio : HTTP 400 avant quota, stockage et traitement
Replay réel du même cv_id completed : deux HTTP 200, ligne/résultat/updated_at inchangés
Timeout HTTP simulé : statut failed et message contractuel persistés
Timeout Modal réel : sonde éphémère annulée exactement à 10 s, sans secret ni donnée applicative
Nettoyage utilisateur, ligne cv_analyses et objet Storage : succès
```

## Points restant ouverts

1. Mesurer une rafale staging et créer une alerte budget avant activation production. La CLI permet de lire la facturation mais pas de configurer l'alerte ; le Dashboard Modal doit être authentifié pour cette dernière action.
