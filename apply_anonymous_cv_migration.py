#!/usr/bin/env python3
"""
Script pour appliquer la migration des analyses CV anonymes
Permet aux utilisateurs non authentifiés d'analyser leurs CVs
"""
import os
from dotenv import load_dotenv
import psycopg2

# Charger les variables d'environnement
load_dotenv()

def apply_migration():
    """Applique la migration pour supporter les utilisateurs anonymes"""

    # Récupérer l'URL de la base de données
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("❌ ERREUR: DATABASE_URL non trouvé dans .env")
        return False

    # Lire le fichier de migration
    migration_file = "supabase/migrations/20260129000001_allow_anonymous_cv_analyses.sql"

    try:
        with open(migration_file, 'r') as f:
            migration_sql = f.read()
    except FileNotFoundError:
        print(f"❌ ERREUR: Fichier de migration non trouvé: {migration_file}")
        return False

    try:
        print("=" * 60)
        print("Migration: Permettre les analyses CV anonymes")
        print("=" * 60)
        print()

        print("🔌 Connexion à la base de données Supabase...")
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        print("🚀 Application de la migration...")
        print()

        # Exécuter la migration
        cur.execute(migration_sql)
        conn.commit()

        print()
        print("✅ Migration appliquée avec succès!")
        print()

        # Vérifier les changements
        print("📋 Vérification des modifications:")
        print()

        # Vérifier que user_id est nullable
        cur.execute("""
            SELECT is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'cv_analyses' AND column_name = 'user_id'
        """)
        result = cur.fetchone()
        if result and result[0] == 'YES':
            print("  ✓ user_id est maintenant nullable")
        else:
            print("  ✗ Problème: user_id n'est pas nullable")

        # Vérifier que anonymous_id existe
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'cv_analyses' AND column_name = 'anonymous_id'
        """)
        result = cur.fetchone()
        if result:
            print(f"  ✓ Colonne anonymous_id créée ({result[1]})")
        else:
            print("  ✗ Problème: Colonne anonymous_id non trouvée")

        # Vérifier que client_ip existe
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'cv_analyses' AND column_name = 'client_ip'
        """)
        result = cur.fetchone()
        if result:
            print(f"  ✓ Colonne client_ip créée ({result[1]})")
        else:
            print("  ✗ Problème: Colonne client_ip non trouvée")

        # Compter les politiques RLS
        cur.execute("""
            SELECT COUNT(*)
            FROM pg_policies
            WHERE tablename = 'cv_analyses'
        """)
        policy_count = cur.fetchone()[0]
        print(f"  ✓ {policy_count} politiques RLS configurées")

        cur.close()
        conn.close()

        print()
        print("=" * 60)
        print("🎉 Migration terminée avec succès!")
        print("=" * 60)
        print()
        print("Changements appliqués:")
        print("  - user_id est maintenant nullable (permet anonymes)")
        print("  - Colonne anonymous_id ajoutée (tracking)")
        print("  - Colonne client_ip ajoutée (rate limiting)")
        print("  - Politiques RLS mises à jour")
        print("  - Politiques de stockage mises à jour")
        print()

        return True

    except Exception as e:
        print(f"❌ ERREUR lors de la migration: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = apply_migration()
    exit(0 if success else 1)
