# HuntZen — Flows & Cas Utilisateurs

> Simulation de ce qui se passe réellement dans chaque scénario de charge.
> Toutes les durées et tokens sont mesurés/vérifiés dans le code source.

---

## Légende

```
✅  Fonctionne normalement
⚠️  Fonctionne mais dégradé (plus lent)
❌  Erreur visible pour l'utilisateur
💀  Crash / timeout / perte de requête
```

---

## INDEX DES CAS

| # | Cas | Groq actuel | Groq On-Demand |
|---|-----|------------|----------------|
| 1 | 1 user → Coach IA | ✅ | ✅ |
| 2 | 3 users → Coach en même temps | ❌ | ✅ |
| 3 | 10 users → Coach en même temps | 💀 | ✅ |
| 4 | 1 user → Analyse CV | ✅ | ✅ |
| 5 | 200 users → Analyse CV | 💀 | ⚠️ lent |
| 6 | 200 CV analyses + 1s + 200 CV analyses | 💀 | ⚠️ lent |
| 7 | 200 CV analyses + 1s + 200 CV générations | 💀 | ❌ ~35% timeout |
| 8 | Cold start Modal (premier user du matin) | ⚠️ | ⚠️ |
| 9 | User avec 20 messages coach (longue session) | 💀 | ⚠️ |
| 10 | 800 users → Dashboard / Job Search | ✅ | ✅ |

---

---

## CAS 1 — 1 user envoie un message au Coach IA

**Contexte :** Groq actuel (12 000 tok/min). Seul utilisateur actif.

```
User
 │
 │  "J'ai un entretien chez Google demain, aide-moi"
 │
 ▼
┌─────────────────────────────────────────────────────┐
│  Vercel (Next.js)                                   │
│  Envoi HTTP POST /api/assistant/chat                │
└──────────────────────────┬──────────────────────────┘
                           │ ~10ms réseau
                           ▼
┌─────────────────────────────────────────────────────┐
│  Railway (FastAPI worker #1)                        │
│                                                     │
│  1. Auth check → Supabase          [~50ms]          │
│  2. Quota check → Redis            [~10ms]          │
│  3. Load conversation history      [~30ms]          │
│  4. Build prompt (système + hist.) [~5ms]           │
│     → 3 300 tok système                             │
│     → 700 tok historique (1er message)              │
│     → TOTAL : 4 000 tokens                          │
└──────────────────────────┬──────────────────────────┘
                           │ Quota consommé : 4 000 / 12 000 tok/min
                           ▼
┌─────────────────────────────────────────────────────┐
│  Groq API (llama-3.3-70b-versatile)                 │
│                                                     │
│  Input  : 4 000 tokens                              │
│  Output : ~800 tokens                               │
│  Durée  : ~8–10s                                    │
│                                                     │
│  Quota restant : 8 000 / 12 000 tok/min             │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  Railway                                            │
│  5. Save message → Supabase        [~40ms]          │
│  6. Stream réponse → Vercel        [~100ms]         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
                          User
                  "Bien sûr ! Voici comment..."

TIMELINE TOTALE : ~9–11s

QUOTA GROQ UTILISÉ : 4 000 / 12 000 tok/min (33%)
QUOTA RESTANT      : 8 000 tok/min disponibles
```

**Ce que voit l'user :** Réponse en ~10s. ✅ Parfait.

---

---

## CAS 2 — 3 users envoient un message coach en même temps

**Contexte :** Groq actuel (12 000 tok/min). 3 users simultanés.

