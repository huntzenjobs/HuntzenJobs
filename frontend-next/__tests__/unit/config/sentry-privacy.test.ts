import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sentrySpies = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn((options: Record<string, unknown>) => ({
    name: "Replay",
    options,
  })),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  breadcrumbsIntegration: vi.fn(() => ({ name: "Breadcrumbs" })),
  httpIntegration: vi.fn(() => ({ name: "Http" })),
}));

vi.mock("@sentry/nextjs", () => sentrySpies);

describe("configuration Sentry navigateur", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("masque les textes, les saisies et les médias avant tout Session Replay", async () => {
    await import("../../../sentry.client.config");

    expect(sentrySpies.replayIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    );
  });

  it("étiquette le Custom Environment Vercel comme staging", async () => {
    await import("../../../sentry.client.config");

    expect(sentrySpies.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "staging" }),
    );
  });

  it.each([
    ["serveur", "../../../sentry.server.config"],
    ["edge", "../../../sentry.edge.config"],
  ])("étiquette le runtime %s comme staging", async (_runtime, modulePath) => {
    await import(modulePath);

    expect(sentrySpies.init).toHaveBeenCalledWith(
      expect.objectContaining({ environment: "staging" }),
    );
  });
});
