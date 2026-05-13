# Guide d'Utilisation Docker - HuntZen JobSearch

Guide complet pour lancer et gérer le projet avec Docker.

---

## Prérequis

- Docker Desktop installé et lancé
- Fichier `.env` configuré à la racine du projet
- Ports 3000 et 8000 disponibles

---

## Option 1 : Lancer tout avec Docker Compose (recommandé)

```bash
# 1. Vérifier que le fichier .env existe à la racine
ls -la .env

# 2. Build les images (première fois ou après changements)
docker compose build --no-cache

# 3. Lancer backend + frontend ensemble
docker compose up

# OU en background (détaché)
docker compose up -d

# 4. Voir les logs
docker compose logs -f

# 5. Arrêter tout
docker compose down
```

**Accès :**
- Frontend : http://localhost:3000
- Backend : http://localhost:8000
- API Docs : http://localhost:8000/docs

---

## Option 2 : Lancer backend et frontend séparément

### Backend uniquement

```bash
# Build l'image backend
docker compose build backend

# Lancer backend uniquement
docker compose up backend

# OU en background
docker compose up -d backend

# Vérifier les logs
docker compose logs -f backend
```

**Backend accessible sur :**
- API : http://localhost:8000
- Documentation : http://localhost:8000/docs

---

### Frontend uniquement

```bash
# Build l'image frontend
docker compose build frontend

# Lancer frontend uniquement
docker compose up frontend

# OU en background
docker compose up -d frontend

# Vérifier les logs
docker compose logs -f frontend
```

**Frontend accessible sur :** http://localhost:3000

---

## Option 3 : Build sans cache

```bash
# Si tu as modifié du code et veux rebuilder proprement
docker compose build --no-cache
docker compose up
```

**Utiliser quand :**
- Tu as modifié les Dockerfiles
- Tu as changé les dépendances (pyproject.toml, package.json)
- Tu rencontres des problèmes de cache

---

## Option 4 : Dev mode (hot reload)

C'est **déjà configuré** dans docker-compose.yml !

```bash
# Lancer en mode dev avec hot reload
docker compose up

# Maintenant tu peux modifier :
# - backend/src/ → Uvicorn recharge automatiquement
# - frontend-next/src/ → Next.js recharge automatiquement (si dev mode activé)
```

**Volumes montés pour hot reload :**
- `./backend/src` → `/app/src`
- `./backend/prompts` → `/app/prompts`
- `./backend/templates` → `/app/templates`
- `./backend/pyproject.toml` → `/app/pyproject.toml`

---

## Commandes utiles de debugging

### Voir l'état des conteneurs

```bash
# Voir les conteneurs actifs
docker compose ps

# Voir tous les conteneurs (actifs et arrêtés)
docker ps -a
```

---

### Accéder aux conteneurs

```bash
# Entrer dans le conteneur backend
docker compose exec backend bash

# Entrer dans le conteneur frontend
docker compose exec frontend sh

# Exécuter une commande dans le backend
docker compose exec backend python -c "print('Hello')"
```

---

### Voir les logs

```bash
# Voir les logs de tous les services
docker compose logs -f

# Voir les logs d'un service spécifique
docker compose logs backend
docker compose logs frontend

# Voir les logs en temps réel
docker compose logs -f backend

# Voir les dernières 100 lignes
docker compose logs --tail=100 backend
```

---

### Redémarrer les services

```bash
# Redémarrer un service
docker compose restart backend
docker compose restart frontend

# Redémarrer tous les services
docker compose restart
```

---

### Nettoyer Docker

```bash
# Arrêter tous les services
docker compose down

# Arrêter + supprimer volumes (⚠️ données perdues)
docker compose down -v

# Arrêter + supprimer images
docker compose down --rmi all

# Nettoyer TOUT Docker (attention!)
docker system prune -a
```

---

### Monitoring des ressources

```bash
# Voir l'utilisation CPU/RAM en temps réel
docker stats

# Voir l'utilisation d'un conteneur spécifique
docker stats huntzen-backend
docker stats huntzen-frontend
```

---

## Tests de vérification

### 1. Backend Health Check

```bash
# Via curl
curl http://localhost:8000/health

# Via browser
open http://localhost:8000/docs
```

**Réponse attendue :**
```json
{
  "status": "healthy"
}
```

---

### 2. Frontend Health Check

```bash
# Via curl
curl http://localhost:3000

# Via browser
open http://localhost:3000
```

**Réponse attendue :** Page HTML de la landing page

---

### 3. Test complet