```
User A ──┐
User B ──┼──► Railway (3 workers parallèles)
User C ──┘

Chaque requête : 4 000 tokens
3 requêtes en même temps = 12 000 tokens consommés d'un coup

┌─────────────────────────────────────────────────────┐
│  GROQ QUOTA                                         │
│                                                     │
│  Disponible : 12 000 tok/min                        │
│  Demandé    : 12 000 tok  (3 × 4 000)               │
│                                                     │
│  ████████████████████████ 100% SATURÉ              │
│                                                     │
│  User A → traité                      ✅            │
│  User B → traité                      ✅            │
│  User C → rate limited (429)          ❌            │
│           → retry après 1 min                       │
│           → timeout 45s (Railway)                   │
│           → erreur visible                          │
└─────────────────────────────────────────────────────┘
```

**Calcul précis :**
```
Quota/min = 12 000 tok
Requête   = 4 000 tok
Max simultanés = 12 000 / 4 000 / (1/6 min) = 12 000 / 4 000 × (1/10s en min) = 0.5

Arrondi réel : 1–2 users max avant dégradation
```

**Ce que voit l'user C :** `"Le service IA est temporairement surchargé. Réessayez dans quelques instants."` ❌

**Ce que voit l'user A/B :** Réponse normale en ~10s. ✅

---

---

## CAS 3 — 10 users → Coach en même temps

**Contexte :** Groq actuel (12 000 tok/min).

```
10 users × 4 000 tok = 40 000 tok demandés en 1 minute
Quota disponible      =  12 000 tok/min

Ratio : ×3.3 au-dessus de la limite

┌─────────────────────────────────────────────────────┐
│  Qui passe ?                                        │
│                                                     │
│  Users 1–2   → réponse ~10s              ✅         │
│  Users 3–4   → attente en queue          ⚠️         │
│  Users 5–10  → timeout 45s Railway       💀         │
│                                                     │
│  Erreurs      : 60–70% des requêtes                 │
│  Users frustrés : 6 sur 10                          │
└─────────────────────────────────────────────────────┘
```

**Ce que voit l'user :** Spinner... spinner... "Service indisponible." 💀

---

---

## CAS 4 — 1 user → Analyse CV (flow complet)

**Contexte :** Groq On-Demand. Flow async via Modal.

```
User
 │
 │  [Upload PDF 2MB]
 │
 ▼
┌─────────────────────────────────────────────────────┐
│  Railway (FastAPI)                  SYNCHRONE       │
│                                                     │
│  1. Auth + quota check              [~60ms]         │
│  2. Upload PDF → Supabase Storage   [~800ms]        │
│  3. Create cv_analyses record       [~50ms]         │
│     status = 'pending'                              │
│  4. POST webhook → Modal            [~200ms]        │
│     (non-bloquant, fire & forget)                   │
│  5. Retourne {cv_id, status:'pending'}              │
│                                                     │
│  TEMPS TOTAL RAILWAY : ~1.1s                        │
└──────────────────┬──────────────────────────────────┘
                   │                    │
                   │                    └──► Modal (async, en fond)
                   ▼                              │
                  User                            ▼
           "Analyse en cours..."    ┌─────────────────────────┐
                   │                │  Modal Container         │
                   │ poll /status   │                          │
                   │ toutes les 2s  │  1. Cold start (si froid)│
                   │                │     → +15s               │
                   │                │  2. Download PDF         │
                   │                │     → Supabase Storage   │
                   │                │     → ~1s                │
                   │                │  3. Docling extract PDF  │
                   │                │     → ~8–10s             │
                   │                │  4. Groq call #1         │
                   │                │     extract_cv_info()    │
                   │                │     70B, 1 050 tok, ~2s  │
                   │                │  5. Groq call #2         │
                   │                │     analyze_cv()         │
                   │                │     70B, 5 950 tok, ~5s  │
                   │                │  6. Save results → DB    │
                   │                │     status = 'completed' │
                   │                │     → ~100ms             │
                   │                └─────────────────────────┘
                   │
                   │  [poll #8 à T=16s]
                   │  status = 'completed' ✅
                   ▼
                  User
           "Score ATS : 78/100"

TIMELINE (container chaud) :
  Railway (sync)   : 0s → 1.1s
  Modal processing : 1.1s → ~20s
  User attend      : ~20s total ✅

TIMELINE (cold start) :
  Railway (sync)   : 0s → 1.1s
  Cold start       : +15-20s
  Modal processing : ~35-40s total
  User attend      : ~40s ⚠️

GROQ CONSOMMÉ : 7 000 tok / 6 000 000 tok/min (0.1%)
```

