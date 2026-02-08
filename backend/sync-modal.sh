#!/bin/bash
# Sync modal_integration.py from root /app/ to backend/app/
# Run this before committing changes to modal_integration.py

echo "🔄 Syncing modal_integration.py..."
cp ../app/modal_integration.py ./app/modal_integration.py
echo "✅ Synced successfully!"
