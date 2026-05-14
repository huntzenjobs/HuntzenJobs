-- Migration: Fix RLS user_feature_overrides
-- ============================================
-- Problème : La policy "Service role full access" utilise USING(true) sans
-- restriction de rôle → tout utilisateur authentifié peut lire les overrides
-- de features de N'IMPORTE quel autre utilisateur.
--
-- Fix : Remplacer par deux policies distinctes :
--   1. service_role : accès complet (lecture + écriture)
--   2. authenticated : lecture uniquement de ses propres overrides

-- Supprimer la policy trop permissive
DROP POLICY IF EXISTS "Service role full access" ON user_feature_overrides;

-- Policy admin/service : accès complet (backend via service_role key)
CREATE POLICY "service_role full access" ON user_feature_overrides
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy user : lecture de ses propres overrides uniquement
-- (utile si le frontend doit vérifier ses feature flags directement)
CREATE POLICY "users read own overrides" ON user_feature_overrides
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
