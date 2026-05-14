# Promo/Referral Code Input - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a universal input field for promo and referral codes on signup + onboarding, with live validation, backend tracking, and Stripe checkout integration.

**Architecture:** Public POST endpoint validates codes (referral via `referrals` table, promo via new `promo_codes` table). Authenticated POST endpoint links code to user (`user_promo_codes`). Checkout reads linked promo and applies Stripe coupon. Reuses existing cookie system (`huntzen_referral_code`).

**Tech Stack:** FastAPI, Supabase (PostgreSQL + RLS), Next.js 14, shadcn/ui, next-intl, Stripe API

**Spec:** `docs/superpowers/specs/2026-03-23-promo-referral-code-input-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/20260323000006_promo_codes.sql` | Tables `promo_codes` + `user_promo_codes` + RLS |
| `backend/src/api/routes/codes.py` | POST /validate (public) + POST /apply (auth) |
| `frontend-next/src/components/auth/promo-code-input.tsx` | Universal code input component |
| `frontend-next/src/app/admin/promo-codes/page.tsx` | Admin page for managing promo codes |
| `frontend-next/src/hooks/admin/use-admin-promo-codes.ts` | Admin hook for CRUD promo codes |

### Modified files
| File | Change |
|------|--------|
| `backend/src/api/routes/__init__.py` | Register codes_router |
| `backend/src/api/routes/admin.py` | CRUD endpoints for promo codes |
| `backend/src/api/routes/stripe.py` | Read user_promo_codes at checkout |
| `frontend-next/src/app/signup/page.tsx` | Add PromoCodeInput, remove cyan banner |
| `frontend-next/src/app/onboarding/page.tsx` | Add conditional code step (step 6), plans becomes step 7 |
| `frontend-next/src/contexts/auth-context.tsx` | Handle promo codes at SIGNED_IN |
| `frontend-next/messages/fr.json` | Translations auth.promoCode.* |
| `frontend-next/messages/en.json` | Translations auth.promoCode.* |
| `frontend-next/messages/es.json` | Translations auth.promoCode.* |
| `frontend-next/messages/pt.json` | Translations auth.promoCode.* |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260323000006_promo_codes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Table promo_codes
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

-- Table user_promo_codes
CREATE TABLE user_promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  UNIQUE(user_id, promo_code_id)
);

-- RLS
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active promo codes" ON promo_codes
  FOR SELECT TO anon, authenticated USING (is_active = true);

CREATE POLICY "Service role manages promo codes" ON promo_codes
  FOR ALL TO service_role USING (true);

CREATE POLICY "Users can view own promo codes" ON user_promo_codes
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Service role manages user promo codes" ON user_promo_codes
  FOR ALL TO service_role USING (true);

-- Index
CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_user_promo_codes_user ON user_promo_codes(user_id);
```

- [ ] **Step 2: Push migration**

Run: `supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260323000006_promo_codes.sql
git commit -m "feat(promo): add promo_codes and user_promo_codes tables"
```

---

## Task 2: Backend validation and apply endpoints

**Files:**
- Create: `backend/src/api/routes/codes.py`
- Modify: `backend/src/api/routes/__init__.py`

- [ ] **Step 1: Create codes.py with validate endpoint**

```python
"""
Promo/Referral Code Validation & Application
=============================================
POST /api/codes/validate — Public, validates any code (referral or promo)
POST /api/codes/apply — Authenticated, links code to user
"""

import re
import logging

from fastapi import APIRouter, HTTPException, Header, Request, status
from pydantic import BaseModel, Field

from src.api.deps import get_supabase_client, get_user_id_from_token
from src.api.middleware import limiter

logger = logging.getLogger(__name__)
router = APIRouter()

REFERRAL_PATTERN = re.compile(r"^HZN-[A-Z0-9]{6}$")


class ValidateCodeRequest(BaseModel):
    code: str = Field(..., min_length=2, max_length=30)


class ApplyCodeRequest(BaseModel):
    code: str = Field(..., min_length=2, max_length=30)


