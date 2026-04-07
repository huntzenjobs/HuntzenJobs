-- Migration: Rename plan display_name to match new commercial positioning
-- Date: 2026-03-19
-- Context: Rebrand plans from generic names to progression-oriented names
--   Free → Exploration | Starter → Recherche Active | Pro → Accélérateur | Premium → Carrière
-- Safe: Only updates display_name (cosmetic). Does NOT touch name (technical ID used by Stripe/code).

UPDATE subscription_plans SET display_name = 'Exploration',      description = 'Pour découvrir la plateforme en toute liberté'         WHERE name = 'free';
UPDATE subscription_plans SET display_name = 'Recherche Active', description = 'Pour progresser rapidement dans votre recherche'      WHERE name = 'starter';
UPDATE subscription_plans SET display_name = 'Accélérateur',     description = 'Pour passer à la vitesse supérieure et être recruté'  WHERE name = 'pro';
UPDATE subscription_plans SET display_name = 'Carrière',         description = 'Pour un accompagnement complet de A à Z'              WHERE name = 'premium';
