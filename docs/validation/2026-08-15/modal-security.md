# Validation sécurité Modal

**Date :** 12 août 2026
**Environnement :** candidat local `codex/stripe-stabilization`
**Décision actuelle :** NO-GO production tant que l'application Modal staging isolée n'est pas déployée et testée de bout en bout.

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

## Preuves

```text
backend/tests/unit/test_modal_cv_storage_security.py : 11 passed
Ruff ciblé : All checks passed
py_compile des deux applications Modal : succès
git diff --check : succès
```

## Points restant ouverts

1. Tester réellement le rejet 401 sans proxy token et le succès avec token sur une application Modal staging.
2. Vérifier dans le job Modal que `cv_id` et `user_id` désignent la même ligne avant toute mutation.
3. Ajouter une idempotence durable par `job_id` et couvrir le replay.
4. Renvoyer 422/401/504/500 de façon contractuelle au lieu de réponses métier HTTP 200 sur certains échecs.
5. Supprimer le contenu de CV et les erreurs détaillées des logs, puis exécuter les scénarios PDF normal/corrompu/trop lourd/timeout.
6. Mesurer une rafale staging et créer une alerte budget avant activation.
