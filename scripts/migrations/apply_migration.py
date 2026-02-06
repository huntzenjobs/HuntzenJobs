"""
Quick script to apply cv_text column migration via Modal
"""
import modal
import os

app = modal.App("apply-migration")

image = modal.Image.debian_slim().pip_install("psycopg2-binary")

secrets = [
    modal.Secret.from_name("huntzen-secrets"),
]

@app.function(image=image, secrets=secrets)
def apply_cv_text_migration():
    """Apply the cv_text column migration to Supabase"""
    import psycopg2

    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        print("ERROR: DATABASE_URL not found in secrets")
        return False

    migration_sql = """
-- Add cv_text column
ALTER TABLE cv_analyses
ADD COLUMN IF NOT EXISTS cv_text TEXT;

-- Add comment
COMMENT ON COLUMN cv_analyses.cv_text IS 'CV text content (if text mode used instead of PDF upload)';
"""

    try:
        print("🔌 Connecting to Supabase database...")
        conn = psycopg2.connect(database_url)
        cur = conn.cursor()

        print("🚀 Applying migration: Add cv_text column...")
        cur.execute(migration_sql)
        conn.commit()

        # Verify column exists
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'cv_analyses' AND column_name = 'cv_text'
        """)
        result = cur.fetchone()

        cur.close()
        conn.close()

        if result:
            print(f"✅ Migration successful! Column 'cv_text' created ({result[1]})")
            return True
        else:
            print("❌ Migration failed: cv_text column not found after migration")
            return False

    except Exception as e:
        print(f"❌ Migration error: {e}")
        return False

@app.local_entrypoint()
def main():
    """Run migration"""
    print("=" * 60)
    print("Applying cv_text column migration to Supabase")
    print("=" * 60)

    success = apply_cv_text_migration.remote()

    if success:
        print("\n🎉 Migration completed successfully!")
    else:
        print("\n⚠️  Migration failed - check errors above")

    return success
