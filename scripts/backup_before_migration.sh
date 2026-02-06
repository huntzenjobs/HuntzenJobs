#!/bin/bash
# ============================================
# HuntZen JobSearch - Pre-Migration Backup Script
# Sprint 6 - Ticket S6-2
# ============================================
# Purpose: Create database backup before running migrations
# Author: HuntZen Team
# Date: 2026-01-28
#
# Usage:
#   ./scripts/backup_before_migration.sh subscription_infrastructure
#
# Requirements:
#   - PostgreSQL client tools (pg_dump, pg_restore)
#   - Supabase database credentials in .env
#   - Write access to backups/ directory
# ============================================

set -e  # Exit on error
set -u  # Exit on undefined variable

# ============================================
# CONFIGURATION
# ============================================

MIGRATION_NAME="${1:-unnamed_migration}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
BACKUP_FILE="${BACKUP_DIR}/backup_${MIGRATION_NAME}_${TIMESTAMP}.dump"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============================================
# FUNCTIONS
# ============================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    # Check if pg_dump is installed
    if ! command -v pg_dump &> /dev/null; then
        log_error "pg_dump not found. Install PostgreSQL client tools."
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f .env ]; then
        log_error ".env file not found. Create it with DATABASE_URL."
        exit 1
    fi

    # Load environment variables
    export $(grep -v '^#' .env | xargs)

    # Check if DATABASE_URL is set
    if [ -z "${DATABASE_URL:-}" ]; then
        log_error "DATABASE_URL not set in .env file."
        exit 1
    fi
}

create_backup_dir() {
    if [ ! -d "$BACKUP_DIR" ]; then
        mkdir -p "$BACKUP_DIR"
        log_info "Created backup directory: $BACKUP_DIR"
    fi
}

perform_backup() {
    log_info "Starting backup for migration: $MIGRATION_NAME"
    log_info "Backup file: $BACKUP_FILE"

    # Extract connection details from DATABASE_URL
    # Format: postgresql://user:password@host:port/database

    # Perform backup using custom format (allows parallel restore)
    pg_dump "$DATABASE_URL" \
        --format=custom \
        --verbose \
        --file="$BACKUP_FILE" \
        --no-owner \
        --no-acl \
        2>&1 | tee "${BACKUP_FILE}.log"

    if [ $? -eq 0 ]; then
        log_info "Backup completed successfully"
    else
        log_error "Backup failed - check ${BACKUP_FILE}.log for details"
        exit 1
    fi
}

verify_backup() {
    log_info "Verifying backup integrity..."

    # Test backup by listing its contents
    pg_restore --list "$BACKUP_FILE" > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        log_info "Backup verification passed"
    else
        log_error "Backup verification failed - backup may be corrupted"
        exit 1
    fi
}

get_backup_size() {
    local size=$(du -h "$BACKUP_FILE" | cut -f1)
    log_info "Backup size: $size"
}

generate_restore_command() {
    cat << EOF

${GREEN}=== BACKUP COMPLETE ===${NC}

Backup file: $BACKUP_FILE
Timestamp: $TIMESTAMP

To restore this backup:

${YELLOW}pg_restore --clean --if-exists --verbose \\
  --dbname="\$DATABASE_URL" \\
  "$BACKUP_FILE"${NC}

Or to restore specific tables only:

${YELLOW}pg_restore --clean --if-exists --verbose \\
  --table=subscription_plans \\
  --table=user_subscriptions \\
  --table=usage_quotas \\
  --dbname="\$DATABASE_URL" \\
  "$BACKUP_FILE"${NC}

EOF
}

cleanup_old_backups() {
    log_info "Checking for old backups to clean up..."

    # Keep only last 10 backups
    local backup_count=$(ls -1 ${BACKUP_DIR}/backup_*.dump 2>/dev/null | wc -l)

    if [ "$backup_count" -gt 10 ]; then
        log_warn "Found $backup_count backups, keeping only the 10 most recent"

        # Delete oldest backups
        ls -1t ${BACKUP_DIR}/backup_*.dump | tail -n +11 | while read file; do
            rm -f "$file" "${file}.log"
            log_info "Deleted old backup: $file"
        done
    fi
}

# ============================================
# MAIN EXECUTION
# ============================================

main() {
    echo "============================================"
    echo "   HuntZen JobSearch - Database Backup"
    echo "============================================"
    echo ""

    check_requirements
    create_backup_dir
    perform_backup
    verify_backup
    get_backup_size
    cleanup_old_backups
    generate_restore_command

    log_info "Backup process completed successfully"
    exit 0
}

# Run main function
main
