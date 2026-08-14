import { shouldUseNetworkOnly } from "@/lib/pwa/cache-policy";
import * as cachePolicy from "@/lib/pwa/cache-policy";

describe("politique de cache PWA", () => {
  it.each([
    "/api/auth/me",
    "/api/subscription/current",
    "/dashboard",
    "/profile",
    "/jobs",
    "/login",
  ])("garde %s strictement sur le réseau", (pathname) => {
    expect(shouldUseNetworkOnly(pathname)).toBe(true);
  });

  it.each(["/", "/about", "/faq", "/pricing", "/offline"])(
    "garde aussi la navigation publique %s sur le réseau",
    (pathname) => {
      expect(shouldUseNetworkOnly(pathname)).toBe(true);
    },
  );

  it("identifie uniquement l'ancien worker racine à retirer", () => {
    const isLegacyServiceWorkerScript = (
      cachePolicy as typeof cachePolicy & {
        isLegacyServiceWorkerScript?: (scriptUrl: string) => boolean;
      }
    ).isLegacyServiceWorkerScript;

    expect(isLegacyServiceWorkerScript).toBeTypeOf("function");
    expect(isLegacyServiceWorkerScript?.("https://huntzenjobs.com/sw.js")).toBe(
      true,
    );
    expect(
      isLegacyServiceWorkerScript?.(
        "https://huntzenjobs.com/serwist/sw.js",
      ),
    ).toBe(false);
  });
});