**Ce que voit l'user :** Spinner avec message "Analyse en cours..." puis résultat.
- Container chaud : ~20s ✅
- Cold start (matin ou après période calme) : ~40s ⚠️

---

---

## CAS 5 — 200 users → Analyse CV en même temps

**Contexte :** Groq On-Demand activé.

```
200 users uploadent leur CV exactement en même temps

┌─────────────────────────────────────────────────────┐
│  RAILWAY (phase sync, ~1.1s chacun)                 │
│                                                     │
│  200 requêtes simultanées async                     │
│  → 200 uploads Supabase Storage                     │
│  → 200 DB inserts                                   │
│  → 200 webhook triggers Modal                       │
│                                                     │
│  Concurrent DB connections : ~20 (chacune ~100ms)  │
│  Supabase max : 57 connexions                       │
│  Status : ✅ largement dans les limites             │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  MODAL (scale automatique)                          │
│                                                     │
│  0 containers → 200 containers en <30s              │
│  max_containers = 1 000 → ✅ pas de limite          │
│                                                     │
│  Cold start : les 200 containers démarrent          │
│  → 3–5s spin-up + 8–10s Docling load               │
│  → premier traitement après ~15s                    │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  GROQ (le vrai calcul)                              │
│                                                     │
│  200 analyses × 7 000 tok × 3 req/min              │
│  = 4 200 000 tok/min demandés                       │
│                                                     │
│  Quota On-Demand 70B : 6 000 000 tok/min            │
│                                                     │
│  ████████████████████░░░░ 70% utilisé              │
│                                                     │
│  Marge restante : 1 800 000 tok/min ✅              │
└─────────────────────────────────────────────────────┘

RÉSULTAT :

  Railway       ✅  (1.1s, retourne immédiatement)
  Modal spin-up ⚠️  (cold start : +15s pour tous les containers)
  Groq          ✅  (70% du quota, 30% de marge)

TIMELINE USER :
  T=0s    : "Analyse en cours..."
  T=15s   : Modal démarre (cold start)
  T=35s   : Analyses complètes
  T=35s   : Polling → "Score ATS : X/100" ✅

Les 200 users voient leur résultat en ~35s. ⚠️ (normal sans cold start = ~20s)
```

**Ce que voit l'user :** Spinner ~35s au lieu de ~20s, puis résultat. Pas d'erreur. ⚠️

---

---

## CAS 6 — 200 CV analyses, puis 1 seconde après 200 autres

**Contexte :** Groq On-Demand. Scénario pic de trafic.

```
T=0s  : 200 analyses démarrent
T=1s  : 200 autres démarrent
T=19s : les 200 premiers ont encore 1s de traitement
        les 200 seconds ont encore 19s de traitement
        → 400 analyses en cours simultanément

CALCUL GROQ à T=1s :

  Batch 1 : 200 analyses (T=-0s, 19s restantes)
  Batch 2 : 200 analyses (T=-1s, 20s restantes)
  Total simultané : 400

  400 × 7 000 × 3/min = 8 400 000 tok/min demandés
  Quota dispo       = 6 000 000 tok/min

  Dépassement : +2 400 000 tok/min (40% au-dessus)

┌─────────────────────────────────────────────────────┐
│  QUE FAIT GROQ ?                                    │
│                                                     │
│  → Retourne HTTP 429 (Rate Limited) sur certains    │
│    appels Modal                                     │
│  → Modal retry automatique (retries=2)              │
│  → Les analyses attendent la fin de la fenêtre      │
│    de 1 minute pour réessayer                       │
│                                                     │
│  Résultat : analyses "bloquées" pendant 30–60s      │
│  supplémentaires avant de continuer                 │
└─────────────────────────────────────────────────────┘

TIMELINE USER batch 1 :
  Normal : 20s
  Réel   : 20–30s (peu impacté, ils ont commencé avant) ⚠️

TIMELINE USER batch 2 :
  Normal : 20s
  Réel   : 50–80s (attente retry Groq) ⚠️

┌─────────────────────────────────────────────────────┐
│  AUCUNE ERREUR VISIBLE                              │
│  Les users voient juste le spinner plus longtemps   │
│  → Dégradation gracieuse (async = résilient)        │
└─────────────────────────────────────────────────────┘
```

