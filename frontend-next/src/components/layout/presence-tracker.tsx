"use client";

import { usePresence } from "@/hooks/use-presence";

export function PresenceTracker({
  page,
  feature,
}: {
  page: string;
  feature?: string;
}) {
  usePresence(page, feature);
  return null;
}
