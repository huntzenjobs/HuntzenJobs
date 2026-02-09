#!/usr/bin/env python3
"""
Script pour nettoyer le main.py et éviter les duplications.
Garde uniquement les routes uniques qui n'existent pas dans les modules src.api.routes.
"""

# Routes à GARDER (uniques, n'existent pas dans les modules)
KEEP_ROUTES = [
    # Pages HTML legacy
    '@app.get("/old"',
    '@app.get("/cv-tester"',

    # Chat legacy
    '@app.post("/chat")',
    '@app.post("/reset")',

    # Job search legacy
    '@app.post("/api/search/recruiter")',
    '@app.post("/api/search/recruiters-by-domain")',

    # Coach legacy
    '@app.post("/api/coach/generate-title")',

    # CV analysis legacy
    '@app.post("/api/analyze-cv")',
    '@app.post("/api/analyze-cv-pdf")',

    # Callback webhook
    '@app.post("/api/cv-analysis/callback")',

    # Usage stats
    '@app.get("/api/usage-stats")',
]

# Routes à SUPPRIMER (déjà dans les modules)
REMOVE_ROUTES = [
    '@app.get("/health")',
    '@app.get("/")',
    '@app.get("/api/countries")',
    '@app.get("/api/cities/',
    '@app.get("/api/contract-types")',
    '@app.post("/api/search/jobs")',
    '@app.post("/api/job/description")',
    '@app.post("/api/coach")',
    '@app.get("/api/cv-analysis/status/',
    '@app.get("/api/cv-analysis/list")',
    '@app.get("/api/auth/me")',
    '@app.get("/api/saved-jobs")',
    '@app.post("/api/saved-jobs")',
    '@app.delete("/api/saved-jobs/',
    '@app.post("/api/jobs/track-view")',
    '@app.post("/api/stripe/create-checkout-session")',
    '@app.post("/api/stripe/webhook")',
]

def main():
    import re

    # Lire le fichier original
    with open('backend/src/main.py', 'r', encoding='utf-8') as f:
        lines = f.readlines()

    # Configuration header (jusqu'à la ligne ~460)
    config_end_marker = "# Templates setup"
    config_lines = []

    # Trouver la fin de la configuration
    config_end_idx = 0
    for i, line in enumerate(lines):
        if config_end_marker in line:
            config_end_idx = i + 10  # Inclure quelques lignes après
            break

    # Extraire la configuration
    config_lines = lines[:config_end_idx]

    # Ajouter l'import des routers
    router_imports = '''
# ============================================
# IMPORT ALL API ROUTERS FROM src/api/routes
# ============================================
from src.api.routes import router as api_router

# Include all API routers (auth, coach, jobs, cv, etc.)
app.include_router(api_router)
logger.info("[ROUTES] ✅ All API routes registered via src.api.routes")

# ============================================
# LEGACY / UNIQUE ROUTES (Not in modules)
# ============================================
'''

    # Identifier les blocs de routes à garder
    keep_blocks = []
    current_block = []
    inside_keep_route = False
    decorator_line = -1

    for i in range(config_end_idx, len(lines)):
        line = lines[i]

        # Détecter le début d'une route à garder
        if any(route in line for route in KEEP_ROUTES):
            inside_keep_route = True
            decorator_line = i
            current_block = [line]
            continue

        # Si on est dans un bloc à garder
        if inside_keep_route:
            current_block.append(line)

            # Détecter la fin du bloc (nouvelle fonction ou fin de fichier)
            if i < len(lines) - 1:
                next_line = lines[i + 1]
                # Nouvelle route détectée ?
                if next_line.strip().startswith('@app.') or next_line.strip().startswith('if __name__'):
                    keep_blocks.append(''.join(current_block))
                    current_block = []
                    inside_keep_route = False
            else:
                # Fin du fichier
                keep_blocks.append(''.join(current_block))

    # Construire le nouveau fichier
    new_content = ''.join(config_lines) + router_imports + '\n\n' + '\n\n'.join(keep_blocks)

    # Ajouter le if __name__ == "__main__" à la fin
    new_content += '\n\nif __name__ == "__main__":\n    import uvicorn\n    uvicorn.run(app, host="0.0.0.0", port=8000)\n'

    # Écrire le nouveau fichier
    with open('backend/src/main_clean.py', 'w', encoding='utf-8') as f:
        f.write(new_content)

    print("✅ Nouveau fichier créé: backend/src/main_clean.py")
    print(f"📊 Taille originale: {len(lines)} lignes")
    print(f"📊 Taille nettoyée: {len(new_content.splitlines())} lignes")
    print(f"🎯 Blocs de routes gardés: {len(keep_blocks)}")

if __name__ == "__main__":
    main()
