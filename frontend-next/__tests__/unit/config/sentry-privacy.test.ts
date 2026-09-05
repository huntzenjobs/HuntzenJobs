import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const sentrySpies = vi.hoisted(() => ({
  init: vi.fn(),
  replayIntegration: vi.fn((options: Record<string, unknown>) => ({
    name: "Replay",
    options,
  })),
  browserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  breadcrumbsIntegration: vi.fn(() => ({ name: "Breadcrumbs" })),
  httpIntegration: vi.fn(() => ({ name: "Http" })),
  captureRequestError: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentrySpies);

describe("configuration Sentry navigateur", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_ENVIRONMENT", "staging");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "release-abc123");
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("masque les textes, les saisies et les médias avant tout Session Replay", async () => {
    await import("../../../instrumentation-client");

    const replayOptions = sentrySpies.replayIntegration.mock.calls[0]?.[0] as {
      maskAllText: boolean;
      maskAllInputs: boolean;
      blockAllMedia: boolean;
      beforeAddRecordingEvent: <T>(event: T) => T;
    };

    expect(replayOptions).toEqual(
      expect.objectContaining({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    );
    expect(
      JSON.stringify(
        replayOptions.beforeAddRecordingEvent({
          data: {
            href: "https://huntzenjobs.com/auth/callback?token=secret-token",
            payload: {
              category: "console",
              message: "CV privé affiché dans la console",
              data: { arguments: ["CV complet très privé"] },
            },
            request: { body: "motivation confidentielle" },
            response: { body: "réponse personnelle" },
          },
        }),
      ),
    ).not.toMatch(
      /secret-token|CV privé|CV complet|motivation confidentielle|réponse personnelle/,
    );
  });

  it("étiquette le Custom Environment Vercel comme staging", async () => {
    await import("../../../instrumentation-client");

    expect(sentrySpies.init).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: "staging",
        beforeSendTransaction: expect.any(Function),
      }),
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

  it("retire les contenus utilisateur et secrets avant l'envoi", async () => {
    await import("../../../instrumentation-client");
    const options = sentrySpies.init.mock.calls[0]?.[0] as {
      beforeSend: (
        event: Record<string, unknown>,
        hint: Record<string, unknown>,
      ) => Record<string, unknown> | null;
      beforeSendTransaction?: (event: Record<string, unknown>) => Record<string, unknown>;
      defaultIntegrations?: boolean;
      release?: string;
    };

    const result = options.beforeSend(
      {
        user: { id: "user-private", email: "personne@example.com" },
        request: {
          url: "https://huntzenjobs.com/auth?token=secret-token",
          headers: { authorization: "Bearer secret-token" },
          data: { cv_text: "contenu confidentiel du CV" },
        },
        extra: { job_description: "offre confidentielle" },
        contexts: {
          diagnostic: {
            apiKey: "camel-provider-secret",
            accessToken: "camel-access-token",
            SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
            DATABASE_URL: "postgresql://user:password@db.example.test/app",
          },
        },
        exception: {
          values: [
            {
              type: "RuntimeError",
              value:
                "CV privé 11111111-1111-1111-1111-111111111111 depuis 203.0.113.4",
              stacktrace: {
                frames: [
                  {
                    filename: "worker.ts",
                    vars: { final_cv_text: "CV complet très privé" },
                  },
                ],
              },
            },
          ],
        },
        breadcrumbs: [
          {
            category: "support",
            message:
              "CV privé 11111111-1111-1111-1111-111111111111 depuis 203.0.113.4",
          },
        ],
        message: "CV privé envoyé depuis 203.0.113.4",
      },
      {},
    );
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("personne@example.com");
    expect(serialized).not.toContain("user-private");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("contenu confidentiel du CV");
    expect(serialized).not.toContain("offre confidentielle");
    expect(serialized).not.toContain("camel-provider-secret");
    expect(serialized).not.toContain("camel-access-token");
    expect(serialized).not.toContain("service-role-secret");
    expect(serialized).not.toContain("postgresql://user:password");
    expect(serialized).not.toContain("11111111-1111-1111-1111-111111111111");
    expect(serialized).not.toContain("203.0.113.4");
    expect(serialized).not.toContain("CV privé");
    expect(serialized).not.toContain("CV complet très privé");
    expect(options.defaultIntegrations).not.toBe(false);
    expect(options.release).toBeUndefined();
    expect(options.beforeSendTransaction).toBeDefined();
  });

  it("charge la configuration navigateur depuis instrumentation-client", () => {
    const instrumentationClientPath = path.join(
      process.cwd(),
      "instrumentation-client.ts",
    );

    expect(existsSync(instrumentationClientPath)).toBe(true);
  });

  it("expose le hook de navigation App Router depuis instrumentation-client", async () => {
    const instrumentationClient = await import("../../../instrumentation-client");

    expect(instrumentationClient.onRouterTransitionStart).toBe(
      sentrySpies.captureRouterTransitionStart,
    );
  });

  it("ne charge pas la configuration navigateur depuis le layout serveur", () => {
    const layoutSource = readFileSync(
      path.join(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(layoutSource).not.toContain("sentry.client.config");
  });

  it("branche la capture des erreurs serveur Next.js sur Sentry", async () => {
    const instrumentation = await import("../../../instrumentation");

    expect(instrumentation.onRequestError).toBe(sentrySpies.captureRequestError);
  });
});
