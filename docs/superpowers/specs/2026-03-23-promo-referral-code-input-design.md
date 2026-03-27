# Spec -- Champ universel code promo/parrainage dans le flow auth

**Date** : 2026-03-23
**Statut** : Approuve (v3 -- definitive)

---

## Contexte

Les codes de parrainage (HZN-XXXXXX) ne sont detectes que via URL `?ref=CODE`. Il n'y a aucun champ input pour saisir manuellement un code promo ou parrainage. Les utilisateurs qui arrivent sans lien ne peuvent pas entrer de code.

## Objectif

Ajouter un champ universel (promo + parrainage) avec validation live, sur signup + onboarding. Robuste pour email et Google OAuth. Reutiliser le systeme existant (cookie `huntzen_referral_code`, auth-context, middleware).

---

## Design

### 1. Placement et UX

**Page signup** (`/signup`) :
- Sous les boutons CTA, lien discret : "Vous avez un code ?"
- Au clic, deplie un input + bouton "Appliquer"
- **Pre-remplissage automatique** : si `?ref=CODE` dans l'URL ou cookie `huntzen_referral_code` deja present, le champ s'affiche deplie avec le code pre-rempli ET valide automatiquement (check vert + description)
- La banniere cyan actuelle de parrainage est **supprimee** (remplacee par le champ input qui fait la meme chose en mieux)
- Si code valide : check vert + description de la recompense
- **Un seul code a la fois** : le dernier saisi/valide remplace le precedent
- Le code est stocke dans le cookie existant `huntzen_referral_code` (on reutilise le meme, pas de nouveau cookie)

**Onboarding** (nouvelle etape 6, plans decale en etape 7) :
- Affichee SEULEMENT si :
  - Pas de cookie `huntzen_referral_code`
  - ET pas de localStorage `huntzen_referral_registered` = "1"
- Si un code est deja enregistre, l'etape est skippee automatiquement (TOTAL_STEPS reste dynamique)
- Champ + bouton "Passer"

**Login** : pas de champ (les codes s'appliquent a l'inscription, pas a la connexion)

### 2. Cookie et stockage -- REUTILISER L'EXISTANT

**Pas de nouveau cookie.** On reutilise le systeme existant :

| Stockage | Cle | Contenu | Usage |
|----------|-----|---------|-------|
| Cookie (30j) | `huntzen_referral_code` | Le code brut (ex: `HZN-ABC123` ou `LAUNCH50`) | Survit au redirect Google OAuth |
| localStorage | `huntzen_referral_code` | Meme code (fallback) | Backup si cookie perdu |
| localStorage | `huntzen_referral_registered` | "1" | Flag anti-doublon au SIGNED_IN |

**Middleware** (`middleware.ts`) : deja fonctionnel, ecrit `huntzen_referral_code` quand `?ref=` est dans l'URL. **Aucune modification necessaire.** Le meme cookie stocke referrals ET promos.

### 3. Detection du type de code

Pas de format impose pour les codes promo. La detection est :

1. Si match regex `^HZN-[A-Z0-9]{6}$` → **parrainage** → chercher dans table `referrals`
2. Sinon → **promo** → chercher dans table `promo_codes`

Exemples valides :
- `HZN-ABC123` → parrainage
- `SUMMER2026` → promo
- `LAUNCH50` → promo
- `JEAN20` → promo

### 4. Backend -- Endpoint de validation

**Route** : `POST /api/codes/validate`
**Auth** : Public (pas besoin d'etre connecte, c'est avant le signup)
**Rate limit** : 10/minute
**Body** : `{ "code": "XXXX" }`

**Logique** :
1. Normaliser : `code.strip().upper()`
2. Si match `HZN-[A-Z0-9]{6}` :
   - Chercher dans `referrals` table par `referral_code`
   - Si trouve → `{ valid: true, type: "referral", description: "...", referrer_name: "Jean D." }`
3. Sinon :
   - Chercher dans `promo_codes` table par `code`
   - Si trouve ET `is_active` ET pas expire ET `current_uses < max_uses` (ou max_uses IS NULL) :
     → `{ valid: true, type: "promo", description: "20% de reduction", ... }`
4. Si pas trouve : `{ valid: false }`

