# Modal Integration

This directory contains a **copy** of `/app/modal_integration.py` for Docker build context.

## ⚠️ Important

When modifying `modal_integration.py`, you need to sync both files:

1. Edit: `/app/modal_integration.py` (source of truth)
2. Run: `cd backend && ./sync-modal.sh`
3. Commit both files

## Why Two Files?

Railway's Docker build context is limited to `/backend/`, so we can't access `../app/` during build.
The alternative would be to move the Dockerfile to the root, but this is simpler.
