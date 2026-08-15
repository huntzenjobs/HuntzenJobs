import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFreemiumLimits } from "@/hooks/use-freemium-limits";

function LimitsProbe() {
  const { limits } = useFreemiumLimits();
  return <span>{limits.ats_scores_per_day}</span>;
}

describe("useFreemiumLimits hydration", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("conserve le même premier rendu côté serveur et côté client malgré le cache", async () => {
    localStorage.setItem(
      "plans_config_cache:fr",
      JSON.stringify({
        data: [
          { name: "free", limits: { ats_scores_per_day: 99 } },
          { name: "starter", limits: {} },
          { name: "pro", limits: {} },
          { name: "premium", limits: {} },
        ],
        expiry: Date.now() + 60_000,
      }),
    );

    const browserWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    let serverHtml: string;
    try {
      serverHtml = renderToString(<LimitsProbe />);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: browserWindow,
      });
    }

    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <LimitsProbe />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
      "Hydration failed",
    );

    await act(async () => root?.unmount());
  });
});
