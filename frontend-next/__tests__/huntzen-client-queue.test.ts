import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HuntzenApiClient,
  HuntzenApiError,
} from "@/lib/api/huntzen-client";

describe("HuntzenApiClient queue polling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("arrête immédiatement le polling sur une erreur cliente permanente", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Job not found or expired" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HuntzenApiClient("https://api.test");

    await expect(
      api.waitForJobResult("missing-job", 30, undefined, 20, 1),
    ).rejects.toThrow("Ce traitement a expiré");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conserve le statut HTTP des erreurs API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Accès refusé" }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const api = new HuntzenApiClient("https://api.test");

    await expect(
      api.waitForJobResult("foreign-job", 30, undefined, 20, 1),
    ).rejects.toBeInstanceOf(HuntzenApiError);
  });

  it("conserve les contextes CV et offre des méthodes historiques", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, response: "OK", agent: "cv-adapter" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HuntzenApiClient("https://api.test");

    await api.sendCVAdapterMessage(
      "Adapte mon CV",
      "session-123",
      {
        personal_info: {
          name: "Camille",
          email: "camille@example.com",
          phone: "+33123456789",
          location: "Paris",
        },
      },
      "Offre Data Analyst",
      "token-123",
    );

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: "Adapte mon CV",
      cv_data: {
        personal_info: {
          name: "Camille",
          email: "camille@example.com",
          phone: "+33123456789",
          location: "Paris",
        },
      },
      job_description: "Offre Data Analyst",
    });
  });

  it("annule aussi la requête de statut lors d'une navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
      ),
    );
    const api = new HuntzenApiClient("https://api.test");
    const controller = new AbortController();
    const polling = api.waitForJobResult(
      "job-123",
      30,
      "token",
      120_000,
      3_000,
      undefined,
      controller.signal,
    );

    controller.abort();

    await expect(polling).rejects.toMatchObject({ name: "AbortError" });
  });
});
