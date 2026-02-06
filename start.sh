#!/bin/bash

# ============================================
# HuntZen JobSearch - Docker Launcher
# ============================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🚀 HuntZen JobSearch - Docker        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Help
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo -e "${CYAN}Usage:${NC} ./start.sh [command]"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo -e "  ${GREEN}(none)${NC}    Start all services (default)"
    echo -e "  ${GREEN}build${NC}    Rebuild and start"
    echo -e "  ${GREEN}stop${NC}     Stop all services"
    echo -e "  ${GREEN}logs${NC}     Show logs"
    echo -e "  ${GREEN}status${NC}   Show service status"
    echo -e "  ${GREEN}clean${NC}    Stop and remove containers/volumes"
    echo ""
    echo -e "${CYAN}Services:${NC}"
    echo -e "  Frontend:  http://localhost:3000"
    echo -e "  Backend:   http://localhost:8000"
    echo -e "  API Docs:  http://localhost:8000/docs"
    exit 0
fi

# Check .env file
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠ Fichier .env manquant${NC}"
    if [ -f ".env.example" ]; then
        echo -e "${YELLOW}  Copie de .env.example → .env${NC}"
        cp .env.example .env
        echo -e "${RED}  ⚠ Configurez vos clés API dans .env avant de continuer${NC}"
        echo ""
        echo -e "${CYAN}Variables requises:${NC}"
        echo "  - NEXT_PUBLIC_SUPABASE_URL"
        echo "  - NEXT_PUBLIC_SUPABASE_ANON_KEY"
        echo "  - GROQ_API_KEY"
        echo ""
        exit 1
    else
        echo -e "${RED}✗ Fichier .env.example introuvable${NC}"
        exit 1
    fi
fi

# Commands
case "$1" in
    build)
        echo -e "${BLUE}Building and starting services...${NC}"
        docker compose up --build
        ;;
    stop)
        echo -e "${YELLOW}Stopping services...${NC}"
        docker compose down
        echo -e "${GREEN}✓ Services stopped${NC}"
        ;;
    logs)
        docker compose logs -f
        ;;
    status)
        echo -e "${CYAN}Service Status:${NC}"
        docker compose ps
        echo ""
        echo -e "${CYAN}Health Checks:${NC}"
        curl -s http://localhost:8000/health 2>/dev/null && echo "" || echo -e "${RED}Backend: unreachable${NC}"
        curl -s http://localhost:3000 >/dev/null 2>&1 && echo -e "${GREEN}Frontend: healthy${NC}" || echo -e "${RED}Frontend: unreachable${NC}"
        ;;
    clean)
        echo -e "${YELLOW}Cleaning up...${NC}"
        docker compose down -v --rmi local
        echo -e "${GREEN}✓ Cleaned${NC}"
        ;;
    *)
        # Default: start services
        echo -e "${BLUE}Starting services...${NC}"
        echo ""

        # Check Docker
        if ! command -v docker &> /dev/null; then
            echo -e "${RED}✗ Docker not found. Please install Docker.${NC}"
            exit 1
        fi

        if ! docker info &> /dev/null; then
            echo -e "${RED}✗ Docker daemon not running. Start Docker Desktop.${NC}"
            exit 1
        fi

        docker compose up --build -d

        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║   ✓ HuntZen is starting!               ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "   ${BLUE}Frontend:${NC}  http://localhost:3000"
        echo -e "   ${BLUE}Backend:${NC}   http://localhost:8000"
        echo -e "   ${BLUE}API Docs:${NC}  http://localhost:8000/docs"
        echo ""
        echo -e "   ${CYAN}View logs:${NC}    ./start.sh logs"
        echo -e "   ${CYAN}Stop:${NC}         ./start.sh stop"
        echo -e "   ${CYAN}Status:${NC}       ./start.sh status"
        echo ""
        echo -e "${YELLOW}Starting containers (may take 1-2 min first time)...${NC}"

        # Wait for services
        echo -ne "   Backend: "
        for i in {1..60}; do
            if curl -s http://localhost:8000/health >/dev/null 2>&1; then
                echo -e "${GREEN}✓ ready${NC}"
                break
            fi
            echo -n "."
            sleep 2
        done

        echo -ne "   Frontend: "
        for i in {1..30}; do
            if curl -s http://localhost:3000 >/dev/null 2>&1; then
                echo -e "${GREEN}✓ ready${NC}"
                break
            fi
            echo -n "."
            sleep 2
        done

        echo ""
        echo -e "${GREEN}🎉 Open http://localhost:3000 in your browser${NC}"
        ;;
esac