**Securite** :
- POST (pas GET) : le code ne fuit pas dans les logs
- Reponse identique pour "inexistant" et "expire" (pas d'info leak)
- Rate limit 10/min

**Response model** :
```json
{
  "valid": true,
  "type": "referral" | "promo",
  "description": "7 jours Pro offerts",
  "referrer_name": "Jean D.",
  "discount_type": "percent" | "free_days" | "fixed_amount" | null,
  "discount_value": 20,
  "plan": "pro"
}
```

### 5. Backend -- Endpoint d'application

**Route** : `POST /api/codes/apply`
**Auth** : Authentifie (Bearer token)
**Rate limit** : 5/minute
**Body** : `{ "code": "XXXX" }`

**Logique** :
1. Si type referral → deleguer au `POST /api/referrals/register` existant (ne pas reimplementer)
2. Si type promo :
   - Verifier que le code est valide (memes checks que /validate)
   - Verifier que le user n'a pas deja utilise ce code (table `user_promo_codes`)
   - Inserer dans `user_promo_codes(user_id, promo_code_id)`
   - Incrementer `promo_codes.current_uses`
   - Le code sera lu par le checkout Stripe plus tard
3. Cleanup : supprimer cookie + localStorage

**Table de liaison** :
```sql
CREATE TABLE user_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE(user_id, promo_code_id)
);
```

### 6. Table `promo_codes` (nouvelle)

```sql
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'free_days', 'fixed_amount')),
  discount_value NUMERIC NOT NULL,
  plan TEXT,
  stripe_coupon_id TEXT,
  max_uses INTEGER DEFAULT NULL,
  current_uses INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  campaign TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

- `code` : le code saisi par l'utilisateur (ex: `SUMMER2026`)
- `campaign` : pour tracker la source marketing (ex: "launch_mars2026", "influencer_jean")
- `stripe_coupon_id` : si le code doit appliquer un coupon Stripe au checkout
- `max_uses` : NULL = illimite
- `discount_type` : `percent` (ex: -20%), `free_days` (ex: 7j Pro), `fixed_amount` (ex: -5 EUR)

### 7. Checkout Stripe -- Application du code promo

**Fichier modifie** : `backend/src/api/routes/stripe.py` (create-checkout-session)

**Flux** :
1. Frontend : au moment du checkout, lire la table `user_promo_codes` pour le user connecte (le code a deja ete applique au SIGNED_IN)
2. Backend dans `create-checkout-session` :
   - Chercher dans `user_promo_codes` un code non-utilise (`used_at IS NULL`) pour le user
   - Si trouve et `stripe_coupon_id` present :
     - Ajouter `discounts: [{ coupon: stripe_coupon_id }]` a la session Stripe
     - Marquer `used_at = NOW()`
   - Si type `free_days` (pas de Stripe coupon) :
     - Appliquer via `force_plan_change` apres le checkout (logique admin existante)
3. Pas besoin de passer le code depuis le frontend — le backend le cherche directement en DB

### 8. Auth-context -- Integration avec l'existant

**Fichier modifie** : `frontend-next/src/contexts/auth-context.tsx`

Le code actuel au premier SIGNED_IN :
```typescript
// Existant : lit huntzen_referral_code, appelle POST /api/referrals/register
```

**Modification** :
1. Lire cookie `huntzen_referral_code`
2. Detecter le type par format (HZN-XXXXXX = referral, sinon = promo)
3. Si referral → `POST /api/referrals/register` (INCHANGE)
4. Si promo → `POST /api/codes/apply` (NOUVEAU)
5. Dans les 2 cas : cleanup cookie + localStorage + set `huntzen_referral_registered = "1"`

### 9. Admin panel -- Gestion des codes promo

**Nouveaux fichiers** :
- `frontend-next/src/app/admin/promo-codes/page.tsx` : page admin avec tableau des codes
- `frontend-next/src/components/admin/promo-codes/promo-codes-table.tsx` : tableau CRUD
- `frontend-next/src/components/admin/promo-codes/create-promo-dialog.tsx` : modal creation
- `frontend-next/src/hooks/admin/use-admin-promo-codes.ts` : hook admin

**Backend admin** (dans `admin.py`) :
- `GET /api/admin/promo-codes` : lister tous les codes + stats d'utilisation
- `POST /api/admin/promo-codes` : creer un code
- `PATCH /api/admin/promo-codes/{id}` : activer/desactiver
- `DELETE /api/admin/promo-codes/{id}` : supprimer

**Champs du formulaire admin** :
- Code (auto-genere ou personnalise)
- Description
- Type de remise (pourcentage, jours gratuits, montant fixe)
- Valeur de la remise
- Plan cible (optionnel)
- Stripe coupon ID (optionnel, pour lier a un coupon Stripe existant)
- Nombre max d'utilisations
- Date de debut / fin
- Campagne (tag libre pour tracking)

### 10. Frontend -- Composant `PromoCodeInput`

**Fichier** : `frontend-next/src/components/auth/promo-code-input.tsx`

```typescript
interface PromoCodeInputProps {
  onCodeValidated: (code: string, result: CodeValidationResult) => void;
  initialCode?: string;
  className?: string;
}
```

**UX** :
- Sans `initialCode` : lien texte "Vous avez un code ?" (discret)
- Avec `initialCode` : champ deplie, pre-rempli, validation auto au mount
- Clic "Appliquer" → POST /api/codes/validate
- Etats visuels :
  - Neutre : champ vide
  - Loading : spinner dans le bouton
  - Valide : bordure verte + check + description recompense
  - Invalide : bordure rouge + "Code invalide"
- Au succes : stocke dans cookie `huntzen_referral_code` + localStorage

### 11. Integration onboarding

**Fichier modifie** : `frontend-next/src/app/onboarding/page.tsx`

- `TOTAL_STEPS` dynamique : 7 si pas de code, 6 si code deja detecte (step skippee)
- Nouvelle etape (avant les plans) : "Vous avez un code ?"
- Condition d'affichage :
  ```typescript
  const hasCode = !!getCookie("huntzen_referral_code") ||
                  localStorage.getItem("huntzen_referral_registered") === "1";
  // Si hasCode → skip cette etape
  ```

---

## Fichiers a creer

| Fichier | Description |
|---------|-------------|
| `frontend-next/src/components/auth/promo-code-input.tsx` | Composant input universel |
| `backend/src/api/routes/codes.py` | POST /validate + POST /apply |
| `supabase/migrations/XXXX_promo_codes.sql` | Tables promo_codes + user_promo_codes + RLS |
| `frontend-next/src/app/admin/promo-codes/page.tsx` | Page admin codes promo |
| `frontend-next/src/components/admin/promo-codes/promo-codes-table.tsx` | Tableau CRUD |
| `frontend-next/src/components/admin/promo-codes/create-promo-dialog.tsx` | Modal creation |
| `frontend-next/src/hooks/admin/use-admin-promo-codes.ts` | Hook admin |

## Fichiers a modifier

| Fichier | Modification |
|---------|-------------|
| `frontend-next/src/app/signup/page.tsx` | Ajouter PromoCodeInput, supprimer banniere cyan |
| `frontend-next/src/app/onboarding/page.tsx` | Etape conditionnelle code, TOTAL_STEPS dynamique |
| `frontend-next/src/contexts/auth-context.tsx` | Gerer promo codes au SIGNED_IN (en plus des referrals) |
| `backend/src/api/routes/stripe.py` | Lire user_promo_codes au checkout, appliquer coupon Stripe |
| `backend/src/api/routes/admin.py` | CRUD promo codes |
| `backend/src/api/routes/__init__.py` | Enregistrer codes_router |
| `frontend-next/src/middleware.ts` | Aucun changement (reutilise tel quel) |
| `frontend-next/messages/fr.json` | Traductions auth.promoCode.* |
| `frontend-next/messages/en.json` | Traductions auth.promoCode.* |
| `frontend-next/messages/es.json` | Traductions auth.promoCode.* |
| `frontend-next/messages/pt.json` | Traductions auth.promoCode.* |

## Edge cases

| Cas | Comportement |
|-----|-------------|
| User avec `?ref=HZN-ABC123` qui tape un promo | Le promo remplace le referral dans le cookie |
| Code expire entre validation et checkout | Backend re-valide au checkout, refuse si expire |
| User s'inscrit, ne paye pas, revient 3 semaines apres | Cookie expire a 30j, mais `user_promo_codes` en DB persiste |
| Double utilisation du meme code par le meme user | Contrainte UNIQUE `(user_id, promo_code_id)` dans `user_promo_codes` |
| Code atteint max_uses pendant que l'user tape | Validation retourne invalide |
| Google OAuth redirect | Cookie `huntzen_referral_code` survit (deja prouve en prod) |
| User deja inscrit qui recoit un code promo | Peut l'entrer sur la page pricing (futur, pas dans ce scope) |
