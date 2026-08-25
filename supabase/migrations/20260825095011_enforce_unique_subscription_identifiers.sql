-- Rétablit l'invariant requis par apply_stripe_checkout_completed sans
-- supprimer l'historique des abonnements. Les anciennes attributions admin
-- utilisaient toutes la même valeur synthétique ; chaque ligne reçoit
-- désormais une valeur stable et unique.

UPDATE public.user_subscriptions
SET stripe_subscription_id = 'admin_granted:' || id::TEXT
WHERE stripe_subscription_id = 'admin_granted';

-- Pour un éventuel identifiant Stripe historique dupliqué, conserve la ligne
-- la plus pertinente sous l'identifiant réel et archive les autres valeurs en
-- gardant l'identifiant original dans la chaîne. Aucune ligne n'est supprimée.
WITH ranked_subscriptions AS (
  SELECT
    id,
    stripe_subscription_id,
    ROW_NUMBER() OVER (
      PARTITION BY stripe_subscription_id
      ORDER BY
        CASE status
          WHEN 'active' THEN 1
          WHEN 'trialing' THEN 2
          WHEN 'past_due' THEN 3
          ELSE 4
        END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS duplicate_rank
  FROM public.user_subscriptions
  WHERE stripe_subscription_id IS NOT NULL
)
UPDATE public.user_subscriptions AS subscription
SET stripe_subscription_id =
  'archived:' || ranked.stripe_subscription_id || ':' || subscription.id::TEXT
FROM ranked_subscriptions AS ranked
WHERE subscription.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS user_subscriptions_stripe_subscription_id_key
  ON public.user_subscriptions (stripe_subscription_id);
