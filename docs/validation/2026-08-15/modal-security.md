# Validation sécurité Modal

**Date :** 14 août 2026
**Environnement :** application Modal staging isolée + Supabase/Railway staging
**Décision actuelle :** GO staging pour les chemins normal, corrompu, trop lourd et replay ; timeout réel et alerte budget restent requis avant production.

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

## Preuves

```text
backend/tests/unit/test_modal_cv_storage_security.py : 18 passed
Ruff ciblé : All checks passed
py_compile des deux applications Modal : succès
git diff --check : succès
PDF synthétique privé signé : completed, résultat persisté, callback réussi
PDF synthétique corrompu : failed, aucun résultat, erreur persistée
PDF synthétique > 10 Mio : HTTP 400 avant quota, stockage et traitement
Replay réel du même cv_id completed : deux HTTP 200, ligne/résultat/updated_at inchangés
Timeout HTTP simulé : statut failed et message contractuel persistés
Nettoyage utilisateur, ligne cv_analyses et objet Storage : succès
```

## Points restant ouverts

1. Exécuter un timeout réel contrôlé sans transmettre les Proxy Tokens à un tiers ; le chemin automatisé est couvert mais aucun traitement de 120 secondes n'a été facturé uniquement pour ce test.
2. Renvoyer 422/401/504/500 de façon contractuelle au lieu de réponses métier HTTP 200 sur certains échecs.
3. Mesurer une rafale staging et créer une alerte budget avant activation production.