```bash
# 1. Backend accessible
curl -f http://localhost:8000/health || echo "❌ Backend KO"

# 2. Frontend accessible
curl -f http://localhost:3000 || echo "❌ Frontend KO"

# 3. API Docs accessible
curl -f http://localhost:8000/docs || echo "❌ Docs KO"
```

---

## Troubleshooting

### Problème : Port déjà utilisé

```bash
# Trouver quel processus utilise le port 8000
lsof -i :8000

# Trouver quel processus utilise le port 3000
lsof -i :3000

# Tuer le processus
kill -9 <PID>
```

---

### Problème : Docker daemon not running

```bash
# Vérifier que Docker Desktop est lancé
docker info

# Si erreur, lancer Docker Desktop
open -a Docker
```

---

### Problème : Build échoue

```bash
# Nettoyer le cache Docker
docker builder prune -a

# Rebuild sans cache
docker compose build --no-cache

# Vérifier les logs de build
docker compose build backend 2>&1 | tee build.log
```

---

### Problème : Conteneur crash au démarrage

```bash
# Voir les logs du conteneur
docker compose logs backend

# Voir les dernières erreurs
docker compose logs --tail=50 backend

# Voir les logs en temps réel
docker compose logs -f backend
```

---

### Problème : Hot reload ne fonctionne pas

```bash
# Vérifier que les volumes sont bien montés
docker compose exec backend ls -la /app/src

# Redémarrer le service
docker compose restart backend
```

---

## Commandes avancées

### Rebuild un seul service

```bash
# Rebuild + restart backend uniquement
docker compose up -d --build backend

# Rebuild + restart frontend uniquement
docker compose up -d --build frontend
```

---

### Voir les variables d'environnement

```bash
# Voir les env variables du backend
docker compose exec backend env

# Voir les env variables du frontend
docker compose exec frontend env
```

---

### Inspecter les images

```bash
# Lister les images
docker images | grep huntzen

# Voir la taille des images
docker images --format "table {{.Repository}}\t{{.Size}}"

# Inspecter une image
docker inspect huntzen_jobsearch-backend
```

---

### Exporter/Sauvegarder les images

```bash
# Exporter l'image backend
docker save huntzen_jobsearch-backend:latest | gzip > backend.tar.gz

# Exporter l'image frontend
docker save huntzen_jobsearch-frontend:latest | gzip > frontend.tar.gz

# Charger une image sauvegardée
docker load < backend.tar.gz
```

---

## Workflow recommandé

### Développement quotidien

```bash
# 1. Lancer tout en background
docker compose up -d

# 2. Voir les logs en temps réel
docker compose logs -f

# 3. Développer normalement
# Les changements dans backend/src/ et frontend-next/src/ sont détectés automatiquement

# 4. Arrêter en fin de journée
docker compose down
```

---

### Après modification des dépendances

```bash
# 1. Arrêter les services
docker compose down

# 2. Rebuild sans cache
docker compose build --no-cache

# 3. Relancer
docker compose up -d
```

---

### Avant un commit

```bash
# 1. Vérifier que tout build proprement
docker compose build --no-cache

# 2. Lancer les tests
docker compose exec backend pytest tests/ -v

# 3. Vérifier les logs
docker compose logs backend | grep ERROR
docker compose logs frontend | grep ERROR
```

---

## Variables d'environnement requises

Fichier `.env` à la racine du projet :

```env
# Backend
GROQ_API_KEY=your_key_here
SUPABASE_URL=your_url_here
SUPABASE_KEY=your_key_here
SUPABASE_JWT_SECRET=your_secret_here

# Frontend
NEXT_PUBLIC_SUPABASE_URL=your_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key_here
NEXT_PUBLIC_API_URL=http://localhost:8000

# Stripe
STRIPE_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Sentry (optionnel)
SENTRY_DSN=your_dsn_here
NEXT_PUBLIC_SENTRY_DSN=your_dsn_here

# Redis (optionnel)
UPSTASH_REDIS_REST_URL=your_url_here
UPSTASH_REDIS_REST_TOKEN=your_token_here
```

---

## Déploiement en production

Pour déployer en production, voir [DEPLOYMENT.md](./DEPLOYMENT.md).

**Stack de production :**
- Frontend : Vercel
- Backend : Modal Labs
- Database : Supabase Pro
- Additional Services : Railway Pro
- Storage : AWS S3

---

## Support

En cas de problème :
1. Vérifier les logs : `docker compose logs -f`
2. Vérifier le fichier `.env`
3. Rebuild sans cache : `docker compose build --no-cache`
4. Consulter [CONTRIBUTING.md](./CONTRIBUTING.md)

---

**Dernière mise à jour :** 2026-02-06
**Docker Compose version :** 2.x
**Docker version :** 20.x+
