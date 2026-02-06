"""Script de diagnostic pour vérifier l'algorithme JWT utilisé par Supabase"""
import jwt
import sys

if len(sys.argv) < 2:
    print("Usage: python debug_token.py <votre_token_jwt>")
    print("\nOu copiez un token depuis votre navigateur (localStorage)")
    sys.exit(1)

token = sys.argv[1]

try:
    # Décoder sans vérification pour voir l'algorithme
    header = jwt.get_unverified_header(token)
    payload = jwt.decode(token, options={"verify_signature": False})

    print("=" * 60)
    print("JWT TOKEN ANALYSIS")
    print("=" * 60)
    print(f"\n✅ Algorithme utilisé: {header.get('alg')}")
    print(f"✅ Type: {header.get('typ')}")
    print(f"\n📝 Payload claims:")
    print(f"   - sub (user_id): {payload.get('sub')}")
    print(f"   - email: {payload.get('email')}")
    print(f"   - aud (audience): {payload.get('aud')}")
    print(f"   - role: {payload.get('role')}")
    print(f"   - exp (expiration): {payload.get('exp')}")
    print(f"   - iat (issued at): {payload.get('iat')}")

    print("\n" + "=" * 60)
    print(f"🎯 RESULTAT: Supabase utilise l'algorithme: {header.get('alg')}")
    print("=" * 60)

except Exception as e:
    print(f"❌ Erreur lors de l'analyse: {e}")
    sys.exit(1)