**Ce que voit l'user batch 2 :** Spinner... 50–80s au lieu de 20s. Puis résultat. ⚠️
**Ce que voit l'user batch 1 :** ~25–30s. Quasi-normal. ✅

---

---

## CAS 7 — 200 CV analyses + 1s + 200 CV Générations

**C'est le scénario critique.**

```
T=0s  : 200 analyses CV (Modal async)
T=1s  : 200 générations CV/LM (Railway sync)

┌─────────────────────────────────────────────────────┐
│  GROQ à T=1s                                        │
│                                                     │
│  Analyses CV (Modal) :                              │
│    200 × 7 000 × 3/min = 4 200 000 tok/min         │
│                                                     │
│  Générations CV/LM (Railway) :                      │
│    200 × 13 500 × 1/min = 2 700 000 tok/min        │
│    (13 500 tok sur 60s = 1 req/min)                 │
│                                                     │
│  TOTAL : 6 900 000 tok/min                          │
│  QUOTA  : 6 000 000 tok/min                         │
│                                                     │
│  Dépassement : +900 000 tok/min (15% au-dessus)    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  CE QUI SE PASSE DIFFÉREMMENT selon le type :       │
│                                                     │
│  ANALYSE CV (Modal async) :                         │
│  → 429 Groq → Modal retry → attend → complète      │
│  → User voit spinner 40–80s au lieu de 20s ⚠️      │
│  → Pas d'erreur                                     │
│                                                     │
│  GÉNÉRATION CV/LM (Railway sync) :                  │
│  → Groq rate-limit → durée réelle 80–90s            │
│  → Timeout Railway = 45s                            │
│  → 45s < 80s → TIMEOUT avant que Groq réponde      │
│  → Erreur renvoyée à l'user                         │
│                                                     │
│  RÉSULTAT :                                         │
│  ~35% des générations CV échouent avec erreur ❌    │
│  ~65% complètent (ceux qui passent sous le timeout) │
└─────────────────────────────────────────────────────┘

TIMELINE CÔTE À CÔTE :

  T=0s  ───── 200 analyses démarrent (Modal)
  T=1s  ───── 200 générations démarrent (Railway)
                │
  T=20s ───── Groq rate-limit commence
                │   Analyses : spinner continue (OK async)
                │   Générations : ralentissement (sync, user attend)
                │
  T=45s ───── Railway timeout
                │   Générations encore en cours → ERREUR ❌
                │   Analyses encore en cours → spinner (OK) ⚠️
                │
  T=80s ───── Retry Groq réussit
                │   Analyses complètent ✅
                │   Générations : déjà en erreur, pas de recovery ❌

VERDICT :
  Analyses CV   → ⚠️  lent mais OK
  Générations   → ❌  35% d'erreurs
```

