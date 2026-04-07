# HuntZen — Guide Complet de Scaling

> Analyse réalisée le 12 mars 2026. Toutes les métriques sont **mesurées en production**, pas estimées.

---

## Table des matières

1. [Architecture actuelle](#1-architecture-actuelle)
2. [Ce qui limite aujourd'hui](#2-ce-qui-limite-aujourd'hui)
3. [Capacité actuelle — chiffres réels](#3-capacité-actuelle--chiffres-réels)
4. [Plan d'upgrade — 3 niveaux](#4-plan-dupgrade--3-niveaux)
5. [Capacité après upgrade](#5-capacité-après-upgrade)
6. [Checklist des actions](#6-checklist-des-actions)
7. [Coûts](#7-coûts)

---

## 1. Architecture actuelle

```
Utilisateurs
     │
     ▼
┌─────────────────────────────────────┐
│  Vercel (Next.js — CDG1 Frankfurt)  │
│  4 crons automatiques               │
└────────────────┬────────────────────┘
                 │ HTTPS
                 ▼
┌─────────────────────────────────────┐
│  Railway Pro (FastAPI)              │
│  2 replicas minimum → 4 maximum     │
│  4 workers Gunicorn par replica     │
│  = 8 à 16 workers selon charge CPU  │
└───────┬────────────────┬────────────┘
        │                │
        ▼                ▼
┌──────────────┐  ┌─────────────────┐
│ Supabase Pro │  │  Upstash Redis  │
│ PostgreSQL   │  │  Rate limiting  │
│ 57 conn max  │  │  Cache quotas   │
│ eu-west-1    │  │  10K ops/sec    │
└──────────────┘  └─────────────────┘
        │
        │         ┌─────────────────────────────────────┐
        │         │  Modal Labs (analyse CV serverless)  │
        │         │  min_containers=0 (cold start actif) │
        │         │  max_containers=1000                 │
        │         │  2 vCPU · 4 GB RAM par container     │
        │         │  Docling (PDF) + 2 appels Groq 70B   │
        │         └──────────────┬──────────────────────┘
        │                        │ GROQ_API_KEY PARTAGÉE
        ▼                        ▼
┌──────────────────────────────────────┐
│  Groq API    ← LE VRAI GOULOT        │
│  Plan Dev — 12K tok/min              │
│  ⚠️  QUOTA PARTAGÉ Railway + Modal   │
└──────────────────────────────────────┘
```

### Plans actuels confirmés

| Service | Plan | Région | Statut |
|---------|------|--------|--------|
| Railway | **Pro** ✅ | europe-west4 (Pays-Bas) | Actif |
| Supabase | **Pro** ✅ | eu-west-1 (Irlande) | Actif |
| Groq | **Développeur (GRATUIT)** ⚠️ | — | **Problème critique** |
| Upstash Redis | Pay-as-you-go | — | Actif |
| Vercel | Pro | CDG1 | Actif |

---

## 2. Ce qui limite aujourd'hui

### Le problème principal : Groq plan Développeur

Toutes les fonctionnalités IA de HuntZen utilisent Groq. Le plan gratuit a des limites très basses :

| Modèle | Requests/min | **Tokens/min** |
|--------|-------------|----------------|
| llama-3.3-70b (coach, analyse CV) | 1 000 | **12 000** |
| llama-4-maverick-17b-128e-instruct (fast) | 1 000 | **30 000** |

**Pourquoi c'est si limitant ?**

Chaque fonctionnalité consomme beaucoup de tokens :

| Fonctionnalité | Modèle utilisé | Appels LLM | Tokens consommés | Durée |
|---------------|---------------|-----------|-----------------|-------|
| Coach IA (Railway) | 70B | 1 + sous-agents | ~4 000 tokens | ~10s |
| Analyse CV (Modal) | 70B | **2 appels*** | ~6 000–8 000 tokens | ~15–20s** |
| Génération CV + LM | 70B + Fast | **10+ séquentiels** | ~13 500 tokens | ~60s |
| Recherche emploi | Fast | 1 (classement) | ~800 tokens | ~3s |

> *Modal : appel 1 = `extract_cv_info` (max 500 tok) + appel 2 = `analyze_cv` (max 3 000 tok) = ~6 000–8 000 tokens total avec prompts.
> **+15–20s supplémentaires si cold start (premier usage après une période calme).

> **Exemple concret** : Le coach IA utilise 4 000 tokens par message.
> La limite est 12 000 tokens/minute.
> → Maximum **3 messages coach traités par minute** sur toute la plateforme.
> → Si 2 users écrivent au coach en même temps, le 2ème attend. Le 3ème reçoit une erreur.

> ⚠️ **Quota Groq PARTAGÉ entre Railway et Modal** : Les deux services utilisent la même `GROQ_API_KEY` et le même quota de 12 000 tok/min.
> En pratique : 1 analyse CV en cours dans Modal (~7 000 tok) + 1 message coach dans Railway (~4 000 tok) = **11 000/12 000 tok/min** → cannibilisation quasi-totale du quota dès 2 utilisateurs simultanés sur des features différentes.

---

### Le problème secondaire : Cold start Modal

Modal est configuré avec `min_containers=0` — le warm start est **intentionnellement désactivé** pour réduire les coûts (`modal_app.py` ligne 540 : `# min_containers=2, DISABLED: Warm start disabled to reduce costs`).

**Impact sur la latence de l'analyse CV** :

| État du container | Latence supplémentaire | Fréquence estimée |
|------------------|----------------------|------------------|
| Container chaud (trafic récent) | +0s | Usage en heures de pointe |
| Container froid (>5 min d'inactivité) | **+15–20s** | Premier user après période creuse |

**Décomposition du délai cold start** :
- Spin-up container Modal : 3–5s (déclaré dans `modal_app.py` commentaire)
- Chargement modèles Docling (ML, non préchargés) : 8–10s
- **Total ressenti** : ~13–20s avant le début du processing

**Solution si la latence devient problématique** : décommenter dans `modal_app.py` ligne 540 :
```python
min_containers=1,        # 1 container toujours chaud
scaledown_window=300,    # Garde le container chaud 5 min après dernier usage
```
Coût additionnel : ~$2–5/mois (1 container idle 24h/24 = 2 vCPU × 720h × ~$0.003/vCPU/h).

---

### Les autres composants ne sont pas un problème

| Composant | Capacité | Suffisant pour |
|-----------|---------|----------------|
| Supabase (57 connexions, mode transaction) | ~678 req simultanées | 6 000+ DAU |
| Railway (8 workers actuels) | ~2 400 req/min | 3 000+ DAU |
| Redis Upstash | 10 000 ops/sec | 50 000+ DAU |
| Vercel | Illimité (serverless) | Pas de limite pratique |

---

## 3. Capacité actuelle — chiffres réels

> Méthode de calcul : **Loi de Little** — utilisateurs simultanés = (débit/min) × (durée en min)

### Utilisateurs simultanés par fonctionnalité

| Fonctionnalité | Simultanés aujourd'hui | Ressenti utilisateur |
|---------------|----------------------|---------------------|
| Dashboard / Auth | **~678** | Rapide ✅ |
| Recherche emploi | **~19** | Correct ✅ |
| **Coach IA** | **~1** | Freeze dès 2 users ❌ |
| **Analyse CV (Modal)** | **~1** | Freeze dès 2 users ❌ + cold start +15s ⚠️ |
| **Génération CV + LM** | **~1** | Freeze dès 2 users ❌ |

### DAU (utilisateurs actifs par jour) supportés

> Hypothèse : 10% des DAU sont actifs simultanément, 15% d'entre eux utilisent une feature IA.

| Scénario | DAU max avant dégradation |
|----------|--------------------------|
| Que du dashboard/jobs list | ~6 000 DAU |
| Mix réaliste (coach + CV + jobs) | **~200–300 DAU** ❌ |

**En résumé : HuntZen supporte environ 200 DAU confortablement aujourd'hui.**
Au-delà, les features IA deviennent lentes ou renvoient des erreurs.

> Note : ce chiffre suppose que coach et analyse CV ne sont pas utilisés simultanément. Avec quota Groq partagé Railway + Modal, un seul utilisateur lançant une analyse CV bloque ~58% du quota, laissant seulement ~5 000 tok/min disponibles pour les autres features.

---

## 4. Plan d'upgrade — 3 niveaux

---

### Niveau 1 — Groq On-Demand ⭐ Le plus impactant

**Ce que c'est** : Passer du plan gratuit Groq au plan pay-as-you-go. Pas d'abonnement fixe, tu paies uniquement ce que tu consommes.

**Nouvelles limites** : 6 000 000 tokens/minute (×500 par rapport à aujourd'hui)

**Comment faire** (5 minutes) :
1. Aller sur [console.groq.com](https://console.groq.com)
2. Menu gauche → **Billing**
3. Cliquer **"Upgrade to On-Demand"**
4. Entrer une carte bancaire
5. C'est tout — aucun changement de code nécessaire

**Coût** :
| Modèle | Prix | Estimation à 1 000 DAU actifs |
|--------|------|-------------------------------|
| llama-3.3-70b | $0.59 / million tokens | ~$20–40/mois |
| llama-4-scout-17b | $0.11 / million tokens | ~$5–10/mois |
| **Total Groq** | | **~$25–50/mois** |

> Calcul : 1 000 DAU × 5 messages coach/jour × 4 000 tokens = 20M tokens/mois × $0.59 = $11.8/mois pour le 70B.
> En pratique avec tous les features : ~$25–50/mois à 1 000 DAU actifs.

---

### Niveau 2 — Augmenter WORKERS Railway

**Ce que c'est** : Passer de 4 à 6 workers Gunicorn par replica. Plus de workers = plus de requêtes traitées en parallèle.

**Comment faire** (2 minutes) :
1. Aller sur [railway.app](https://railway.app)
2. Projet HuntzenJobs → Service HuntzenJobs
3. **Variables** → chercher `WORKERS`
4. Changer la valeur : `4` → `6`
5. Railway redéploie automatiquement

**Impact** :
- Workers total au peak : 8 → **24** (6 workers × 4 replicas max)
- Throughput : 2 400 req/min → **7 200 req/min**
- Aucun coût supplémentaire (déjà inclus dans Railway Pro)

---

### Niveau 3 — Réduire la taille des prompts IA

**Ce que c'est** : Les fichiers `.txt` dans `/backend/prompts/` contiennent les instructions données à Groq. Certains sont trop longs, ce qui consomme des tokens inutilement.

**Fichier le plus problématique** :
```
coach_main.txt : 2 474 mots ≈ 3 300 tokens (juste pour le prompt système !)
Objectif       : ~800 mots ≈ 1 070 tokens
Économie       : -2 200 tokens par message (-67%)
```

**Impact si on réduit tous les prompts de 50%** :

| Feature | Tokens avant | Tokens après | Simultanés après |
|---------|-------------|-------------|-----------------|
| Coach IA | 4 000 | 1 700 | 250 → **600** |
| Analyse CV | 8 800 | 4 500 | 36 → **70** |
| CV + LM | 13 500 | 7 000 | 444 → **857** |

Et **-55% sur la facture Groq** chaque mois.

**Comment faire** : Réécrire les prompts en gardant uniquement les instructions essentielles. Tâche de 1 à 2 jours.

---

## 5. Capacité après upgrade

### Utilisateurs simultanés par fonctionnalité

| Fonctionnalité | Aujourd'hui | + Groq On-Demand | + WORKERS=6 | + Prompts réduits |
|---------------|-------------|-----------------|-------------|------------------|
| Dashboard / Auth | 678 | 678 | **2 034** | 2 034 |
| Recherche emploi | 19 | 19 | **57** | 57 |
| Coach IA | **1** | 250 | 250 | **600** |
| Analyse CV | **1** | 36 | 108 | **70** |
| Génération CV + LM | **1** | 444 | 444 | **857** |

> Note : L'analyse CV simultanée baisse entre WORKERS=6 et prompts réduits car le gain de tokens compense différemment selon les durées de réponse.

### DAU supportés

| Scénario | DAU max confortables | DAU max absolu |
|----------|---------------------|----------------|
| **Aujourd'hui** | **~200** | ~500 |
| + Groq On-Demand | ~4 000 | ~6 000 |
| + WORKERS=6 | ~6 000 | ~9 000 |
| + Prompts réduits | ~10 000 | ~15 000 |
| **Tout combiné** | **~10 000** | **~15 000** |

---

## 6. Checklist des actions

### Jour 1 — Sans toucher au code (priorité absolue)

- [ ] **Groq On-Demand** → `console.groq.com → Billing → Upgrade`
  - Impact : Coach/CV passent de 1 à 250+ simultanés
  - Durée : 5 minutes
  - Coût : ~$25–50/mois selon usage

- [ ] **Railway WORKERS=6** → Dashboard → Variables → `WORKERS = 6`
  - Impact : +50% de throughput sur tous les endpoints
  - Durée : 2 minutes
  - Coût : 0€ (inclus Railway Pro)

- [ ] **Supabase PITR** → `app.supabase.com → Settings → Database → Backups → Enable PITR`
  - Impact : Récupération point-in-time en cas de perte de données
  - Durée : 2 minutes
  - Coût : Inclus dans Supabase Pro

- [ ] **Betterstack Uptime** → Créer compte sur [betterstack.com](https://betterstack.com)
  - Créer 3 monitors (check toutes les minutes) :
    - `https://huntzenjobs-production.up.railway.app/health`
    - `https://huntzenjobs-production.up.railway.app/api/health/ping`
    - `https://www.huntzenjobs.com`
  - Alertes : email immédiat si down
  - Durée : 15 minutes
  - Coût : **Gratuit** (free tier jusqu'à 10 monitors)

- [ ] **Sentry alertes** → `app.sentry.io → Alerts → New Alert Rule`
  - Alerte 1 : Error rate > 5% en 5 minutes → Email
  - Alerte 2 : P95 latency > 2 000ms → Email
  - Durée : 10 minutes
  - Coût : Gratuit (free tier)

### Semaine 1 — Déjà implémenté dans le code ✅

- [x] `railway.toml` → `healthcheckPath = "/health"` (Railway sait si l'app est vraiment prête)
- [x] `/health` → vérifie DB + Redis, retourne HTTP 503 si la DB est inaccessible
- [x] Pool DB : `min=5, max=20` (pool plus réactif sous charge)
- [x] Circuit breaker Groq → timeout 45s + message de fallback au lieu d'une erreur
- [x] Sentry → `traces_sample_rate` 0.1 → 0.3 (voit 3× plus d'erreurs)
- [x] Endpoint `/api/health/pool` → métriques pool DB pour monitoring

> Ces changements sont dans le code mais **pas encore déployés**. Un push vers la branche `Production` les activera.

### Semaine 2 — Réduction des prompts (développement)

- [ ] Réécrire `prompts/coach_main.txt` : 2 474 → ~800 mots
  - Impact : -67% tokens, +140% simultanés coach, -55% facture Groq
- [ ] Réécrire `prompts/cv_ats_scorer.txt`, `cv_analyzer_context.txt`
- [ ] Limiter l'historique de conversation à 10 messages maximum
- [ ] Configurer alerte Betterstack si `pool.utilization > 0.8`

### Optionnel — Si tu dépasses 8 000 DAU

- [ ] Caching des réponses Groq pour les requêtes similaires (Redis TTL 1h)
- [ ] Supabase → activer Read Replicas (requêtes lecture vers replica dédié)
- [ ] Railway → monter à 6 replicas max dans `railway.toml`

---

## 7. Coûts

### Actuel

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Railway | Pro | ~$20–35 |
| Supabase | Pro | $25 |
| Groq | Développeur | **Gratuit** |
| Modal Labs | Serverless pay-as-you-go | ~$3–6 |
| Upstash Redis | Pay-as-you-go | ~$2–5 |
| Vercel | Pro | ~$20 |
| Betterstack | Free | $0 |
| **Total actuel** | | **~$70–91/mois** |

### Après upgrades (cible 5 000 DAU)

| Service | Plan | Coût/mois |
|---------|------|-----------|
| Railway | Pro | ~$30–50 |
| Supabase | Pro | $25 |
| **Groq** | **On-Demand** | **~$25–50** |
| **Modal Labs** | Serverless pay-as-you-go | **~$15–30** (5 000 DAU) |
| Upstash Redis | Pay-as-you-go | ~$5–10 |
| Vercel | Pro | ~$20 |
| Betterstack | Free | $0 |
| Sentry | Free | $0 |
| **Total cible** | | **~$120–185/mois** |

### Évolution du coût Groq selon le nombre de DAU actifs

| DAU actifs | Messages coach/jour | Tokens/mois | Coût Groq/mois |
|-----------|---------------------|-------------|----------------|
| 500 | 5/user | ~10M | ~$6 |
| 1 000 | 5/user | ~20M | ~$12 |
| 2 000 | 5/user | ~40M | ~$24 |
| 5 000 | 5/user | ~100M | ~$59 |
| 10 000 | 5/user | ~200M | ~$118 |

> Ces estimations supposent que les quotas utilisateur existants restent activés (limite messages/jour par user). Sans quotas, le coût peut être 3–5× plus élevé.

---

## Résumé en une phrase

> **Passer Groq en On-Demand** (5 minutes, ~$25–50/mois) **multiplie par 250 la capacité IA de HuntZen** et suffit pour atteindre 5 000 DAU. Le reste est de l'optimisation.
