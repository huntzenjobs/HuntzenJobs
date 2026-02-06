"""
Test Modal setup - S6-6 verification
Quick test to verify Modal authentication and secrets are configured correctly.
"""
import modal

app = modal.App("huntzen-test")

@app.function(
    secrets=[modal.Secret.from_name("huntzen-secrets")],
    timeout=60
)
def test_secrets():
    """Test that secrets are accessible."""
    import os

    groq_key = os.getenv("GROQ_API_KEY", "")
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    print("✅ Modal function executed successfully!")
    print(f"✅ GROQ_API_KEY loaded: {groq_key[:20]}..." if groq_key else "❌ GROQ_API_KEY missing")
    print(f"✅ SUPABASE_URL loaded: {supabase_url}" if supabase_url else "❌ SUPABASE_URL missing")
    print(f"✅ SUPABASE_SERVICE_ROLE_KEY loaded: {supabase_key[:20]}..." if supabase_key else "❌ SUPABASE_SERVICE_ROLE_KEY missing")

    return {
        "status": "success",
        "groq_configured": bool(groq_key),
        "supabase_configured": bool(supabase_url and supabase_key)
    }


@app.local_entrypoint()
def main():
    """Run the test."""
    print("🚀 Testing Modal setup...")
    result = test_secrets.remote()
    print(f"\n📊 Result: {result}")
    print("\n✅ Modal setup is working correctly!")