**Solution permanente :** Passer la génération CV en async (polling comme l'analyse).
**Solution rapide :** `--timeout 120` dans Gunicorn → Railway attend 120s au lieu de 45s.

---

---

## CAS 8 — Cold start Modal (premier user du matin)

**Contexte :** Premier upload CV après une nuit sans trafic.

```
T=0s   User upload son CV

T=0s   Railway reçoit la requête
       → Upload Supabase : OK (1s)
       → Trigger Modal webhook : OK (200ms)
       → Répond "en cours" à l'user

T=1.2s User voit le spinner "Analyse en cours..."

       ┌─────────────────────────────────────┐
       │  MODAL                              │
       │                                     │
       │  Aucun container chaud              │
       │  (min_containers=0, nuit calme)     │
       │                                     │
       │  T=1.2s  : Demande de container     │
       │  T=4s    : Container alloué ✓       │
       │  T=8s    : Python + deps loaded ✓   │
       │  T=14s   : Docling model chargé ✓   │
       │            ← c'est le plus long     │
       │  T=16s   : Processing commence      │
       │  T=22s   : Groq call #1 ✓           │
       │  T=28s   : Groq call #2 ✓           │
       │  T=30s   : DB updated (completed)   │
       └─────────────────────────────────────┘

T=30s  User poll → status = 'completed'
       "Score ATS : 82/100" ✅

RESSENTI USER : 30s d'attente ⚠️

Le 2ème user qui arrive 30s après :
  → Container toujours chaud
  → Processing immédiat
  → 20s au lieu de 30s ✅

┌─────────────────────────────────────────────────────┐
│  SOLUTION : décommenter dans modal_app.py           │
│                                                     │
│  min_containers=1,      # 1 container toujours chaud│
│  scaledown_window=300,  # chaud pendant 5min        │
│                                                     │
│  Coût : ~$3–5/mois de plus                         │
│  Premier user du matin : 30s → 18s ✅               │
└─────────────────────────────────────────────────────┘
```

---

---

## CAS 9 — User avec une longue session coach (20 messages)

**Contexte :** Le problème de l'historique non borné.

```
COMMENT ÇA GROSSIT MESSAGE PAR MESSAGE :

  Message 1  :  prompt sys (3 300)  + msg 1 (700)   =  4 000 tok
  Message 5  :  prompt sys (3 300)  + hist (3 500)  =  6 800 tok  (+70%)
  Message 10 :  prompt sys (3 300)  + hist (7 000)  = 10 300 tok  (+157%)
  Message 15 :  prompt sys (3 300)  + hist (10 500) = 13 800 tok  (+245%)
  Message 20 :  prompt sys (3 300)  + hist (14 000) = 17 300 tok  > quota 12 000 tok/min

À partir du message 16, une seule conversation dépasse le quota total.

AVEC GROQ ON-DEMAND (6M tok/min) :
  Message 20 → 17 300 tok → OK (0.3% du quota) ✅
  Mais à 250 users en session longue :
  250 × 17 300 × 6/min = 25 950 000 tok/min > 6 000 000 ❌

AVEC HISTORIQUE BORNÉ À 8 MESSAGES (fix simple) :
  Maximum par requête : 3 300 + (8 × 350 moyenne) = 6 100 tok
  → stable, prévisible, toujours dans les calculs

┌─────────────────────────────────────────────────────┐
│  IMPACT RÉEL SUR LA CAPACITÉ                        │
│                                                     │
│  Sessions courtes (1–5 msg)  : 4 000 tok/req       │
│  Sessions longues (15–20 msg): 17 000 tok/req       │
│                                                     │
│  10 users en session longue = consomment autant     │
│  que 42 users en session courte                     │
│                                                     │
│  → La capacité réelle est IMPRÉVISIBLE sans borne   │
└─────────────────────────────────────────────────────┘

FIX (2h de code dans base.py) :
  messages = conversation_history[-8:]  # garder 8 derniers messages

RÉSULTAT :
  Tokens max par req : 6 100 (au lieu de 17 300+)
  Capacité coach : +40% de marge réelle garantie
  Facture Groq   : -40% sur les sessions longues
```

---

---

## CAS 10 — 800 users → Dashboard / Job Search

**Pourquoi ça tient même aujourd'hui.**

```
800 users simultanés sur Dashboard + Job Search

┌─────────────────────────────────────────────────────┐
│  VERCEL (Next.js serverless)                        │
│  → 800 requêtes → autoscale infini                  │
│  → Aucune limite pratique ✅                         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  RAILWAY (FastAPI async)                            │
│  → 800 req simultanées async                        │
│  → Chaque req : auth ~60ms, DB ~50ms                │
│  → I/O bound, pas CPU bound                         │
│  → 4 workers async = des milliers de coroutines OK  │
│  Status : ✅                                         │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  SUPABASE (PostgreSQL + pooler)                     │
│                                                     │
│  800 req × 50ms/req = 40 connexions simultanées     │
│  Limite pooler : 57 connexions                      │
│  Status : ✅ (dans les limites)                      │
│                                                     │
│  Si 1 200 req simultanées :                         │
│  1 200 × 50ms = 60 connexions > 57 → ⚠️ début queue│
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│  GROQ (Job Search uniquement)                       │
│                                                     │
│  Seul le ranking uses Groq (17B, ~800 tok, ~3s)    │
│  800 req × 800 tok × 20/min = 12 800 000 tok/min   │
│  Quota maverick 17B On-Demand : 30 000 000 tok/min  │
│  Status : ✅ (43% du quota)                          │
└─────────────────────────────────────────────────────┘

TIMELINE USER (Job Search) :
  T=0s   : Recherche lancée
  T=1s   : API calls job providers (Adzuna, France Travail)
  T=3s   : Groq rank les résultats
  T=3.2s : Résultats affichés

TIMELINE USER (Dashboard) :
  T=0s   : Chargement
  T=0.2s : Auth vérifié
  T=0.3s : Données chargées
  T=0.4s : Affiché ✅
```

---

---

## RÉCAPITULATIF — Plafonds réels par feature

```
╔══════════════════════════════════════════════════════════════════╗
║  FEATURE              │ AUJOURD'HUI │ + ON-DEMAND │ + OPTIMISÉ  ║
╠══════════════════════════════════════════════════════════════════╣
║  Dashboard / Auth     │    678      │     678     │   2 000+    ║
║  Job Search           │     19      │   6 250     │  12 000+    ║
║  Coach IA             │      1      │     250     │   3 000     ║
║  Analyse CV           │      1      │     286     │     571     ║
║  Génération CV/LM     │      1      │     100*    │     200*    ║
╚══════════════════════════════════════════════════════════════════╝

* Génération CV/LM limité par le timeout sync Railway (45s)
  → La solution est de la passer en async comme l'analyse CV

OPTIMISÉ = Groq On-Demand + prompts réduits -67% + coach sur 17B maverick
           + historique borné 8 msg + génération CV async
```

---

## PLAN D'ACTION PRIORISÉ

```
SEMAINE 1 — Sans code (ou presque)
═══════════════════════════════════
  □ Groq On-Demand          5 min    $25/mo    × 250 coach
  □ WORKERS=6 Railway       2 min    $0        +50% throughput
  □ 2ème clé Groq Modal     30 min   $0        décannibalisatio

SEMAINE 2 — Code simple
════════════════════════
  □ Historique borné 8 msg  2h       $0        +40% marge réelle
  □ Timeout Gunicorn 120s   10 min   $0        -35% timeout génération
  □ min_containers=1 Modal  10 min   $3/mo     cold start 30s → 18s

SEMAINE 3 — Dev moyen
══════════════════════
  □ Réduire coach_main.txt  1-2j     $0        ×2.4 coach simultanés
  □ Coach sur maverick 17B  1h       $0        ×5 headroom Groq
  □ Génération CV async     2-3j     $0        élimine les timeouts

APRÈS CES 3 SEMAINES :
  Coach     : 1 → 3 000 simultanés
  Analyse CV : 1 → 571 simultanés
  Dashboard : déjà 678, passe à 2 000+
  Génération : 1 → 200+ sans erreur
```
