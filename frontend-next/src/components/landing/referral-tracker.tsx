"use client";

import { useEffect } from "react";

export function ReferralTracker() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && /^[a-zA-Z0-9_-]{3,32}$/.test(ref)) {
      document.cookie = `huntzen_referral_code=${ref}; path=/; max-age=604800; SameSite=Lax`;
    }
  }, []);
  return null;
}