@router.post("/validate")
@limiter.limit("10/minute")
async def validate_code(request: Request, body: ValidateCodeRequest):
    """Validate a referral or promo code. Public endpoint."""
    code = body.code.strip().upper()
    supabase = get_supabase_client()

    # Referral code
    if REFERRAL_PATTERN.match(code):
        result = supabase.table("referrals").select(
            "id, referral_code, referrer_id"
        ).eq("referral_code", code).maybe_single().execute()

        if not result.data:
            return {"valid": False}

        # Get referrer name
        referrer_name = None
        try:
            profile = supabase.table("profiles").select(
                "full_name"
            ).eq("id", result.data["referrer_id"]).maybe_single().execute()
            if profile.data:
                name = profile.data.get("full_name", "")
                parts = name.split() if name else []
                referrer_name = f"{parts[0]} {parts[1][0]}." if len(parts) >= 2 else name
        except Exception:
            pass

        return {
            "valid": True,
            "type": "referral",
            "description": "Code de parrainage valide",
            "referrer_name": referrer_name,
            "discount_type": None,
            "discount_value": None,
            "plan": None,
        }

    # Promo code
    result = supabase.table("promo_codes").select("*").eq(
        "code", code
    ).eq("is_active", True).maybe_single().execute()

    if not result.data:
        return {"valid": False}

    promo = result.data

    # Check expiry
    if promo.get("expires_at"):
        from datetime import datetime, UTC
        expires = datetime.fromisoformat(promo["expires_at"].replace("Z", "+00:00"))
        if datetime.now(UTC) > expires:
            return {"valid": False}

    # Check max uses
    if promo.get("max_uses") is not None and promo["current_uses"] >= promo["max_uses"]:
        return {"valid": False}

    return {
        "valid": True,
        "type": "promo",
        "description": promo["description"],
        "referrer_name": None,
        "discount_type": promo["discount_type"],
        "discount_value": float(promo["discount_value"]),
        "plan": promo.get("plan"),
    }


@router.post("/apply")
@limiter.limit("5/minute")
async def apply_code(
    request: Request,
    body: ApplyCodeRequest,
    authorization: str | None = Header(None),
):
    """Apply a promo code to the authenticated user."""
    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    code = body.code.strip().upper()
    supabase = get_supabase_client()

    # Referral codes are handled by /api/referrals/register
    if REFERRAL_PATTERN.match(code):
        return {"success": True, "type": "referral", "message": "Use /api/referrals/register"}

    # Find promo code
    result = supabase.table("promo_codes").select("*").eq(
        "code", code
    ).eq("is_active", True).maybe_single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Code invalide")

    promo = result.data

    # Check not already used by this user
    existing = supabase.table("user_promo_codes").select("id").eq(
        "user_id", user_id
    ).eq("promo_code_id", promo["id"]).maybe_single().execute()

    if existing.data:
        return {"success": True, "type": "promo", "message": "Already applied"}

    # Insert link
    supabase.table("user_promo_codes").insert({
        "user_id": user_id,
        "promo_code_id": promo["id"],
    }).execute()

    # Increment uses
    supabase.table("promo_codes").update({
        "current_uses": promo["current_uses"] + 1,
    }).eq("id", promo["id"]).execute()

    logger.info(f"[codes] Promo {code} applied to user {user_id}")

    return {"success": True, "type": "promo", "message": "Code applied"}
