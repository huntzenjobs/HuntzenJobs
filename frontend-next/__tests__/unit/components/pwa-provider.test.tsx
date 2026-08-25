import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const { registerWorker } = vi.hoisted(() => ({
  registerWorker: vi.fn(),
}));

vi.mock("@serwist/turbopack/react", () => ({
  SerwistProvider: ({ children }: { children: ReactNode }) => children,
  useSerwist: () => ({ serwist: { register: registerWorker } }),
}));

import {
  PwaProvider,
  shouldDisablePwa,
} from "@/components/providers/pwa-provider";

describe("PwaProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    registerWorker.mockClear();
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
  });

  it("désactive Serwist sur les hôtes Vercel de préproduction", () => {
    expect(shouldDisablePwa("staging.huntzenjobs.com")).toBe(true);
    expect(shouldDisablePwa("huntzen-preview-abc.vercel.app")).toBe(true);
    expect(shouldDisablePwa("huntzenjobs.com")).toBe(false);
  });

  it("retire seulement l'ancien worker et ses caches avant l'enregistrement Serwist", async () => {
    const unregisterLegacy = vi.fn().mockResolvedValue(true);
    const unregisterSerwist = vi.fn().mockResolvedValue(true);
    const deleteCache = vi.fn().mockResolvedValue(true);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([
          {
            active: {
              scriptURL: "https://huntzenjobs.com/serwist/sw.js",
            },
            waiting: { scriptURL: "https://huntzenjobs.com/sw.js" },
            unregister: unregisterLegacy,
          },
          {
            active: { scriptURL: "https://huntzenjobs.com/serwist/sw.js" },
            unregister: unregisterSerwist,
          },
        ]),
      },
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { delete: deleteCache },
    });

    render(
      <PwaProvider>
        <div>contenu</div>
      </PwaProvider>,
    );

    await waitFor(() => expect(registerWorker).toHaveBeenCalledOnce());
    expect(unregisterLegacy).toHaveBeenCalledOnce();
    expect(unregisterSerwist).not.toHaveBeenCalled();
    expect(deleteCache).toHaveBeenCalledTimes(7);
    expect(deleteCache).toHaveBeenCalledWith("api-cache");
    expect(deleteCache).toHaveBeenCalledWith("pages-rsc");
  });

  it("supprime les caches legacy même si l'ancien worker a déjà disparu", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn().mockResolvedValue([]) },
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { delete: deleteCache },
    });

    render(
      <PwaProvider>
        <div>contenu</div>
      </PwaProvider>,
    );

    await waitFor(() => expect(registerWorker).toHaveBeenCalledOnce());
    expect(deleteCache).toHaveBeenCalledTimes(7);
  });

  it("ne recommence pas le nettoyage après une migration réussie", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    localStorage.setItem("huntzen_pwa_serwist_migration_v1", "complete");
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { getRegistrations: vi.fn() },
    });
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: { delete: deleteCache },
    });

    render(
      <PwaProvider>
        <div>contenu</div>
      </PwaProvider>,
    );

    await waitFor(() => expect(registerWorker).toHaveBeenCalledOnce());
    expect(navigator.serviceWorker.getRegistrations).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
  });

  it("enregistre Serwist même si le nettoyage legacy doit être retenté", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistrations: vi
          .fn()
          .mockRejectedValue(new Error("Cache Storage indisponible")),
      },
    });

    render(
      <PwaProvider>
        <div>contenu</div>
      </PwaProvider>,
    );

    await waitFor(() => expect(registerWorker).toHaveBeenCalledOnce());
    expect(localStorage.getItem("huntzen_pwa_serwist_migration_v1")).toBeNull();
  });
});
