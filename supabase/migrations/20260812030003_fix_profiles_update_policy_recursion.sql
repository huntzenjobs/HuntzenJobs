-- L'ancienne WITH CHECK relisait profiles depuis une policy de profiles et
-- provoquait `42P17 infinite recursion`. Les ACL par colonne de 030001 portent
-- désormais l'invariant des champs privilégiés ; la policy ne gère que l'owner.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