```

- [ ] **Step 2: Register router in __init__.py**

In `backend/src/api/routes/__init__.py`, add:
```python
from src.api.routes.codes import router as codes_router
app.include_router(codes_router, prefix="/api/codes", tags=["codes"])
```

- [ ] **Step 3: Lint**

Run: `ruff check backend/src/api/routes/codes.py --ignore E501`
Expected: All checks passed

- [ ] **Step 4: Commit**

```bash
git add backend/src/api/routes/codes.py backend/src/api/routes/__init__.py
git commit -m "feat(promo): add POST /api/codes/validate and /apply endpoints"
```

---

## Task 3: Frontend PromoCodeInput component

**Files:**
- Create: `frontend-next/src/components/auth/promo-code-input.tsx`
- Modify: `frontend-next/messages/fr.json`
- Modify: `frontend-next/messages/en.json`
- Modify: `frontend-next/messages/es.json`
- Modify: `frontend-next/messages/pt.json`

- [ ] **Step 1: Add i18n keys to fr.json**

Add under `auth`:
```json
"promoCode": {
  "trigger": "Vous avez un code ?",
  "placeholder": "Code promo ou parrainage",
  "apply": "Appliquer",
  "applying": "Verification...",
  "invalid": "Code invalide ou expire",
  "validReferral": "Parraine par {name}",
  "validPromo": "{description}",
  "alreadyApplied": "Code deja applique"
}
```

- [ ] **Step 2: Add i18n keys to en.json, es.json, pt.json**

Same keys translated.

- [ ] **Step 3: Create PromoCodeInput component**

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { Check, X, Loader2, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export interface CodeValidationResult {
  valid: boolean;
  type?: "referral" | "promo";
  description?: string;
  referrer_name?: string;
  discount_type?: string;
  discount_value?: number;
  plan?: string;
}

interface PromoCodeInputProps {
  onCodeValidated: (code: string, result: CodeValidationResult) => void;
  initialCode?: string;
  className?: string;
}

export function PromoCodeInput({ onCodeValidated, initialCode, className }: PromoCodeInputProps) {
  const t = useTranslations("auth.promoCode");
  const [isOpen, setIsOpen] = useState(!!initialCode);
  const [code, setCode] = useState(initialCode || "");
  const [status, setStatus] = useState<"idle" | "loading" | "valid" | "invalid">("idle");
  const [result, setResult] = useState<CodeValidationResult | null>(null);

  const validate = useCallback(async (codeToValidate: string) => {
    if (!codeToValidate.trim()) return;
    setStatus("loading");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${backendUrl}/api/codes/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: codeToValidate.trim() }),
      });

      if (!res.ok) {
        setStatus("invalid");
        return;
      }

      const data: CodeValidationResult = await res.json();
      setResult(data);

      if (data.valid) {
        setStatus("valid");
        onCodeValidated(codeToValidate.trim().toUpperCase(), data);
      } else {
        setStatus("invalid");
      }
    } catch {
      setStatus("invalid");
    }
  }, [onCodeValidated]);

  // Auto-validate if initialCode is provided
  useEffect(() => {
    if (initialCode) {
      validate(initialCode);
    }
  }, [initialCode, validate]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "flex items-center gap-2 text-sm text-gray-500 hover:text-[#00D9FF] transition-colors",
          className,
        )}
      >
        <Tag className="w-4 h-4" />
        {t("trigger")}
      </button>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (status !== "idle") setStatus("idle");
          }}
          placeholder={t("placeholder")}
          className={cn(
            "h-10 text-sm",
            status === "valid" && "border-green-500 focus-visible:ring-green-500",
            status === "invalid" && "border-red-500 focus-visible:ring-red-500",
          )}
          disabled={status === "loading"}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => validate(code)}
          disabled={!code.trim() || status === "loading" || status === "valid"}
          className="h-10 px-4"
        >
          {status === "loading" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === "valid" ? (
            <Check className="w-4 h-4" />
          ) : (
            t("apply")
          )}
        </Button>
      </div>

      {status === "valid" && result && (
        <p className="text-sm text-green-600 flex items-center gap-1.5">
          <Check className="w-4 h-4" />
          {result.type === "referral"
            ? t("validReferral", { name: result.referrer_name || "" })
            : t("validPromo", { description: result.description || "" })}
        </p>
      )}

      {status === "invalid" && (
        <p className="text-sm text-red-500 flex items-center gap-1.5">
          <X className="w-4 h-4" />
          {t("invalid")}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: TypeScript check**

Run: `cd frontend-next && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend-next/src/components/auth/promo-code-input.tsx frontend-next/messages/*.json
git commit -m "feat(promo): add PromoCodeInput component with i18n"
```

---

## Task 4: Integrate on signup page

**Files:**
- Modify: `frontend-next/src/app/signup/page.tsx`

- [ ] **Step 1: Import PromoCodeInput**

Add import at top of signup/page.tsx.

- [ ] **Step 2: Replace cyan referral banner with PromoCodeInput**

Remove the existing referral banner (lines ~293-309). Replace with:
```tsx
<PromoCodeInput
  initialCode={referralCode || undefined}
  onCodeValidated={(code, result) => {
    // Store in cookie + localStorage (same key as existing system)
    document.cookie = `huntzen_referral_code=${code}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`;
    localStorage.setItem("huntzen_referral_code", code);
  }}
  className="mt-4"
/>
```

- [ ] **Step 3: TypeScript + ESLint check**

Run: `npx tsc --noEmit && npx next lint --dir src`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/app/signup/page.tsx
git commit -m "feat(promo): add PromoCodeInput to signup page, remove cyan banner"
```

---

## Task 5: Integrate in onboarding

**Files:**
- Modify: `frontend-next/src/app/onboarding/page.tsx`

- [ ] **Step 1: Make TOTAL_STEPS dynamic**

Replace `const TOTAL_STEPS = 6;` with logic that checks if a code is already present:
```typescript
const hasExistingCode = typeof window !== "undefined" && (
  !!document.cookie.split("; ").find(r => r.startsWith("huntzen_referral_code=")) ||
  localStorage.getItem("huntzen_referral_registered") === "1"
);
const TOTAL_STEPS = hasExistingCode ? 6 : 7;
```

- [ ] **Step 2: Add promo code step (step 6) before plans**

Insert new step 6 JSX. Shift plans step to 7. Update `canProceed`, `handleComplete`, and navigation logic.

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/app/onboarding/page.tsx
git commit -m "feat(promo): add conditional promo code step in onboarding"
```

---

## Task 6: Auth-context promo code handling

**Files:**
- Modify: `frontend-next/src/contexts/auth-context.tsx`

- [ ] **Step 1: Extend SIGNED_IN handler**

After existing referral registration block (~line 179), add promo code handling:
```typescript
// If code is NOT a referral (not HZN-XXXXXX), apply as promo
if (refCode && !/^HZN-[A-Z0-9]{6}$/.test(refCode) && !alreadyRegistered) {
  fetch(`${backendUrl}/api/codes/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code: refCode }),
  })
    .then((res) => {
      if (res.ok) {
        document.cookie = "huntzen_referral_code=; path=/; max-age=0";
        localStorage.removeItem("huntzen_referral_code");
        localStorage.setItem("huntzen_referral_registered", "1");
      }
    })
    .catch(() => {});
}
```

- [ ] **Step 2: TypeScript check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend-next/src/contexts/auth-context.tsx
git commit -m "feat(promo): handle promo codes at SIGNED_IN in auth-context"
```

---

## Task 7: Stripe checkout integration

**Files:**
- Modify: `backend/src/api/routes/stripe.py`

- [ ] **Step 1: Read user_promo_codes in create-checkout-session**

In the `create-checkout-session` endpoint, before creating the Stripe session, check for unused promo codes:

```python
# Check for unused promo code
promo_discount = None
if user_id:
    promo_result = supabase.table("user_promo_codes").select(
        "id, promo_code_id, promo_codes(stripe_coupon_id, discount_type, discount_value, plan)"
    ).eq("user_id", user_id).is_("used_at", "null").limit(1).execute()

    if promo_result.data:
        promo_link = promo_result.data[0]
        promo = promo_link.get("promo_codes", {})
        if promo.get("stripe_coupon_id"):
            promo_discount = {
                "link_id": promo_link["id"],
                "coupon_id": promo.get("stripe_coupon_id"),
            }
```

Then when creating the Stripe checkout session, add:
```python
checkout_params = { ... }
if promo_discount:
    checkout_params["discounts"] = [{"coupon": promo_discount["coupon_id"]}]
    # Mark as used
    supabase.table("user_promo_codes").update(
        {"used_at": datetime.now(UTC).isoformat()}
    ).eq("id", promo_discount["link_id"]).execute()
```

- [ ] **Step 2: Lint**

Run: `ruff check backend/src/api/routes/stripe.py --ignore E501`

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/stripe.py
git commit -m "feat(promo): apply promo code coupon at Stripe checkout"
```

---

## Task 8: Admin CRUD endpoints for promo codes

**Files:**
- Modify: `backend/src/api/routes/admin.py`

- [ ] **Step 1: Add admin endpoints**

Add to admin.py:
- `GET /api/admin/promo-codes` : list all promo codes with usage stats
- `POST /api/admin/promo-codes` : create a new promo code
- `PATCH /api/admin/promo-codes/{id}` : toggle active, update fields
- `DELETE /api/admin/promo-codes/{id}` : delete

- [ ] **Step 2: Lint**

Run: `ruff check backend/src/api/routes/admin.py --ignore E501`

- [ ] **Step 3: Commit**

```bash
git add backend/src/api/routes/admin.py
git commit -m "feat(promo): add admin CRUD endpoints for promo codes"
```

---

## Task 9: Admin UI for promo codes

**Files:**
- Create: `frontend-next/src/app/admin/promo-codes/page.tsx`
- Create: `frontend-next/src/hooks/admin/use-admin-promo-codes.ts`

- [ ] **Step 1: Create admin hook**

Hook with `fetchPromoCodes`, `createPromoCode`, `updatePromoCode`, `deletePromoCode` using `adminFetch()` pattern from existing admin hooks.

- [ ] **Step 2: Create admin page**

Table with columns: Code, Description, Type, Valeur, Plan, Utilisations, Campagne, Dates, Statut, Actions.
Dialog for creating new codes.

- [ ] **Step 3: TypeScript + ESLint check**

Run: `npx tsc --noEmit && npx next lint --dir src`

- [ ] **Step 4: Commit**

```bash
git add frontend-next/src/app/admin/promo-codes/page.tsx frontend-next/src/hooks/admin/use-admin-promo-codes.ts
git commit -m "feat(promo): add admin UI for promo code management"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full lint check**

Run: `ruff check backend/src --ignore E501 && cd frontend-next && npx tsc --noEmit && npx next lint --dir src`

- [ ] **Step 2: Test flow manually**

1. Create a promo code via admin panel
2. Go to /signup → click "Vous avez un code ?" → type the code → verify validation
3. Complete signup → verify code applied in user_promo_codes table
4. Go to checkout → verify Stripe session has the coupon discount
5. Test with referral code (HZN-XXXXXX) → verify existing flow still works
6. Test Google OAuth → verify code survives redirect
7. Test onboarding → verify step appears when no code, skips when code present

- [ ] **Step 3: Final commit**

```bash
git commit -m "feat(promo): complete promo/referral code input system"
```
