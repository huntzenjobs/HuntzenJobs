"use client";

import {
  SerwistProvider,
  useSerwist,
} from "@serwist/turbopack/react";
import { useEffect, useRef, type ReactNode } from "react";
import { isLegacyServiceWorkerScript } from "@/lib/pwa/cache-policy";

const LEGACY_SENSITIVE_CACHES = [
  "api-cache",
  "apis",
  "next-data",
  "others",
  "pages",
  "pages-rsc",
  "pages-rsc-prefetch",
];
const LEGACY_CLEANUP_KEY = "huntzen_pwa_serwist_migration_v1";

interface PwaRegistrationProps {
  children: ReactNode;
  disabled: boolean;
}

async function purgeDisabledPwa(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations.map((registration) => registration.unregister()),
    );

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  } catch {
    // Les navigateurs sans Service Worker/Cache Storage n'ont rien à purger.
  }
}

export function PwaRegistration({
  children,
  disabled,
}: PwaRegistrationProps) {
  const { serwist } = useSerwist();
  const registrationStarted = useRef(false);

  useEffect(() => {
    if (registrationStarted.current) return;

    if (disabled) {
      registrationStarted.current = true;
      void purgeDisabledPwa();
      return;
    }

    if (!serwist) return;
    registrationStarted.current = true;
    const serwistManager = serwist;

    async function replaceLegacyWorker(): Promise<void> {
      try {
        if (localStorage.getItem(LEGACY_CLEANUP_KEY) !== "complete") {
          const registrations =
            await navigator.serviceWorker.getRegistrations();
          const legacyRegistrations = registrations.filter((registration) =>
            [
              registration.active?.scriptURL,
              registration.waiting?.scriptURL,
              registration.installing?.scriptURL,
            ].some(
              (scriptUrl) =>
                scriptUrl !== undefined &&
                isLegacyServiceWorkerScript(scriptUrl),
            ),
          );

          await Promise.all(
            legacyRegistrations.map((registration) =>
              registration.unregister(),
            ),
          );
          await Promise.all(
            LEGACY_SENSITIVE_CACHES.map((cacheName) =>
              caches.delete(cacheName),
            ),
          );
          localStorage.setItem(LEGACY_CLEANUP_KEY, "complete");
        }
      } catch {
        // Le nettoyage sera retenté au prochain chargement.
      } finally {
        await serwistManager.register();
      }
    }

    void replaceLegacyWorker();
  }, [disabled, serwist]);

  return children;
}

export interface PwaProviderProps {
  children: ReactNode;
  /**
   * La PWA reste désactivée tant que la recette d'hydratation production n'est
   * pas stabilisée. Cela garantit le même arbre lors du rendu serveur et client.
   */
  disabled?: boolean;
}

export function shouldDisablePwa(hostname: string): boolean {
  return (
    hostname === "staging.huntzenjobs.com" ||
    hostname.endsWith(".vercel.app")
  );
}

export function PwaProvider({ children, disabled = true }: PwaProviderProps) {

  return (
    <SerwistProvider
      swUrl="/serwist/sw.js"
      cacheOnNavigation={false}
      disable={disabled}
      register={false}
    >
      <PwaRegistration disabled={disabled}>
        {children}
      </PwaRegistration>
    </SerwistProvider>
  );
}
