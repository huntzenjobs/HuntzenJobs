"""
Script to extract Supabase JWT Secret from a Supabase JWT token.
This helps configure the backend to verify tokens from Supabase Auth.
"""
import jwt
import json

# Decode a sample Supabase token (without verification) to see the issuer
sample_token = input("Paste a Supabase access_token (from browser DevTools > Application > Local Storage):\n").strip()

try:
    # Decode without verification to inspect
    decoded = jwt.decode(sample_token, options={"verify_signature": False})
    
    print("\n=== Token Payload ===")
    print(json.dumps(decoded, indent=2))
    
    print("\n=== Instructions ===")
    print("The JWT Secret for Supabase can be found in:")
    print("1. Go to: https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp/settings/api")
    print("2. Look for 'JWT Settings' section")
    print("3. Copy the 'JWT Secret' value")
    print("4. Add to .env file as:")
    print("   SUPABASE_JWT_SECRET=your-secret-here")
    
except Exception as e:
    print(f"Error: {e}")
    print("\nAlternatively, get JWT Secret from Supabase Dashboard:")
    print("https://supabase.com/dashboard/project/ngiakfikbuyugqfqtfwp/settings/api")
