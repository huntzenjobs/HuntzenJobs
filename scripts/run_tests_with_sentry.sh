#!/usr/bin/env bash
# ============================================================
# run_tests_with_sentry.sh
#
# Lance les tests prod ET récupère les events Sentry en temps réel.
#
# Usage :
#   ./scripts/run_tests_with_sentry.sh                              # tous les tests prod
#   ./scripts/run_tests_with_sentry.sh tests/integration/test_cv_pdf_prod.py
#   ./scripts/run_tests_with_sentry.sh tests/load/ -k stress_coach
#
# Prérequis :
#   export SENTRY_AUTH_TOKEN=sntrys_...
#   export TEST_AUTH_TOKEN=eyJ...
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "$PROJECT_ROOT"

# ── Couleurs ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# ── Vérifications ─────────────────────────────────────────────────────────────
if [ -z "${TEST_AUTH_TOKEN:-}" ]; then
    echo -e "${YELLOW}⚠️  TEST_AUTH_TOKEN non configuré — les tests prod seront skippés${NC}"
    echo "   Configurez : export TEST_AUTH_TOKEN=eyJ..."
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
    echo -e "${YELLOW}⚠️  SENTRY_AUTH_TOKEN non configuré — le rapport Sentry sera désactivé${NC}"
    echo "   Configurez : export SENTRY_AUTH_TOKEN=sntrys_..."
    echo "   Générez sur : https://sentry.io/settings/account/api/auth-tokens/"
fi

# ── Variables d'environnement ─────────────────────────────────────────────────
export PROD_URL="${PROD_URL:-https://huntzenjobs-production.up.railway.app}"
export SENTRY_ORG="${SENTRY_ORG:-huntzen}"
export SENTRY_PROJECT="${SENTRY_PROJECT:-javascript-nextjs}"
export SENTRY_BASE_URL="${SENTRY_BASE_URL:-https://de.sentry.io}"

# ── Cibles de test ────────────────────────────────────────────────────────────
TEST_TARGETS="${@:-tests/integration/ tests/unit/ tests/load/}"

echo ""
echo -e "${BOLD}${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${BLUE}║        HuntZen — Tests Prod + Monitoring Sentry              ║${NC}"
echo -e "${BOLD}${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}URL prod${NC}     : $PROD_URL"
echo -e "  ${BOLD}Sentry org${NC}   : $SENTRY_ORG / $SENTRY_PROJECT"
echo -e "  ${BOLD}Tests cibles${NC} : $TEST_TARGETS"
echo ""

# ── Heure de début (pour filtrer Sentry) ─────────────────────────────────────
START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} Démarrage des tests..."
echo ""

# ── Activation du venv ────────────────────────────────────────────────────────
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

# ── Lancement des tests avec le plugin Sentry ────────────────────────────────
set +e
python -m pytest \
    $TEST_TARGETS \
    -p tests.sentry_reporter \
    --noconftest \
    --override-ini="addopts=" \
    -v \
    --timeout=120 \
    --tb=short \
    --no-header \
    -rN \
    2>&1 | tee /tmp/pytest_output_$$.txt
PYTEST_EXIT=$?
set -e

echo ""

# ── Récupération Sentry via CLI (complément au plugin pytest) ─────────────────
if [ -n "${SENTRY_AUTH_TOKEN:-}" ] && command -v sentry-cli &>/dev/null; then
    echo -e "${BOLD}${BLUE}══ Sentry CLI — Issues depuis $START_TIME ════════════════════════${NC}"
    echo ""

    # Configurer sentry-cli temporairement via variables d'env
    export SENTRY_AUTH_TOKEN
    export SENTRY_URL="$SENTRY_BASE_URL"

    sentry-cli --url https://sentry.io issues list \
        --org "$SENTRY_ORG" \
        --project "$SENTRY_PROJECT" \
        --query "lastSeen:>$START_TIME" \
        --max-rows 20 \
        2>/dev/null || echo "(sentry-cli: aucune issue ou erreur de config)"

    echo ""
fi

# ── Résumé final ──────────────────────────────────────────────────────────────
TOTAL_TESTS=$(grep -E "^(PASSED|FAILED|ERROR|SKIPPED)" /tmp/pytest_output_$$.txt 2>/dev/null | wc -l || echo "?")
FAILED_TESTS=$(grep -E "^FAILED" /tmp/pytest_output_$$.txt 2>/dev/null | wc -l || echo "0")
PASSED_TESTS=$(grep -E "^PASSED" /tmp/pytest_output_$$.txt 2>/dev/null | wc -l || echo "0")

rm -f /tmp/pytest_output_$$.txt

echo -e "${BOLD}══ Résumé ═══════════════════════════════════════════════════════${NC}"
echo -e "  Tests passés  : ${GREEN}${PASSED_TESTS}${NC}"
echo -e "  Tests échoués : $([ "$FAILED_TESTS" -gt 0 ] && echo -e "${RED}${FAILED_TESTS}${NC}" || echo -e "${GREEN}${FAILED_TESTS}${NC}")"
echo -e "  Exit code     : $PYTEST_EXIT"
echo ""

exit $PYTEST_EXIT
