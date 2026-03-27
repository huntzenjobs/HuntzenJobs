"use client";

import { useEffect } from "react";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || "";

export function ReferralTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && /^HZN-[A-Z0-9]{6}$/.test(ref)) {
      // Store referral code in cookie (30 days, aligned with middleware)
      document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=2592000; SameSite=Lax`;
      // Also store in localStorage as backup (survives Google OAuth redirect)
      localStorage.setItem("huntzen_referral_code", ref);

      // Fire-and-forget: notify backend of referral click
      if (BACKEND_URL) {
        fetch(`${BACKEND_URL}/api/referrals/track-click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: ref }),
        }).catch(() => {
          // Silently ignore — tracking failure must not block rendering
        });
      }
    }
  }, []);
  return null;
}
